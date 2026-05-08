import { Controller, Post, Body } from "@nestjs/common";
import { TemplateService } from "./template.service";
import type { TemplateProjectConfigType, TemplateContextType } from "./types";
import type { CreateTemplateProjectDto } from "./dto/create-project.dto";

@Controller("template")
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Post("project")
  async generateProject(@Body() dto: CreateTemplateProjectDto): Promise<string> {
    const config: TemplateProjectConfigType = {
      graphId: dto.graphId,
      modelId: dto.modelId,
      outputDir: dto.outputDir,
    };

    return await this.templateService.generateProject(config, {} as TemplateContextType);
  }
}
