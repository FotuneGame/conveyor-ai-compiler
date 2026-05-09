import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from 'rxjs';
import { WinstonService } from "src/shared/logger/winston.service";
import { TerminalService } from "../terminal/terminal.service";
import type { DockerImageType, DockerContainerType, BuildImageType, RunContainerType, StopContainerType, RemoveContainerType, RemoveImageType } from "./types";


//TODO: ДОПИСАТЬ СОЗДАНИЕ УДАЛЕНИЕ И ОБНОВЛЕНИЕ КОНТЕЙНЕРОВ НА БЕКЕ
/*
  Post /compiler/models/:modelId/containers
  В body: name, logsUrl, dockerUrl, endpointUrl.
  Patch /compiler/models/:modelId/containers/:id
  В body: name, logsUrl, dockerUrl, endpointUrl, active.
  Delete /compiler/models/:modelId/containers/:id
*/
@Injectable()
export class DockerService {
  private readonly registry: string;
  private readonly secret: string;
  private readonly backendUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly winstonService: WinstonService,
    private readonly terminalService: TerminalService,
  ) {
    this.backendUrl =this.configService.get<string>('core.backendUrl', 'http://localhost:5000').replace(/\/+$/, '');;
    this.registry = this.configService.get<string>("core.docker.registry", "registry.gitlab.com");
    this.secret = this.configService.get<string>("passport.compiler.secret", "test-compiler-secret");
  }


  formatImageName(imageName: string): string {
    if (imageName.includes("/")) {
      return imageName;
    }
    return `${this.registry}/${imageName}`;
  }

  stripRegistry(imageName: string): string {
    return imageName.replace(new RegExp(`^${this.registry}/`), "");
  }

  async buildImage(data: BuildImageType): Promise<{ success: boolean; imageId: string }> {
    const { path, tag, dockerfileName = "Dockerfile", buildArgs = {} } = data;
    
    const fullTag = this.formatImageName(tag);
    this.winstonService.debug(`Building Docker image: ${fullTag} from ${path}`);

    let args = ["build", "-t", fullTag, "-f", dockerfileName, path];

    for (const [key, value] of Object.entries(buildArgs)) {
      args = [...args, "--build-arg", `${key}=${value}`];
    }

    try {
      const result = await this.terminalService.execute({ command: "docker", args });

      if (result.code !== 0) {
        this.winstonService.error(`Docker build failed: ${result.stderr}`);
        throw new InternalServerErrorException("Docker build failed");
      }

      const imageId = result.stdout.match(/Successfully built ([a-f0-9]+)/)?.[1] || "";
      return { success: true, imageId };
    } catch (error) {
      this.winstonService.error(`Failed to build Docker image: ${error}`);
      throw new InternalServerErrorException("Failed to build Docker image");
    }
  }

  async pushImage(imageTag: string): Promise<boolean> {
    const fullTag = this.formatImageName(imageTag);
    this.winstonService.debug(`Pushing Docker image: ${fullTag}`);

    try {
      const result = await this.terminalService.execute({
        command: "docker",
        args: ["push", fullTag],
      });

      if (result.code !== 0) {
        this.winstonService.error(`Docker push failed: ${result.stderr}`);
        return false;
      }
      return true;
    } catch (error) {
      this.winstonService.error(`Failed to push Docker image: ${error}`);
      return false;
    }
  }

  async pullImage(imageTag: string): Promise<boolean> {
    const fullTag = this.formatImageName(imageTag);
    this.winstonService.debug(`Pulling Docker image: ${fullTag}`);

    try {
      const result = await this.terminalService.execute({
        command: "docker",
        args: ["pull", fullTag],
      });
      return result.code === 0;
    } catch (error) {
      this.winstonService.error(`Failed to pull Docker image: ${error}`);
      return false;
    }
  }

  async runContainer(data: RunContainerType): Promise<{ success: boolean; containerId: string }> {
    const { image, name, env = {}, ports = {}, volumes = {}, network, restartPolicy } = data;
    
    // 🎯 Применяем реестр к имени образа, если он "простой"
    const fullImage = this.formatImageName(image);
    this.winstonService.debug(`Running Docker container: ${name} from ${fullImage}`);

    const args = ["run", "-d", "--name", name];

    for (const [key, value] of Object.entries(env)) args.push("-e", `${key}=${value}`);
    for (const [hostPort, containerPort] of Object.entries(ports)) args.push("-p", `${hostPort}:${containerPort}`);
    for (const [hostPath, containerPath] of Object.entries(volumes)) args.push("-v", `${hostPath}:${containerPath}`);
    if (network) args.push("--network", network);
    if (restartPolicy) args.push("--restart", restartPolicy);

    args.push(fullImage); // 👈 используем полное имя

    try {
      const result = await this.terminalService.execute({ command: "docker", args });
      if (result.code !== 0) {
        this.winstonService.error(`Docker run failed: ${result.stderr}`);
        throw new InternalServerErrorException("Docker run failed");
      }
      return { success: true, containerId: result.stdout.trim() };
    } catch (error) {
      this.winstonService.error(`Failed to run Docker container: ${error}`);
      throw new InternalServerErrorException("Failed to run Docker container");
    }
  }

  async stopContainer(data: StopContainerType): Promise<boolean> {
    const { containerId, timeout } = data;
    this.winstonService.debug(`Stopping Docker container: ${containerId}`);
    const args = ["stop", containerId];
    if (timeout !== undefined) args.push("-t", timeout.toString());
    try {
      const result = await this.terminalService.execute({ command: "docker", args });
      return result.code === 0;
    } catch (error) {
      this.winstonService.error(`Failed to stop Docker container: ${error}`);
      return false;
    }
  }

  async removeContainer(data: RemoveContainerType): Promise<boolean> {
    const { containerId, force = false } = data;
    this.winstonService.debug(`Removing Docker container: ${containerId}`);
    const args = ["rm", ...(force ? ["-f"] : []), containerId];
    try {
      const result = await this.terminalService.execute({ command: "docker", args });
      return result.code === 0;
    } catch (error) {
      this.winstonService.error(`Failed to remove Docker container: ${error}`);
      return false;
    }
  }

  async removeImage(data: RemoveImageType): Promise<boolean> {
    const { imageId, force = false } = data;
    const fullTag = this.formatImageName(imageId);
    this.winstonService.debug(`Removing Docker image: ${fullTag}`);
    const args = ["rmi", ...(force ? ["-f"] : []), fullTag];
    try {
      const result = await this.terminalService.execute({ command: "docker", args });
      return result.code === 0;
    } catch (error) {
      this.winstonService.error(`Failed to remove Docker image: ${error}`);
      return false;
    }
  }

  async getContainers(): Promise<DockerContainerType[]> {
    this.winstonService.debug("Getting Docker containers");

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
      this.winstonService.error(`Failed to get Docker containers: ${error}`);
      return [];
    }
  }

  async getImages(): Promise<DockerImageType[]> {
    this.winstonService.debug("Getting Docker images");

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
      this.winstonService.error(`Failed to get Docker images: ${error}`);
      return [];
    }
  }  

  async getContainerLogs(id: string, tail: number = 100): Promise<string> {
    this.winstonService.debug(`Getting logs for container: ${id}`);

    try {
      const result = await this.terminalService.execute({
        command: "docker",
        args: ["logs", "-n", tail.toString(), id],
      });

      return result.stdout + result.stderr;
    } catch (error) {
      this.winstonService.error(`Failed to get container logs: ${error}`);
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
    const fullTag = this.formatImageName(imageTag);
    try {
      const result = await this.terminalService.execute({
        command: "docker",
        args: ["images", fullTag, "--format", "{{.Repository}}:{{.Tag}}"],
      });
      return result.stdout.trim() === fullTag || result.stdout.trim() === imageTag;
    } catch {
      return false;
    }
  }
  
}
