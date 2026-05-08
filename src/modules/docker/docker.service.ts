import { Injectable, Logger, InternalServerErrorException } from "@nestjs/common";
import { TerminalService } from "../terminal/terminal.service";
import type {
  DockerImageType,
  DockerContainerType,
  BuildImageDto,
  RunContainerDto,
  StopContainerDto,
  RemoveContainerDto,
  RemoveImageDto,
} from "./types";

@Injectable()
export class DockerService {
  private readonly logger = new Logger(DockerService.name);

  constructor(private readonly terminalService: TerminalService) {}

  async buildImage(data: BuildImageDto): Promise<{ success: boolean; imageId: string }> {
    const { path, tag, dockerfileName = "Dockerfile", buildArgs = {} } = data;

    this.logger.debug(`Building Docker image: ${tag} from ${path}`);

    let args = ["build", "-t", tag, "-f", dockerfileName, path];

    for (const [key, value] of Object.entries(buildArgs)) {
      args = [...args, "--build-arg", `${key}=${value}`];
    }

    try {
      const result = await this.terminalService.execute({
        command: "docker",
        args,
      });

      if (result.code !== 0) {
        this.logger.error(`Docker build failed: ${result.stderr}`);
        throw new InternalServerErrorException("Docker build failed");
      }

      const imageId = result.stdout.match(/Successfully built ([a-f0-9]+)/)?.[1] || "";
      return { success: true, imageId };
    } catch (error) {
      this.logger.error(`Failed to build Docker image: ${error}`);
      throw new InternalServerErrorException("Failed to build Docker image");
    }
  }

  async runContainer(data: RunContainerDto): Promise<{ success: boolean; containerId: string }> {
    const { image, name, env = {}, ports = {}, volumes = {}, network, restartPolicy } = data;

    this.logger.debug(`Running Docker container: ${name}`);

    const args = ["run", "-d", "--name", name];

    for (const [key, value] of Object.entries(env)) {
      args.push("-e", `${key}=${value}`);
    }

    for (const [hostPort, containerPort] of Object.entries(ports)) {
      args.push("-p", `${hostPort}:${containerPort}`);
    }

    for (const [hostPath, containerPath] of Object.entries(volumes)) {
      args.push("-v", `${hostPath}:${containerPath}`);
    }

    if (network) {
      args.push("--network", network);
    }

    if (restartPolicy) {
      args.push("--restart", restartPolicy);
    }

    args.push(image);

    try {
      const result = await this.terminalService.execute({
        command: "docker",
        args,
      });

      if (result.code !== 0) {
        this.logger.error(`Docker run failed: ${result.stderr}`);
        throw new InternalServerErrorException("Docker run failed");
      }

      const containerId = result.stdout.trim();
      return { success: true, containerId };
    } catch (error) {
      this.logger.error(`Failed to run Docker container: ${error}`);
      throw new InternalServerErrorException("Failed to run Docker container");
    }
  }

  async stopContainer(data: StopContainerDto): Promise<boolean> {
    const { containerId, timeout } = data;

    this.logger.debug(`Stopping Docker container: ${containerId}`);

    const args = ["stop", containerId];
    if (timeout !== undefined) {
      args.push("-t", timeout.toString());
    }

    try {
      const result = await this.terminalService.execute({
        command: "docker",
        args,
      });

      return result.code === 0;
    } catch (error) {
      this.logger.error(`Failed to stop Docker container: ${error}`);
      return false;
    }
  }

  async removeContainer(data: RemoveContainerDto): Promise<boolean> {
    const { containerId, force = false } = data;

    this.logger.debug(`Removing Docker container: ${containerId}`);

    const args = ["rm"];
    if (force) {
      args.push("-f");
    }
    args.push(containerId);

    try {
      const result = await this.terminalService.execute({
        command: "docker",
        args,
      });

      return result.code === 0;
    } catch (error) {
      this.logger.error(`Failed to remove Docker container: ${error}`);
      return false;
    }
  }

  async removeImage(data: RemoveImageDto): Promise<boolean> {
    const { imageId, force = false } = data;

    this.logger.debug(`Removing Docker image: ${imageId}`);

    const args = ["rmi"];
    if (force) {
      args.push("-f");
    }
    args.push(imageId);

    try {
      const result = await this.terminalService.execute({
        command: "docker",
        args,
      });

      return result.code === 0;
    } catch (error) {
      this.logger.error(`Failed to remove Docker image: ${error}`);
      return false;
    }
  }

  async getContainers(): Promise<DockerContainerType[]> {
    this.logger.debug("Getting Docker containers");

    try {
      const result = await this.terminalService.execute({
        command: "docker",
        args: ["ps", "-a", "--format", "{{json .}}"],
      });

      if (result.code !== 0) {
        return [];
      }

      const lines = result.stdout.trim().split("\n");
      return lines
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line))
        .map((container: Record<string, unknown>) => ({
          id: container.ID as string,
          names: [(container.Names as string).replace("/", "")],
          image: container.Image as string,
          command: container.Command as string,
          created: Date.parse(container.CreatedAt as string),
          state: container.State as string,
          status: container.Status as string,
          ports: [],
        }));
    } catch (error) {
      this.logger.error(`Failed to get Docker containers: ${error}`);
      return [];
    }
  }

  async getImages(): Promise<DockerImageType[]> {
    this.logger.debug("Getting Docker images");

    try {
      const result = await this.terminalService.execute({
        command: "docker",
        args: ["images", "--format", "{{json .}}"],
      });

      if (result.code !== 0) {
        return [];
      }

      const lines = result.stdout.trim().split("\n");
      return lines
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line))
        .map((image: Record<string, unknown>) => ({
          id: image.ID as string,
          repoTags: [(image.Repository as string) + ":" + (image.Tag as string)],
          created: Number(image.CreatedAt) || 0,
          size: Number(image.Size) || 0,
        }));
    } catch (error) {
      this.logger.error(`Failed to get Docker images: ${error}`);
      return [];
    }
  }

  async getContainerLogs(containerId: string, tail: number = 100): Promise<string> {
    this.logger.debug(`Getting logs for container: ${containerId}`);

    try {
      const result = await this.terminalService.execute({
        command: "docker",
        args: ["logs", "-n", tail.toString(), containerId],
      });

      return result.stdout + result.stderr;
    } catch (error) {
      this.logger.error(`Failed to get container logs: ${error}`);
      return "";
    }
  }

  async containerExists(containerName: string): Promise<boolean> {
    try {
      const result = await this.terminalService.execute({
        command: "docker",
        args: ["ps", "-a", "--filter", `name=^${containerName}$`, "--format", "{{.Names}}"],
      });

      return result.stdout.trim() === containerName;
    } catch (error) {
      return false;
    }
  }

  async getImageExists(imageTag: string): Promise<boolean> {
    try {
      const result = await this.terminalService.execute({
        command: "docker",
        args: ["images", imageTag, "--format", "{{.Repository}}:{{.Tag}}"],
      });

      return result.stdout.trim() === imageTag;
    } catch (error) {
      return false;
    }
  }
}
