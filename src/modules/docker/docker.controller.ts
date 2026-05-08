import { Controller, Get, Param } from "@nestjs/common";
import { DockerService } from "./docker.service";

@Controller("docker")
export class DockerController {
  constructor(private readonly dockerService: DockerService) {}

  @Get("logs/:containerId")
  async getContainerLogs(@Param("containerId") containerId: string): Promise<string> {
    return await this.dockerService.getContainerLogs(containerId);
  }
}
