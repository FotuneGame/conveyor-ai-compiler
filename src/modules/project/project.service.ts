import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { join, dirname } from "path";
import { rmSync, mkdirSync, existsSync, writeFileSync } from "fs";
import { WinstonService } from "../../shared/logger/winston.service";
import { GitLabService } from "../gitlab/gitlab.service";
import { TemplateService } from "../template/template.service";
import { StoreService } from "../store/store.service";
import type { TempProjectType, CreateTempProjectType, CompileResultType, ContainerLogsType } from "./types";



@Injectable()
export class ProjectService {
  private readonly prefix: string;
  private readonly tempDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly winstonService: WinstonService,
    private readonly gitLabService: GitLabService,
    private readonly templateService: TemplateService,
    private readonly storeService: StoreService,
  ) {
    this.prefix = this.configService.get<string>("core.compiler.name", "compiler-typescript");
    this.tempDir = this.configService.get<string>("core.compiler.tempDir", "./tmp/compiler-projects");
  }

  async createTempProject(data: CreateTempProjectType): Promise<TempProjectType> {
    const { model, graph, nodes, dataTypes, nodeTypes, protocolTypes, customEnv } = data;
    const id = randomUUID();
    const path = join(this.tempDir, id);
    
    this.ensureDir(path);
    
    const files = this.templateService.generateFiles({ model, graph, nodes, dataTypes, nodeTypes, protocolTypes });
    for (const file of files) {
      const fullPath = join(path, file.path);
      let content = file.path === ".env" && customEnv 
        ? this.templateService.patchEnvFile(file.content, customEnv)
        : file.content;
      this.writeFile(fullPath, content);
    }

    const project: TempProjectType = {
      id, path, graphId: graph.id, modelId: model.id,
      containerName: `${this.prefix}-${id}`,
      imageName: `${this.prefix}-${id}:latest`,
      createdAt: new Date(),
    };
    this.storeService.set(id, project);
    return project;
  }

  async compileProject(projectId: string): Promise<CompileResultType> {
    const project = this.storeService.get(projectId);
    if (!project) return this.errorResult(projectId, "Project not found");

    try {
      const projectName = this.getName(project.modelId, project.graphId);
      
      // Создаём/находим проект в GitLab
      const gitLabProject = await this.gitLabService.createProject({
        name: projectName,
        description: `Compiler project for model ${project.modelId}`,
        visibility: "private",
      });
      
      project.gitLabProjectId = gitLabProject.id;
      this.storeService.set(projectId, project);

      // Пушим код и запускаем пайплайн
      await this.gitLabService.pushToRepository(project.path, gitLabProject.id, gitLabProject.httpUrlToRepo);
      const pipeline = await this.gitLabService.createPipeline(gitLabProject.id, "main");
      
      project.gitLabPipelineId = pipeline.id;
      await this.cleanupTempFiles(projectId);

      return {
        success: true, projectId: project.id, projectPath: project.path,
        containerName: project.containerName, imageName: project.imageName,
        gitLabProjectId: gitLabProject.id, gitLabPipelineId: pipeline.id,
      };
    } catch (error: any) {
      this.winstonService.error(`Compile failed: ${error?.message || error}`);
      await this.cleanupTempFiles(projectId);
      return this.errorResult(projectId, error?.message || "Unknown error");
    }
  }

  async stopProject(projectId: string): Promise<boolean> {
    const project = this.storeService.get(projectId);
    if (!project?.gitLabProjectId) return false;

    try {
      await this.gitLabService.createPipeline(
        project.gitLabProjectId, 
        "main", 
        { STOP_CONTAINER: "true" }
      );
      await new Promise(r => setTimeout(r, 2000));
      
      await this.cleanupProject(projectId);
      return true;
    } catch (error) {
      this.winstonService.error(`Stop failed: ${error}`);
      return false;
    }
  }

  async getContainerLogs(modelId: number, graphId: number): Promise<ContainerLogsType | null> {
    const project = await this.findProjectByModelAndGraph(modelId, graphId);
    if (!project?.gitLabProjectId) return null;

    let pipelineId = project.gitLabPipelineId;
    if (!pipelineId) {
      const latestPipeline = await this.gitLabService.getLatestPipeline(project.gitLabProjectId);
      if (!latestPipeline) return null;
      pipelineId = latestPipeline.id;
    }

    try {
      const jobs = await this.gitLabService.getPipelineJobs(project.gitLabProjectId, pipelineId);
      const jobsWithLogs = await Promise.all(
        jobs.map(async job => ({
          id: job.id,
          name: job.name,
          status: job.status,
          logs: await this.gitLabService.getJobTrace(project.gitLabProjectId!, job.id),
        }))
      );
      
      return { pipelineId, jobs: jobsWithLogs };
    } catch (error) {
      this.winstonService.error(`Failed to fetch logs: ${error}`);
      return null;
    }
  }

  async cleanupProject(projectId: string): Promise<void> {
    if (projectId.startsWith('gitlab-')) return;
    
    const project = this.storeService.get(projectId);
    if (!project) return;
    await this.cleanupTempFiles(projectId);
    this.storeService.delete(projectId);
  }

  async cleanupTempFiles(projectId: string): Promise<void> {
    const keepTempFiles = this.configService.get<boolean>("core.compiler.keepTempFiles", false);
    if (keepTempFiles) return;
    
    const project = this.storeService.get(projectId);
    if (project?.path && existsSync(project.path)) {
      this.winstonService.debug(`Cleaning up temp files: ${project.path}`);
      rmSync(project.path, { recursive: true, force: true });
    }
  }

  async findProjectByModelAndGraph(modelId: number, graphId: number): Promise<TempProjectType | null> {
    let project = this.storeService.findProjectByModelAndGraph(modelId, graphId);
    if (project?.gitLabProjectId) {
      return project;
    }
    
    const projectName = this.getName(modelId, graphId);
    const gitLabProject = await this.gitLabService.findProjectByName(projectName);
    
    if (!gitLabProject) {
      this.winstonService.debug(`Project not found in GitLab: ${projectName}`);
      return null;
    }
    
    const virtualProject: TempProjectType = {
      id: `gitlab-${gitLabProject.id}`,
      path: '',
      graphId,
      modelId,
      containerName: `${this.prefix}-${modelId}-${graphId}`,
      imageName: `${this.prefix}-${modelId}-${graphId}:latest`,
      createdAt: new Date(),
      gitLabProjectId: gitLabProject.id,
    };
    
    this.winstonService.debug(`Found project in GitLab: ${projectName}`);
    return virtualProject;
  }

  

  getName(modelId: number, graphId: number) { return `${this.prefix}-${modelId}-${graphId}`}
  getProject(projectId: string) { return this.storeService.get(projectId); }
  getAllProjects() { return Object.values(this.storeService.getAll()); }



  private ensureDir(path: string) { if (!existsSync(path)) mkdirSync(path, { recursive: true }); }
  private writeFile(fullPath: string, content: string) {
    const dir = dirname(fullPath);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content);
  }
  private errorResult(projectId: string, error: string): CompileResultType {
    const p = this.storeService.get(projectId);
    return { success: false, projectId, projectPath: p?.path ?? "", containerName: p?.containerName ?? "", imageName: p?.imageName ?? "", error };
  }
}