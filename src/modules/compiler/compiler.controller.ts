import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";
import { AuthGuard } from "src/common/guards/auth.guard";
import { ProjectService } from "../project/project.service";
import { EnvConfigService } from "../env-config/env-config.service";
import type { CompileRequestType, StopRequestType, NodeType } from "./types";
import type { CompileResultType } from "../project/types";
import type { EnvConfigType } from "../env-config/types";



@UseGuards(AuthGuard)
@Controller()
export class CompilerController {
  constructor(
    private readonly projectService: ProjectService,
    private readonly envConfigService: EnvConfigService
  ) {}

  @Get("/default")
  async getDefaultEnv(): Promise<EnvConfigType> {
    return await this.envConfigService.getDefaultEnvConfig();
  }

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

    const result = await this.projectService.compileProject(project.id);

    return result;
  }

  @Post("/stop")
  async stop(@Body() data: StopRequestType): Promise<{ success: boolean; message: string }> {
    const { model, graph } = data;

    const project = await this.projectService.findProjectByModelAndGraph(model.id, graph.id);

    if (!project) {
      return { success: false, message: "Project not found" };
    }

    const stopped = await this.projectService.stopProject(project.id);

    if (stopped) {
      await this.projectService.cleanupProject(project.id);
      return { success: true, message: "Project stopped and cleaned up" };
    }

    return { success: false, message: "Failed to stop project" };
  }
}