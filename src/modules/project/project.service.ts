import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { join, dirname } from "path";
import { rmSync, mkdirSync, existsSync, writeFileSync } from "fs";
import { WinstonService } from "src/shared/logger/winston.service";
import { TerminalService } from "../terminal/terminal.service";
import { GitLabService } from "../gitlab/gitlab.service";
import { DockerService } from "../docker/docker.service";
import { TemplateService } from "../template/template.service";
import type { TempProjectType, CreateTempProjectType, CompileResultType } from "./types";



@Injectable()
export class ProjectService {
  private readonly tempDir: string;
  private readonly projects = new Map<string, TempProjectType>();

  constructor(
    private readonly configService: ConfigService,
    private readonly winstonService: WinstonService,
    private readonly terminal: TerminalService,
    private readonly gitLab: GitLabService,
    private readonly docker: DockerService,
    private readonly template: TemplateService,
  ) {
    this.tempDir = this.configService.get<string>("core.compiler.tempDir", "/tmp/compiler-projects");
  }

  async createTempProject(data: CreateTempProjectType): Promise<TempProjectType> {
    const { model, graph, nodes, dataTypes, nodeTypes, protocolTypes, customEnv } = data;
    const projectId = randomUUID();
    const projectPath = join(this.tempDir, projectId);
    
    this.winstonService.debug(`Creating temp project: ${projectId}`);
    this.ensureDir(projectPath);

    // 🔄 Генерируем файлы через TemplateService и записываем через ProjectService
    const files = this.template.generateFiles({ model, graph, nodes, dataTypes, nodeTypes, protocolTypes });
    
    for (const file of files) {
      const fullPath = join(projectPath, file.path);
      let content = file.content;
      
      if (file.path === ".env" && customEnv) {
        content = this.template.patchEnvFile(content, customEnv);
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
      await this.buildImage(project);
      const gitLabProjectId = await this.syncToGitLab(project);
      const pipelineId = await this.triggerPipeline(project, gitLabProjectId);

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

    try {
      await this.docker.stopContainer({ containerId: project.containerName });
      await this.docker.removeContainer({ containerId: project.containerName, force: true });
      await this.docker.removeImage({ imageId: project.imageName, force: true });
      return true;
    } catch (error) {
      this.winstonService.error(`Failed to stop project ${projectId}: ${error}`);
      return false;
    }
  }

  async cleanupProject(projectId: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) return;

    this.winstonService.debug(`Cleaning up project: ${projectId}`);

    // 🧹 Безопасная очистка с игнорированием ошибок
    await this.safeDockerOp(() => this.docker.stopContainer({ containerId: project.containerName }));
    await this.safeDockerOp(() => this.docker.removeContainer({ containerId: project.containerName, force: true }));
    await this.safeDockerOp(() => this.docker.removeImage({ imageId: project.imageName, force: true }));
    
    if (existsSync(project.path)) {
      rmSync(project.path, { recursive: true, force: true });
    }

    this.projects.delete(projectId);
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

  private async buildImage(project: TempProjectType): Promise<void> {
    this.winstonService.debug(`Building Docker image: ${project.imageName}`);
    const result = await this.docker.buildImage({ path: project.path, tag: project.imageName });
    if (!result.success) {
      throw new InternalServerErrorException("Failed to build Docker image");
    }
  }

  private async syncToGitLab(project: TempProjectType): Promise<number> {
    this.winstonService.debug(`Syncing project ${project.id} to GitLab`);
    const projectName = `compiler-${project.modelId}-${project.graphId}`;
    
    let gitLabProjectId = this.configService.get<number>("core.gitlab.projectId", 0);
    if (gitLabProjectId === 0) {
      const newProject = await this.gitLab.createProject({
        name: projectName,
        description: `Compiler project for model ${project.modelId}, graph ${project.graphId}`,
        visibility: "private",
      });
      gitLabProjectId = newProject.id;
    }

    // 📦 Git operations via terminal
    await this.gitCmd(project.path, "init");
    await this.gitCmd(project.path, "add", ".");
    await this.gitCmd(project.path, "commit", "-m", `Compiler build for ${project.modelId}/${project.graphId}`);
    
    return gitLabProjectId;
  }

  private async gitCmd(cwd: string, ...args: string[]): Promise<void> {
    const result = await this.terminal.execute({ command: "git", args, cwd });
    if (result.code !== 0) {
      this.winstonService.warn(`Git command failed: git ${args.join(" ")} — ${result.stderr}`);
    }
  }

  private async triggerPipeline(project: TempProjectType, projectId: number): Promise<number> {
    try {
      const pipeline = await this.gitLab.createPipeline(projectId, "main");
      return pipeline.id;
    } catch (error) {
      this.winstonService.warn(`Failed to trigger GitLab pipeline: ${error}`);
      return 0;
    }
  }

  private async safeDockerOp(op: () => Promise<boolean>): Promise<void> {
    try {
      await op();
    } catch (error) {
      this.winstonService.warn(`Docker operation failed: ${error}`);
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