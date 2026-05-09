import { Controller, Get, Param } from "@nestjs/common";
import { DockerService } from "./docker.service";

@Controller()
export class DockerController {
  constructor(private readonly dockerService: DockerService) {}

  @Get("logs/:id")
  async getContainerLogs(@Param("id") id: string): Promise<string> {
    return await this.dockerService.getContainerLogs(id);
  }
}
