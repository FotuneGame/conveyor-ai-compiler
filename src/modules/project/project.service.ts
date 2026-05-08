import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { join } from "path";
import { rm, mkdir, existsSync, writeFileSync } from "fs";
import { WinstonService } from "src/shared/logger/winston.service";
import { TerminalService } from "../terminal/terminal.service";
import { GitLabService } from "../gitlab/gitlab.service";
import { DockerService } from "../docker/docker.service";
import { TemplateService } from "../template/template.service";
import type {
  TempProjectType,
  CreateTempProjectDto,
  CompileResultType,
  ProjectConfigType,
} from "./types";
import type { ModelType, GraphType, NodeType, DataType, NodeTypeType, ProtocolTypeType } from "../../modules/compiler/types";

@Injectable()
export class ProjectService {
  private readonly tempDir: string;
  private readonly projects: Map<string, TempProjectType> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly winstonService: WinstonService,
    private readonly terminalService: TerminalService,
    private readonly gitLabService: GitLabService,
    private readonly dockerService: DockerService,
    private readonly templateService: TemplateService
  ) {
    this.tempDir = this.configService.get<string>("core.compiler.tempDir", "/tmp/compiler-projects");
  }

  async createTempProject(data: CreateTempProjectDto): Promise<TempProjectType> {
    const { model, graph, nodes, dataTypes, nodeTypes, protocolTypes, customEnv } = data;

    const projectId = randomUUID();
    const projectPath = join(this.tempDir, projectId);
    const containerName = `compiler-${projectId}`;
    const imageName = `compiler-${projectId}:latest`;

    this.winstonService.debug(`Creating temp project: ${projectId}`);

    if (!existsSync(this.tempDir)) {
      mkdir(this.tempDir, { recursive: true }, () => {});
    }

    if (!existsSync(projectPath)) {
      mkdir(projectPath, { recursive: true }, () => {});
    }

    await this.generateProjectFiles(projectPath, model, graph, nodes, dataTypes, nodeTypes, protocolTypes, customEnv);

    const project: TempProjectType = {
      id: projectId,
      path: projectPath,
      graphId: graph.id.toString(),
      modelId: model.id.toString(),
      containerName,
      imageName,
      createdAt: new Date(),
    };

    this.projects.set(projectId, project);

    return project;
  }

  async compileProject(projectId: string): Promise<CompileResultType> {
    const project = this.projects.get(projectId);

    if (!project) {
      return {
        success: false,
        projectId,
        projectPath: "",
        containerName: "",
        imageName: "",
        error: "Project not found",
      };
    }

    try {
      await this.buildDockerImage(project);

      const gitLabProjectId = await this.syncToGitLab(project);

      const pipelineId = await this.triggerGitLabPipeline(project, gitLabProjectId);

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
      this.winstonService.error(`Compile failed for project ${projectId}: ${error}`);
      await this.cleanupProject(projectId);

      return {
        success: false,
        projectId,
        projectPath: project.path,
        containerName: project.containerName,
        imageName: project.imageName,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async stopProject(projectId: string): Promise<boolean> {
    const project = this.projects.get(projectId);

    if (!project) {
      this.winstonService.warn(`Project ${projectId} not found for stopping`);
      return false;
    }

    try {
      await this.dockerService.stopContainer({ containerId: project.containerName });
      await this.dockerService.removeContainer({ containerId: project.containerName, force: true });
      await this.dockerService.removeImage({ imageId: project.imageName, force: true });

      return true;
    } catch (error) {
      this.winstonService.error(`Failed to stop project ${projectId}: ${error}`);
      return false;
    }
  }

  async cleanupProject(projectId: string): Promise<void> {
    const project = this.projects.get(projectId);

    if (!project) {
      return;
    }

    this.winstonService.debug(`Cleaning up project: ${projectId}`);

    try {
      await this.dockerService.stopContainer({ containerId: project.containerName });
    } catch (error) {
      this.winstonService.warn(`Failed to stop container: ${error}`);
    }

    try {
      await this.dockerService.removeContainer({ containerId: project.containerName, force: true });
    } catch (error) {
      this.winstonService.warn(`Failed to remove container: ${error}`);
    }

    try {
      await this.dockerService.removeImage({ imageId: project.imageName, force: true });
    } catch (error) {
      this.winstonService.warn(`Failed to remove image: ${error}`);
    }

    try {
      if (existsSync(project.path)) {
        rm(project.path, { recursive: true, force: true }, () => {});
      }
    } catch (error) {
      this.winstonService.warn(`Failed to remove temp directory: ${error}`);
    }

    this.projects.delete(projectId);
  }

  async getProject(projectId: string): Promise<TempProjectType | undefined> {
    return this.projects.get(projectId);
  }

  async getAllProjects(): Promise<TempProjectType[]> {
    return Array.from(this.projects.values());
  }

  async findProjectByModelAndGraph(modelId: number, graphId: number): Promise<TempProjectType | undefined> {
    for (const project of this.projects.values()) {
      if (project.modelId === modelId.toString() && project.graphId === graphId.toString()) {
        return project;
      }
    }
    return undefined;
  }

  private async generateProjectFiles(
    projectPath: string,
    model: ModelType,
    graph: GraphType,
    nodes: NodeType[],
    dataTypes: DataType[],
    nodeTypes: NodeTypeType[],
    protocolTypes: ProtocolTypeType[],
    customEnv?: Record<string, string>
  ): Promise<void> {
    const context = {
      model,
      graph,
      nodes,
      dataTypes,
      nodeTypes,
      protocolTypes,
    };

    const files = await this.templateService.generateFiles(context);

    for (const file of files) {
      const fullPath = join(projectPath, file.path);

      const dir = fullPath.split("/").slice(0, -1).join("/");
      if (dir && !existsSync(dir)) {
        mkdir(dir, { recursive: true }, () => {});
      }

      const content = file.path === ".env" && customEnv
        ? this.mergeEnv(file.content, customEnv)
        : file.content;

      writeFileSync(fullPath, content);
    }
  }

  private mergeEnv(envContent: string, customEnv: Record<string, string>): string {
    const lines = envContent.split("\n");
    const envMap: Record<string, string> = {};

    for (const line of lines) {
      if (line.trim() && !line.startsWith("#")) {
        const [key, value] = line.split("=");
        if (key) {
          envMap[key] = value || "";
        }
      }
    }

    for (const [key, value] of Object.entries(customEnv)) {
      envMap[key] = value;
    }

    return Object.entries(envMap)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
  }

  private async buildDockerImage(project: TempProjectType): Promise<void> {
    this.winstonService.debug(`Building Docker image for project: ${project.id}`);

    const result = await this.dockerService.buildImage({
      path: project.path,
      tag: project.imageName,
    });

    if (!result.success) {
      throw new InternalServerErrorException("Failed to build Docker image");
    }
  }

  private async syncToGitLab(project: TempProjectType): Promise<number> {
    this.winstonService.debug(`Syncing project to GitLab: ${project.id}`);

    const projectName = `compiler-${project.modelId}-${project.graphId}`;

    let gitLabProjectId = this.configService.get<number>("gitlab.projectId", 0);

    if (gitLabProjectId === 0) {
      const newProject = await this.gitLabService.createProject({
        name: projectName,
        description: `Compiler project for model ${project.modelId}, graph ${project.graphId}`,
        visibility: "private",
      });
      gitLabProjectId = newProject.id;
    }

    const result = await this.terminalService.execute({
      command: "git",
      args: [
        "init",
      ],
      cwd: project.path,
    });

    if (result.code !== 0) {
      this.winstonService.warn(`Git init failed: ${result.stderr}`);
    }

    const addResult = await this.terminalService.execute({
      command: "git",
      args: ["add", "."],
      cwd: project.path,
    });

    const commitResult = await this.terminalService.execute({
      command: "git",
      args: ["commit", "-m", `Compiler build for ${project.modelId}/${project.graphId}`],
      cwd: project.path,
    });

    this.winstonService.debug(`Synced project to Git: ${project.id}`);

    return gitLabProjectId;
  }

  private async triggerGitLabPipeline(project: TempProjectType, projectId: number): Promise<number> {
    this.winstonService.debug(`Triggering GitLab pipeline for project: ${project.id}`);

    try {
      const pipeline = await this.gitLabService.createPipeline(projectId, "main");
      return pipeline.id;
    } catch (error) {
      this.winstonService.warn(`Failed to trigger GitLab pipeline: ${error}`);
      return 0;
    }
  }
}
