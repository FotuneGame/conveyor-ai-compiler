import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { join, dirname } from "path";
import { rmSync, mkdirSync, existsSync, writeFileSync } from "fs";
import { WinstonService } from "../../shared/logger/winston.service";
import { TerminalService } from "../terminal/terminal.service";
import { GitLabService } from "../gitlab/gitlab.service";
import { TemplateService } from "../template/template.service";
import { BackendService } from "../backend/backend.service";
import { StoreService } from "../store/store.service";
import type { TempProjectType, CreateTempProjectType, CompileResultType, ContainerLogsType } from "./types";

@Injectable()
export class ProjectService {
  private readonly prefix: string;
  private readonly tempDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly winstonService: WinstonService,
    private readonly terminalService: TerminalService,
    private readonly gitLabService: GitLabService,
    private readonly templateService: TemplateService,
    private readonly backendService: BackendService,
    private readonly storeService: StoreService,
  ) {
    this.prefix = this.configService.get<string>("core.compiler.name", "compiler-typescript");
    this.tempDir = this.configService.get<string>("core.compiler.tempDir", "./tmp/compiler-projects");
  }

  async createTempProject(data: CreateTempProjectType): Promise<TempProjectType> {
    const { model, graph, nodes, dataTypes, nodeTypes, protocolTypes, customEnv } = data;
    const projectId = randomUUID();
    const projectPath = join(this.tempDir, projectId);
    
    this.winstonService.debug(`Creating temp project: ${projectId}`);
    this.ensureDir(projectPath);
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
      containerName: `${this.prefix}-${projectId}`,
      imageName: `${this.prefix}-${projectId}:latest`,
      createdAt: new Date(),
    };

    this.storeService.set(projectId, project);
    return project;
  }

  async compileProject(projectId: string): Promise<CompileResultType> {
    const project = this.storeService.get(projectId);
    if (!project) {
      return this.errorResult(projectId, "Project not found");
    }

    try {
      const { gitLabProjectId, pipelineId } = await this.syncAndTriggerPipeline(project);

      // Сохраняем pipeline ID в store
      project.gitLabPipelineId = pipelineId;
      project.gitLabProjectId = gitLabProjectId;
      this.storeService.set(projectId, project);

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
      
      // Сохраняем информацию о проекте даже при ошибке, чтобы можно было получить логи
      if (project.gitLabProjectId && project.gitLabPipelineId) {
        this.storeService.set(projectId, project);
      } else if (project.gitLabProjectId) {
        // Если проект создан но pipeline не успел создаться, сохраняем проект
        this.storeService.set(projectId, project);
      }
      
      // Очищаем только временные файлы, но не удаляем из store
      await this.cleanupTempFiles(projectId);
      return this.errorResult(projectId, error instanceof Error ? error.message : "Unknown error");
    }
  }

  private async syncAndTriggerPipeline(project: TempProjectType): Promise<{ gitLabProjectId: number; pipelineId: number }> {
    this.winstonService.debug(`Syncing project ${project.id} to GitLab and triggering pipeline`);
    const projectName = `${this.prefix}-${project.modelId}-${project.graphId}`;
    
    let gitLabProject = await this.gitLabService.findProjectByName(projectName);
    
    if (!gitLabProject) {
      this.winstonService.debug(`Creating new GitLab project: ${projectName}`);
      gitLabProject = await this.gitLabService.createProject({
        name: projectName,
        description: `Compiler project for model ${project.modelId}, graph ${project.graphId}`,
        visibility: "private",
      });
      this.winstonService.debug(`Created GitLab project: ${gitLabProject.name} (ID: ${gitLabProject.id})`);
    } else {
      this.winstonService.debug(`Using existing GitLab project: ${gitLabProject.name} (ID: ${gitLabProject.id})`);
    }
    
    if (!gitLabProject) {
      throw new Error(`Failed to create or find GitLab project: ${projectName}`);
    }
    
    project.gitLabProjectId = gitLabProject.id;
    this.storeService.set(project.id, project);
    
    // Push кода в репозиторий
    await this.gitLabService.pushToRepository(project.path, gitLabProject.id, gitLabProject.httpUrlToRepo);
    
    // Создаем pipeline ТОЛЬКО ОДИН РАЗ после успешного push
    const pipeline = await this.gitLabService.createPipeline(gitLabProject.id, "main");
    this.winstonService.debug(`Created pipeline ${pipeline.id} for project ${gitLabProject.id}`);
    
    return { gitLabProjectId: gitLabProject.id, pipelineId: pipeline.id };
  }

  async stopProject(projectId: string): Promise<boolean> {
    const project = this.storeService.get(projectId);
    if (!project) {
      this.winstonService.warn(`Project ${projectId} not found for stopping`);
      return false;
    }

    this.winstonService.debug(`Stopping project: ${projectId}`);

    try {
      if (!project.gitLabProjectId) {
        this.winstonService.warn("GitLab project ID not found for this project");
        // Если gitLabProjectId нет, пытаемся найти проект по имени
        const projectName = `${this.prefix}-${project.modelId}-${project.graphId}`;
        const gitLabProject = await this.gitLabService.findProjectByName(projectName);
        
        if (!gitLabProject) {
          this.winstonService.error(`GitLab project ${projectName} not found`);
          return false;
        }
        
        project.gitLabProjectId = gitLabProject.id;
      }

      // Создаем pipeline с переменной STOP_CONTAINER
      const pipeline = await this.gitLabService.createPipeline(project.gitLabProjectId, "main", {
        STOP_CONTAINER: "true",
      });

      this.winstonService.debug(`Created stop pipeline ${pipeline.id} for project ${project.gitLabProjectId}`);

      // Ждем немного чтобы pipeline запустился
      await new Promise(resolve => setTimeout(resolve, 2000));

      await this.syncCleanupWithBackend(project);

      this.storeService.delete(projectId);
      return true;
    } catch (error) {
      this.winstonService.error(`Failed to stop project ${projectId}: ${error}`);
      return false;
    }
  }

  async getContainerLogs(modelId: number, graphId: number): Promise<ContainerLogsType | null> {
    const project = this.storeService.findProjectByModelAndGraph(String(modelId), String(graphId));

    if (!project) {
      this.winstonService.warn(`Project not found for model ${modelId} and graph ${graphId}`);
      return null;
    }

    if (!project.gitLabPipelineId) {
      this.winstonService.warn(`No pipeline ID found for project ${project.id}`);
      return null;
    }

    if (!project.gitLabProjectId) {
      this.winstonService.warn(`No GitLab project ID found for project ${project.id}`);
      return null;
    }

    const gitLabProjectId = project.gitLabProjectId;

    try {
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
    const project = this.storeService.get(projectId);
    if (!project) return;

    this.winstonService.debug(`Cleaning up project: ${projectId}`);
    await this.syncCleanupWithBackend(project);

    const keepTempFiles = this.configService.get<boolean>("core.compiler.keepTempFiles", false);
    
    if (!keepTempFiles && existsSync(project.path)) {
      rmSync(project.path, { recursive: true, force: true });
    }

    this.storeService.delete(projectId);
  }

  async cleanupTempFiles(projectId: string): Promise<void> {
    const project = this.storeService.get(projectId);
    if (!project) return;

    this.winstonService.debug(`Cleaning up temp files for project: ${projectId}`);
    
    const keepTempFiles = this.configService.get<boolean>("core.compiler.keepTempFiles", false);
    
    if (!keepTempFiles && existsSync(project.path)) {
      rmSync(project.path, { recursive: true, force: true });
    }
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
    return this.storeService.get(projectId);
  }

  getAllProjects(): TempProjectType[] {
    return Object.values(this.storeService.getAll()).map((p) => ({
      ...p,
      createdAt: new Date(p.createdAt),
    }));
  }

  findProjectByModelAndGraph(modelId: number, graphId: number): TempProjectType | undefined {
    return this.storeService.findProjectByModelAndGraph(String(modelId), String(graphId));
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

  private async gitCmdService(cwd: string, ...args: string[]): Promise<void> {
    const result = await this.terminalService.execute({ command: "git", args, cwd });
    if (result.code !== 0) {
      this.winstonService.warn(`Git command failed: git ${args.join(" ")} — ${result.stderr}`);
    }
  }

  private errorResult(projectId: string, error: string): CompileResultType {
    const project = this.storeService.get(projectId);
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