import { Controller, Post, Get, Body, Param, Logger } from "@nestjs/common";
import { GitLabService } from "./gitlab.service";
import type { GitLabProjectType, GitLabPipelineType, GitLabCommitType } from "./types";
import type { CreateGitLabProjectDto } from "./types";
import type { PushToGitLabDto } from "./dto/push.dto";

@Controller("gitlab")
export class GitLabController {
  private readonly logger = new Logger(GitLabController.name);

  constructor(private readonly gitLabService: GitLabService) {}

  @Post("project")
  async createProject(@Body() data: CreateGitLabProjectDto): Promise<GitLabProjectType> {
    this.logger.debug(`Creating project via controller: ${data.name}`);
    return await this.gitLabService.createProject(data);
  }

  @Get("project/:id")
  async getProject(@Param("id") id: string): Promise<GitLabProjectType> {
    this.logger.debug(`Getting project via controller: ${id}`);
    return await this.gitLabService.getProject(parseInt(id, 10));
  }

  @Post("project/:id/delete")
  async deleteProject(@Param("id") id: string): Promise<void> {
    this.logger.debug(`Deleting project via controller: ${id}`);
    return await this.gitLabService.deleteProject(parseInt(id, 10));
  }

  @Post("pipeline/:projectId")
  async createPipeline(
    @Param("projectId") projectId: string,
    @Body() body: { ref: string }
  ): Promise<GitLabPipelineType> {
    this.logger.debug(`Creating pipeline for project: ${projectId}`);
    return await this.gitLabService.createPipeline(parseInt(projectId, 10), body.ref);
  }

  @Get("pipeline/:projectId/:pipelineId")
  async getPipeline(
    @Param("projectId") projectId: string,
    @Param("pipelineId") pipelineId: string
  ): Promise<GitLabPipelineType> {
    this.logger.debug(`Getting pipeline: ${pipelineId}`);
    return await this.gitLabService.getPipeline(
      parseInt(projectId, 10),
      parseInt(pipelineId, 10)
    );
  }

  @Get("commits/:projectId")
  async getLastCommits(
    @Param("projectId") projectId: string,
    @Body() body?: { ref: string }
  ): Promise<GitLabCommitType[]> {
    this.logger.debug(`Getting commits for project: ${projectId}`);
    return await this.gitLabService.getLastCommits(
      parseInt(projectId, 10),
      body?.ref || "main"
    );
  }
}
