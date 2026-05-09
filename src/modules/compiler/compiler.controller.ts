import { Controller, Post, Body, UseGuards } from "@nestjs/common";
import { AuthGuard } from "src/common/guards/auth.guard";
import { ProjectService } from "../project/project.service";
import type { CompileRequestType, NodeType } from "./types";
import type { CompileResultType } from "../project/types";

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

    const result = await this.projectService.compileProject(project.id);

    return result;
  }

  @Post("/stop")
  async stop(@Body() data: { modelId: number; graphId: number }): Promise<{ success: boolean; message: string }> {
    const { modelId, graphId } = data;

    const project = await this.projectService.findProjectByModelAndGraph(modelId, graphId);

    if (!project) {
      return { success: false, message: "Project not found" };
    }

    const stopped = await this.projectService.stopProject(project.id);

    if (stopped) {
      return { success: true, message: "Container stop pipeline triggered via GitLab CI/CD" };
    }

    return { success: false, message: "Failed to stop project" };
  }
}