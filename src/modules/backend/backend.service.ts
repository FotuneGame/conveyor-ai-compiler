import { Injectable, Logger, InternalServerErrorException } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import type {
  CreateContainerType,
  UpdateContainerType,
  ContainerType,
  ContainerListResponseType,
  ContainerLogsType,
  BackendConfigType,
} from "./types";



@Injectable()
export class BackendService {
  private readonly logger = new Logger(BackendService.name);
  private readonly baseUrl: string;
  private readonly compilerSecret: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.baseUrl = this.configService.get<string>("backend.baseUrl", "http://localhost:3000");
    this.compilerSecret = this.configService.get<string>("COMPILER_SECRET", "test-compiler-secret");
  }

  private getHeaders(): Record<string, string> {
    return {
      "Authorization": `Bearer ${this.compilerSecret}`,
      "Content-Type": "application/json",
    };
  }

  async createContainer(
    modelId: number,
    data: CreateContainerType
  ): Promise<ContainerType | null> {
    this.logger.debug(`Creating container for model ${modelId}: ${data.name}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post<ContainerType>(
          `${this.baseUrl}/api/compiler/models/${modelId}/containers`,
          data,
          { headers: this.getHeaders() }
        )
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create container: ${error}`);
      return null;
    }
  }

  async updateContainer(
    modelId: number,
    containerId: number,
    data: UpdateContainerType
  ): Promise<ContainerType | null> {
    this.logger.debug(`Updating container ${containerId} for model ${modelId}`);

    try {
      const response = await firstValueFrom(
        this.httpService.patch<ContainerType>(
          `${this.baseUrl}/api/compiler/models/${modelId}/containers/${containerId}`,
          data,
          { headers: this.getHeaders() }
        )
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to update container: ${error}`);
      return null;
    }
  }

  async deleteContainer(modelId: number, containerId: number): Promise<boolean> {
    this.logger.debug(`Deleting container ${containerId} for model ${modelId}`);

    try {
      await firstValueFrom(
        this.httpService.delete(
          `${this.baseUrl}/api/compiler/models/${modelId}/containers/${containerId}`,
          { headers: this.getHeaders() }
        )
      );

      return true;
    } catch (error) {
      this.logger.error(`Failed to delete container: ${error}`);
      return false;
    }
  }

  async getContainers(modelId: number): Promise<ContainerListResponseType | null> {
    this.logger.debug(`Getting containers for model ${modelId}`);

    try {
      const response = await firstValueFrom(
        this.httpService.get<ContainerListResponseType>(
          `${this.baseUrl}/api/compiler/models/${modelId}/containers`,
          { headers: this.getHeaders() }
        )
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get containers: ${error}`);
      return null;
    }
  }

  async getContainerLogs(
    modelId: number,
    containerId: number
  ): Promise<ContainerLogsType | null> {
    this.logger.debug(`Getting logs for container ${containerId} of model ${modelId}`);

    try {
      const response = await firstValueFrom(
        this.httpService.get<ContainerLogsType>(
          `${this.baseUrl}/api/compiler/models/${modelId}/containers/${containerId}/logs`,
          { headers: this.getHeaders() }
        )
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get container logs: ${error}`);
      return null;
    }
  }

  getConfig(): BackendConfigType {
    return {
      baseUrl: this.baseUrl,
      compilerSecret: this.compilerSecret,
    };
  }
}
