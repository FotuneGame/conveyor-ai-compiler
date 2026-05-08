import { Controller, Post, Get, Body, Param } from "@nestjs/common";
import { DockerService } from "./docker.service";
import type {
  DockerImageType,
  DockerContainerType,
  BuildImageDto,
  RunContainerDto,
  StopContainerDto,
  RemoveContainerDto,
  RemoveImageDto,
} from "./types";

@Controller("docker")
export class DockerController {
  constructor(private readonly dockerService: DockerService) {}

  @Post("build")
  async buildImage(@Body() data: BuildImageDto): Promise<{ success: boolean; imageId: string }> {
    return await this.dockerService.buildImage(data);
  }

  @Post("run")
  async runContainer(@Body() data: RunContainerDto): Promise<{ success: boolean; containerId: string }> {
    return await this.dockerService.runContainer(data);
  }

  @Post("stop")
  async stopContainer(@Body() data: StopContainerDto): Promise<boolean> {
    return await this.dockerService.stopContainer(data);
  }

  @Post("remove/container")
  async removeContainer(@Body() data: RemoveContainerDto): Promise<boolean> {
    return await this.dockerService.removeContainer(data);
  }

  @Post("remove/image")
  async removeImage(@Body() data: RemoveImageDto): Promise<boolean> {
    return await this.dockerService.removeImage(data);
  }

  @Get("containers")
  async getContainers(): Promise<DockerContainerType[]> {
    return await this.dockerService.getContainers();
  }

  @Get("images")
  async getImages(): Promise<DockerImageType[]> {
    return await this.dockerService.getImages();
  }

  @Get("logs/:containerId")
  async getContainerLogs(@Param("containerId") containerId: string): Promise<string> {
    return await this.dockerService.getContainerLogs(containerId);
  }

  @Post("container/exists/:name")
  async containerExists(@Param("name") name: string): Promise<boolean> {
    return await this.dockerService.containerExists(name);
  }
}
