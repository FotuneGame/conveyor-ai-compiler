import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { join, dirname } from "path";
import { rmSync, mkdirSync, existsSync, writeFileSync } from "fs";
import { WinstonService } from "../../shared/logger/winston.service";
import { GitLabService } from "../gitlab/gitlab.service";
import { TemplateService } from "../template/template.service";
import { StoreService } from "../store/store.service";
import type { ProjectType} from "./types";
import type { CompileRequestType, CompileResultType, ContainerLogsType } from "../compiler/types";



@Injectable()
export class ProjectService {
  private readonly prefix: string;
  private readonly tempDir: string;
  private readonly registry: string;
  private readonly keepTemp: boolean;
  private readonly backendUrl: string;
  private readonly compilerSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly winstonService: WinstonService,
    private readonly gitLabService: GitLabService,
    private readonly templateService: TemplateService,
    private readonly storeService: StoreService,
  ) {
    this.prefix = this.configService.get<string>("core.compiler.name", "compiler-typescript");
    this.tempDir = this.configService.get<string>("core.compiler.tempDir", "./tmp/compiler-projects");
    this.registry = this.configService.get<string>("core.gitlab.registry", "http://localhost:8081");
    this.keepTemp = this.configService.get<boolean>("core.compiler.keepTempFiles", false);
    this.backendUrl = this.configService.get<string>("backend.baseUrl", "http://localhost:5000");
    this.compilerSecret = this.configService.get<string>("COMPILER_SECRET", "test-compiler-secret");
  }

  async createTempProject(data: CompileRequestType): Promise<ProjectType> {
    const id = randomUUID();
    const path = join(this.tempDir, id);
    this.ensureDir(path);

    let gitLabProjectId = data.gitlab?.id;
    let gitLabProjectPath = data.gitlab?.project?.path;

    if (!gitLabProjectId || !gitLabProjectPath) {
      const projectName = this.getProjectName(data.model.id, data.graph.id);
      const gitLabProject = await this.gitLabService.createProject({
        name: projectName,
        description: `Compiler project for model ${data.model.id}`,
        visibility: "private",
      });
      gitLabProjectId = gitLabProject.id;
      gitLabProjectPath = gitLabProject.path;

      await this.gitLabService.setProjectVariables(gitLabProjectId, [
        { key: 'COMPILER_SECRET', value: this.compilerSecret, protected: false, masked: false, raw: true },
        { key: 'BACKEND_URL', value: this.backendUrl, protected: false, masked: false, raw: true },
      ]);
    }

    const templateContext = {
      ...data,
      gitlab: {
        project: {
          path: gitLabProjectPath,
        },
      },
    };

    for (const file of this.templateService.generateFiles(templateContext)) {
      const fullPath = join(path, file.path);
      this.writeFile(fullPath, file.content);
    }

    const project: ProjectType = {
      id,
      path,
      graphId: data.graph.id,
      modelId: data.model.id,
      containerName: `${this.prefix}-${id}`,
      imageName: `${this.prefix}-${id}:latest`,
      createdAt: new Date(),
      gitlab: {
        project: {
          id: gitLabProjectId,
          path: gitLabProjectPath,
        },
      },
    };

    this.storeService.set(id, project);
    return project;
  }

  async compileProject(projectId: string): Promise<CompileResultType> {
    const project = await this.getTempProject(projectId);
    if (!project) return this.errorResult(projectId, "Project not found");

    try {
      const gitLabProjectId = project.gitlab?.project?.id!;
      const gitLabProjectPath = project.gitlab?.project?.path!;

      const gitLabUrl = this.configService.get<string>('core.gitlab.url', 'http://localhost:8080');
      await this.gitLabService.pushToRepository(project.path, gitLabProjectId, `${gitLabUrl}/${gitLabProjectPath}.git`);
      
      let pipeline = await this.gitLabService.getLatestPipeline(gitLabProjectId);
      if(!pipeline){
        pipeline = await this.gitLabService.createPipeline(gitLabProjectId, 'main')
      }

      await this.cleanupProject(projectId);

      return {
        success: true,
        projectId: project.id,
        projectPath: project.path,
        containerName: project.containerName,
        imageName: `${this.registry}/${gitLabProjectPath}`,
        gitlab: {
          projectId: gitLabProjectId,
          pipelineId: pipeline.id,
        },
      };
    } catch (err: any) {
      this.winstonService.error(`Compile failed: ${err?.message || err}`);
      await this.cleanupProject(projectId);
      return this.errorResult(projectId, err?.message || "Unknown error");
    }
  }

  async stopProject(modelId: number, graphId: number): Promise<boolean> {
    const project = await this.findProjectByModelAndGraph(modelId, graphId);
    if (!project?.gitlab?.project?.id) return false;

    try {
      await this.gitLabService.createPipeline(project.gitlab.project.id, "main", { STOP_CONTAINER: "true" });
      await new Promise((r) => setTimeout(r, 2000));
      return true;
    } catch (err) {
      this.winstonService.error(`Stop failed: ${err}`);
      return false;
    }
  }

  async getContainerLogs(modelId: number, graphId: number): Promise<ContainerLogsType | null> {
    const project = await this.findProjectByModelAndGraph(modelId, graphId);
    if (!project?.gitlab?.project?.id) return null;

    const gitLabProjectId = project.gitlab.project.id;
    const pipeline = await this.gitLabService.getLatestPipeline(gitLabProjectId);
    if (!pipeline) return null;

    const pipelineId = pipeline.id;

    try {
      const jobs = await this.gitLabService.getPipelineJobs(gitLabProjectId, pipelineId);
      const jobsWithLogs = await Promise.all(
        jobs.map(async (job) => ({
          id: job.id,
          name: job.name,
          status: job.status,
          logs: await this.gitLabService.getJobTrace(gitLabProjectId, job.id),
        }))
      );
      return { pipelineId, jobs: jobsWithLogs };
    } catch (err) {
      this.winstonService.error(`Failed to fetch logs: ${err}`);
      return null;
    }
  }

  async findProjectByModelAndGraph(modelId: number, graphId: number): Promise<ProjectType | null> {
    const stored = this.storeService.findProjectByModelAndGraph(modelId, graphId);
    if (stored?.gitlab?.project?.id) return stored;

    const projectName = this.getProjectName(modelId, graphId);
    const gitLabProject = await this.gitLabService.findProjectByName(projectName);
    
    if (gitLabProject) {
      return {
        id: `gitlab-${gitLabProject.id}`,
        path: "",
        graphId: modelId,
        modelId,
        containerName: `${this.prefix}-${modelId}-${graphId}`,
        imageName: `${this.prefix}-${modelId}-${graphId}:latest`,
        createdAt: new Date(),
        gitlab: {
          project: {
            id: gitLabProject.id,
            path: gitLabProject.path,
          },
        },
      };
    }

    const gitLabProjectNew = await this.gitLabService.createProject({
      name: projectName,
      description: `Compiler project for model ${modelId}`,
      visibility: "private",
    });

    await this.gitLabService.setProjectVariables(gitLabProjectNew.id, [
      { key: 'COMPILER_SECRET', value: this.compilerSecret, protected: false, masked: false, raw: true },
      { key: 'BACKEND_URL', value: this.backendUrl, protected: false, masked: false, raw: true },
    ]);

    return {
      id: `gitlab-${gitLabProjectNew.id}`,
      path: "",
      graphId: modelId,
      modelId,
      containerName: `${this.prefix}-${modelId}-${graphId}`,
      imageName: `${this.prefix}-${modelId}-${graphId}:latest`,
      createdAt: new Date(),
      gitlab: {
        project: {
          id: gitLabProjectNew.id,
          path: gitLabProjectNew.path,
        },
      },
    };
  }

  private async getTempProject(projectId: string): Promise<ProjectType | null> {
    const stored = this.storeService.get(projectId);
    if (stored) return stored;
    return null;
  }

  private async cleanupTempFiles(projectId: string): Promise<void> {
    if (this.keepTemp) return;
    const project = await this.getTempProject(projectId);
    if (project?.path && existsSync(project.path)) {
      this.winstonService.debug(`Cleaning up temp files: ${project.path}`);
      rmSync(project.path, { recursive: true, force: true });
    }
  }

  async cleanupProject(projectId: string): Promise<void> {
    await this.cleanupTempFiles(projectId);
    this.storeService.delete(projectId);
  }

  private getProjectName(modelId: number, graphId: number): string {
    return `${this.prefix}-${modelId}-${graphId}`;
  }

  private errorResult(projectId: string, error: string): CompileResultType {
    const p = this.storeService.get(projectId);
    return {
      success: false,
      projectId,
      projectPath: p?.path ?? "",
      containerName: p?.containerName ?? "",
      imageName: p?.imageName ?? "",
      error,
    };
  }

  private ensureDir(path: string) {
    if (!existsSync(path)) mkdirSync(path, { recursive: true });
  }

  private writeFile(fullPath: string, content: string) {
    const dir = dirname(fullPath);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content);
  }
}