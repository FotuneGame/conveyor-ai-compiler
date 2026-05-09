import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { join, dirname } from "path";
import { rmSync, mkdirSync, existsSync, writeFileSync } from "fs";
import { WinstonService } from "src/shared/logger/winston.service";
import { TerminalService } from "../terminal/terminal.service";
import { GitLabService } from "../gitlab/gitlab.service";
import { TemplateService } from "../template/template.service";
import { BackendService } from "../backend/backend.service";
import type { TempProjectType, CreateTempProjectType, CompileResultType, ContainerLogsType } from "./types";

@Injectable()
export class ProjectService {
  private readonly tempDir: string;
  private readonly projects = new Map<string, TempProjectType>();

  constructor(
    private readonly configService: ConfigService,
    private readonly winstonService: WinstonService,
    private readonly terminalService: TerminalService,
    private readonly gitLabService: GitLabService,
    private readonly templateService: TemplateService,
    private readonly backendService: BackendService,
  ) {
    this.tempDir = this.configService.get<string>("core.compiler.tempDir", "./tmp/compiler-projects");
  }

  async createTempProject(data: CreateTempProjectType): Promise<TempProjectType> {
    const { model, graph, nodes, dataTypes, nodeTypes, protocolTypes, customEnv } = data;
    const projectId = randomUUID();
    const projectPath = join(this.tempDir, projectId);
    
    this.winstonService.debug(`Creating temp project: ${projectId}`);
    this.ensureDir(projectPath);

    // 🔄 Генерируем файлы через TemplateService и записываем через ProjectService
    const files = this.templateService.generateFiles({ model, graph, nodes, dataTypes, nodeTypes, protocolTypes });
    
    for (const file of files) {
      const fullPath = join(projectPath, file.path);
      let content = file.content;
      
      if (file.path === ".env" && customEnv) {
        content = this.templateService.patchEnvFile(content, customEnv);
      }
      
      this.writeFile(fullPath, content);
    }

    const project: TempProjectType = {
      id: projectId,
      path: projectPath,
      graphId: String(graph.id),
      modelId: String(model.id),
      containerName: `compiler-${projectId}`,
      imageName: `compiler-${projectId}:latest`,
      createdAt: new Date(),
    };

    this.projects.set(projectId, project);
    return project;
  }

  async compileProject(projectId: string): Promise<CompileResultType> {
    const project = this.projects.get(projectId);
    if (!project) {
      return this.errorResult(projectId, "Project not found");
    }

    try {
      // 🔄 Синхронизируем с GitLab - сборка будет в CI/CD
      const gitLabProjectId = await this.syncToGitLabService(project);
      const pipelineId = await this.triggerPipelineService(project, gitLabProjectId);

      // Сохраняем pipelineId в проекте
      project.gitLabPipelineId = pipelineId;

      return {
        success: true,
        projectId: project.id,
        projectPath: project.path,
        containerName: project.containerName,
        imageName: project.imageName,
        gitLabProjectId,
        gitLabPipelineId: pipelineId,
      };
    } catch (error) {
      this.winstonService.error(`Compile failed for ${projectId}: ${error}`);
      await this.cleanupProject(projectId);
      return this.errorResult(projectId, error instanceof Error ? error.message : "Unknown error");
    }
  }

  async stopProject(projectId: string): Promise<boolean> {
    const project = this.projects.get(projectId);
    if (!project) {
      this.winstonService.warn(`Project ${projectId} not found for stopping`);
      return false;
    }

    this.winstonService.debug(`Stopping project: ${projectId}`);

    try {
      // 🔄 Останавливаем контейнер через GitLab CI/CD pipeline (cleanup stage)
      const gitLabProjectId = this.configService.get<number>("core.gitlab.projectId", 0);
      if (gitLabProjectId === 0) {
        this.winstonService.warn("GitLab project ID not configured, cannot stop container via GitLab");
        return false;
      }

      // Запускаем pipeline с cleanup stage через переменную STOP_CONTAINER
      await this.gitLabService.createPipeline(gitLabProjectId, "main", {
        STOP_CONTAINER: "true",
      });

      // Синхронизация с backend
      await this.syncCleanupWithBackend(project);

      this.projects.delete(projectId);
      return true;
    } catch (error) {
      this.winstonService.error(`Failed to stop project ${projectId}: ${error}`);
      return false;
    }
  }

