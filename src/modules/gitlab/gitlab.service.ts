import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { WinstonService } from "src/shared/logger/winston.service";
import type { GitLabProjectType, GitLabPipelineType, GitLabJobType, CreateGitLabProjectType } from "./types";

@Injectable()
export class GitLabService {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly winstonService: WinstonService
  ) {
    this.baseUrl = this.configService.get<string>("core.gitlab.baseUrl", "https://gitlab.com");
    this.token = this.configService.get<string>("core.gitlab.token", "");
  }

  private getHeaders(): Record<string, string> {
    return {
      "PRIVATE-TOKEN": this.token,
      "Content-Type": "application/json",
    };
  }

  async createProject(data: CreateGitLabProjectType): Promise<GitLabProjectType> {
    this.winstonService.debug(`Creating GitLab project: ${data.name}`);

    try {
      const payload: Record<string, unknown> = {
        name: data.name,
        visibility: data.visibility || "private",
      };

      if (data.description) {
        payload.description = data.description;
      }

      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/v4/projects`, payload, {
          headers: this.getHeaders(),
        })
      );

      return this.mapProject(response.data);
    } catch (error) {
      this.winstonService.error(`Failed to create GitLab project: ${error}`);
      throw new InternalServerErrorException("Failed to create GitLab project");
    }
  }

  async createPipeline(projectId: number, ref: string, variables?: Record<string, string>): Promise<GitLabPipelineType> {
    this.winstonService.debug(`Creating GitLab pipeline for project ${projectId}, ref: ${ref}`);

    try {
      const payload: Record<string, unknown> = { ref };
      
      if (variables && Object.keys(variables).length > 0) {
        payload.variables = variables;
      }

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/v4/projects/${projectId}/pipeline`,
          payload,
          { headers: this.getHeaders() }
        )
      );

      return this.mapPipeline(response.data);
    } catch (error) {
      this.winstonService.error(`Failed to create GitLab pipeline: ${error}`);
      throw new InternalServerErrorException("Failed to create GitLab pipeline");
    }
  }

  async getPipelineJobs(projectId: number, pipelineId: number): Promise<GitLabJobType[]> {
    this.winstonService.debug(`Getting jobs for pipeline ${pipelineId} in project ${projectId}`);

    try {
      const response = await firstValueFrom(
        this.httpService.get<GitLabJobType[]>(
          `${this.baseUrl}/api/v4/projects/${projectId}/pipelines/${pipelineId}/jobs`,
          { headers: this.getHeaders() }
        )
      );

      return response.data;
    } catch (error) {
      this.winstonService.error(`Failed to get pipeline jobs: ${error}`);
      return [];
    }
  }

  async getJobTrace(projectId: number, jobId: number): Promise<string> {
    this.winstonService.debug(`Getting job trace for job ${jobId}`);

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/api/v4/projects/${projectId}/jobs/${jobId}/trace`,
          { 
            headers: this.getHeaders(),
            responseType: 'text'
          }
        )
      );

      return response.data as string;
    } catch (error) {
      this.winstonService.error(`Failed to get job trace: ${error}`);
      return "";
    }
  }

  private mapProject(data: Record<string, unknown>): GitLabProjectType {
    return {
      id: data.id as number,
      name: data.name as string,
      path: data.path as string,
      webUrl: data.web_url as string,
      httpUrlToRepo: data.http_url_to_repo as string,
    };
  }

  private mapPipeline(data: Record<string, unknown>): GitLabPipelineType {
    return {
      id: data.id as number,
      status: data.status as string,
      ref: data.ref as string,
      sha: data.sha as string,
      webUrl: data.web_url as string,
      createdAt: new Date(data.created_at as string),
    };
  }
}

