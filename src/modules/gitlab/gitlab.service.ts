import { Injectable, Logger, InternalServerErrorException } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import type {
  GitLabProjectType,
  GitLabCommitType,
  GitLabPipelineType,
  CreateGitLabProjectDto,
  GitLabConfigType,
} from "./types";
import type { PushToGitLabDto } from "./dto/push.dto";

@Injectable()
export class GitLabService {
  private readonly logger = new Logger(GitLabService.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly projectId: number;
  private readonly namespaceId: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.baseUrl = this.configService.get<string>("core.gitlab.baseUrl", "https://gitlab.com");
    this.token = this.configService.get<string>("core.gitlab.token", "");
    this.projectId = this.configService.get<number>("core.gitlab.projectId", 0);
    this.namespaceId = this.configService.get<number>("core.gitlab.namespaceId", 0);
  }

  private getHeaders(): Record<string, string> {
    return {
      "PRIVATE-TOKEN": this.token,
      "Content-Type": "application/json",
    };
  }

  async createProject(data: CreateGitLabProjectDto): Promise<GitLabProjectType> {
    this.logger.debug(`Creating GitLab project: ${data.name}`);

    try {
      const payload: Record<string, unknown> = {
        name: data.name,
        visibility: data.visibility || "private",
      };

      if (data.description) {
        payload.description = data.description;
      }

      if (data.namespaceId) {
        payload.namespace_id = data.namespaceId;
      }

      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/v4/projects`, payload, {
          headers: this.getHeaders(),
        })
      );

      return this.mapProject(response.data);
    } catch (error) {
      this.logger.error(`Failed to create GitLab project: ${error}`);
      throw new InternalServerErrorException("Failed to create GitLab project");
    }
  }

  async getProject(projectId: number): Promise<GitLabProjectType> {
    this.logger.debug(`Getting GitLab project: ${projectId}`);

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/v4/projects/${projectId}`, {
          headers: this.getHeaders(),
        })
      );

      return this.mapProject(response.data);
    } catch (error) {
      this.logger.error(`Failed to get GitLab project: ${error}`);
      throw new InternalServerErrorException("Failed to get GitLab project");
    }
  }

  async deleteProject(projectId: number): Promise<void> {
    this.logger.debug(`Deleting GitLab project: ${projectId}`);

    try {
      await firstValueFrom(
        this.httpService.delete(`${this.baseUrl}/api/v4/projects/${projectId}`, {
          headers: this.getHeaders(),
        })
      );
    } catch (error) {
      this.logger.error(`Failed to delete GitLab project: ${error}`);
      throw new InternalServerErrorException("Failed to delete GitLab project");
    }
  }

  async createPipeline(projectId: number, ref: string): Promise<GitLabPipelineType> {
    this.logger.debug(`Creating GitLab pipeline for project ${projectId}, ref: ${ref}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/v4/projects/${projectId}/pipeline`,
          { ref },
          { headers: this.getHeaders() }
        )
      );

      return this.mapPipeline(response.data);
    } catch (error) {
      this.logger.error(`Failed to create GitLab pipeline: ${error}`);
      throw new InternalServerErrorException("Failed to create GitLab pipeline");
    }
  }

  async getPipeline(projectId: number, pipelineId: number): Promise<GitLabPipelineType> {
    this.logger.debug(`Getting GitLab pipeline: ${pipelineId}`);

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/api/v4/projects/${projectId}/pipelines/${pipelineId}`,
          { headers: this.getHeaders() }
        )
      );

      return this.mapPipeline(response.data);
    } catch (error) {
      this.logger.error(`Failed to get GitLab pipeline: ${error}`);
      throw new InternalServerErrorException("Failed to get GitLab pipeline");
    }
  }

  async getLastCommits(projectId: number, ref: string = "main"): Promise<GitLabCommitType[]> {
    this.logger.debug(`Getting last commits for project ${projectId}`);

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/api/v4/projects/${projectId}/repository/commits?ref_name=${ref}`,
          { headers: this.getHeaders() }
        )
      );

      return response.data.map((commit: unknown) => this.mapCommit(commit));
    } catch (error) {
      this.logger.error(`Failed to get commits: ${error}`);
      throw new InternalServerErrorException("Failed to get commits");
    }
  }

  getProjectHttpUrl(projectId: number): string {
    return `${this.baseUrl}/api/v4/projects/${projectId}/repository/archive.zip`;
  }

  getConfig(): GitLabConfigType {
    return {
      baseUrl: this.baseUrl,
      token: this.token,
      projectId: this.projectId,
      namespaceId: this.namespaceId,
    };
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

  private mapCommit(data: unknown): GitLabCommitType {
    const commit = data as Record<string, unknown>;
    return {
      id: commit.id as string,
      short_id: commit.short_id as string,
      title: commit.title as string,
      message: commit.message as string,
      author_name: commit.author_name as string,
      author_email: commit.author_email as string,
      created_at: new Date(commit.created_at as string),
    };
  }
}
