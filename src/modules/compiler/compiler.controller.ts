import { Controller, Post, Get, Body, Param, UseGuards, ParseIntPipe, HttpException, HttpStatus } from "@nestjs/common";
import { AuthGuard } from "../../common/guards/auth.guard";
import { ProjectService } from "../project/project.service";
import type { CompileRequestType, CompileResultType, ContainerLogsType, StopRequestType } from "./types";
import { EnvConfigService } from "../env-config";

@UseGuards(AuthGuard)
@Controller()
export class CompilerController {
  constructor(
    private readonly projectService: ProjectService,
    private readonly envConfigService: EnvConfigService,
  ) {}

  @Post("/compilate")
  async compile(@Body() data: CompileRequestType): Promise<CompileResultType> {
    const { model, graph, nodes, dataTypes, nodeTypes, protocolTypes } = data;
    const defaultEnvConfig = await this.envConfigService.getDefaultEnvConfig();
    const customEnv = this.envConfigService.parseEnv(graph.env || defaultEnvConfig);

    const project = await this.projectService.createTempProject({
      model,
      graph,
      nodes,
      dataTypes,
      nodeTypes,
      protocolTypes,
      customEnv,
    });

    const result = await this.projectService.compileProject(project.id);

    if (!result.success) {
      throw new HttpException(
        { message: result.error || "Compilation failed", projectId: result.projectId },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    return result;
  }

  @Post("/stop")
  async stop(@Body() data: StopRequestType): Promise<{ success: boolean; message: string }> {
    const { model, graph } = data;

    const stopped = await this.projectService.stopProject(model.id, graph.id);

    if (!stopped) {
      throw new HttpException(
        { message: "Failed to stop project", modelId: model.id, graphId: graph.id },
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