  async getContainerLogs(modelId: number, graphId: number): Promise<ContainerLogsType | null> {
    const project = this.findProjectByModelAndGraph(modelId, graphId);

    if (!project) {
      this.winstonService.warn(`Project not found for model ${modelId} and graph ${graphId}`);
      return null;
    }

    if (!project.gitLabPipelineId) {
      this.winstonService.warn(`No pipeline ID found for project ${project.id}`);
      return null;
    }

    try {
      const gitLabProjectId = this.configService.get<number>("core.gitlab.projectId", 0);
      if (gitLabProjectId === 0) {
        this.winstonService.warn("GitLab project ID not configured");
        return null;
      }

      // Получаем jobs пайплайна
      const jobs = await this.gitLabService.getPipelineJobs(gitLabProjectId, project.gitLabPipelineId);

      const jobsWithLogs = await Promise.all(
        jobs.map(async (job) => {
          const logs = await this.gitLabService.getJobTrace(gitLabProjectId, job.id);
          return {
            id: job.id,
            name: job.name,
            status: job.status,
            logs,
          };
        })
      );

      return {
        pipelineId: project.gitLabPipelineId,
        jobs: jobsWithLogs,
      };
    } catch (error) {
      this.winstonService.error(`Failed to get container logs: ${error}`);
      return null;
    }
  }

  async cleanupProject(projectId: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) return;

    this.winstonService.debug(`Cleaning up project: ${projectId}`);

    // 🔄 Синхронизация состояния контейнеров с backend
    await this.syncCleanupWithBackend(project);

    if (existsSync(project.path)) {
      rmSync(project.path, { recursive: true, force: true });
    }

    this.projects.delete(projectId);
  }

  private async syncCleanupWithBackend(project: TempProjectType): Promise<void> {
    try {
      const modelId = parseInt(project.modelId, 10);
      const containers = await this.backendService.getContainers(modelId);

      if (containers?.data) {
        const backendContainer = containers.data.find((c) => c.name === project.containerName);
        if (backendContainer) {
          this.winstonService.debug(`Updating container ${backendContainer.id} to inactive in backend for model ${modelId}`);
          await this.backendService.updateContainer(modelId, backendContainer.id, { active: false });
        }
      }
    } catch (error) {
      this.winstonService.warn(`Failed to sync cleanup with backend: ${error}`);
    }
  }




  getProject(projectId: string): TempProjectType | undefined {
    return this.projects.get(projectId);
  }

  getAllProjects(): TempProjectType[] {
    return Array.from(this.projects.values());
  }

  findProjectByModelAndGraph(modelId: number, graphId: number): TempProjectType | undefined {
    for (const p of this.projects.values()) {
      if (p.modelId === String(modelId) && p.graphId === String(graphId)) {
        return p;
      }
    }
    return undefined;
  }



  private ensureDir(path: string): void {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  }

  private writeFile(fullPath: string, content: string): void {
    const dir = dirname(fullPath);
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(fullPath, content);
  }

  private async syncToGitLabService(project: TempProjectType): Promise<number> {
    this.winstonService.debug(`Syncing project ${project.id} to GitLab`);
    const projectName = `compiler-${project.modelId}-${project.graphId}`;
    
    let gitLabProjectId = this.configService.get<number>("core.gitlab.projectId", 0);
    if (gitLabProjectId === 0) {
      const newProject = await this.gitLabService.createProject({
        name: projectName,
        description: `Compiler project for model ${project.modelId}, graph ${project.graphId}`,
        visibility: "private",
      });
      gitLabProjectId = newProject.id;
    }

    // 📦 Git operations via terminal
    await this.gitCmdService(project.path, "init");
    await this.gitCmdService(project.path, "add", ".");
    await this.gitCmdService(project.path, "commit", "-m", `Compiler build for ${project.modelId}/${project.graphId}`);
    
    return gitLabProjectId;
  }

  private async gitCmdService(cwd: string, ...args: string[]): Promise<void> {
    const result = await this.terminalService.execute({ command: "git", args, cwd });
    if (result.code !== 0) {
      this.winstonService.warn(`Git command failed: git ${args.join(" ")} — ${result.stderr}`);
    }
  }

  private async triggerPipelineService(project: TempProjectType, projectId: number): Promise<number> {
    try {
      const pipeline = await this.gitLabService.createPipeline(projectId, "main");
      return pipeline.id;
    } catch (error) {
      this.winstonService.warn(`Failed to trigger GitLab pipeline: ${error}`);
      return 0;
    }
  }

  private errorResult(projectId: string, error: string): CompileResultType {
    const project = this.projects.get(projectId);
    return {
      success: false,
      projectId,
      projectPath: project?.path ?? "",
      containerName: project?.containerName ?? "",
      imageName: project?.imageName ?? "",
      error,
    };
  }
}