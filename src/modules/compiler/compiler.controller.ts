import { Controller, Post, Get, Body, Param, UseGuards, ParseIntPipe, HttpException, HttpStatus } from "@nestjs/common";
import { AuthGuard } from "../../common/guards/auth.guard";
import { ProjectService } from "../project/project.service";
import type { CompileRequestType, NodeType } from "./types";
import type { CompileResultType, ContainerLogsType } from "../project/types";

@UseGuards(AuthGuard)
@Controller()
export class CompilerController {
  constructor(
    private readonly projectService: ProjectService,
  ) {}

  @Post("/compilate")
  async compile(@Body() data: CompileRequestType): Promise<CompileResultType> {
    const { model, graph, nodes, dataTypes, nodeTypes, protocolTypes } = data;

    const project = await this.projectService.createTempProject({
      model,
      graph,
      nodes: nodes as unknown as NodeType[],
      dataTypes,
      nodeTypes,
      protocolTypes,
    });

    const result = await this.projectService.compileProject(project.id, project.gitLabProjectPath);

    if (!result.success) {
      throw new HttpException(
        { message: result.error || "Compilation failed", projectId: result.projectId },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    return result;
  }

  @Post("/stop")
  async stop(@Body() data: { modelId: number; graphId: number }): Promise<{ success: boolean; message: string }> {
    const { modelId, graphId } = data;

    const project = await this.projectService.findProjectByModelAndGraph(modelId, graphId);

    if (!project) {
      throw new HttpException(
        { message: "Project not found", modelId, graphId },
        HttpStatus.NOT_FOUND
      );
    }

    const stopped = await this.projectService.stopProject(project.id);

    if (!stopped) {
      throw new HttpException(
        { message: "Failed to stop project", projectId: project.id },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    return { success: true, message: "Container stop pipeline triggered via GitLab CI/CD" };
  }

  @Get("models/:modelId/graphs/:graphId/logs")
  async getLogs(
    @Param('modelId', ParseIntPipe) modelId: number,
    @Param('graphId', ParseIntPipe) graphId: number,
  ): Promise<ContainerLogsType | null> {
    const logs = await this.projectService.getContainerLogs(modelId, graphId);

    if (!logs) {
      throw new HttpException(
        { message: "Project not found or no pipeline available", modelId, graphId },
        HttpStatus.NOT_FOUND
      );
    }

    return logs;
  }
}