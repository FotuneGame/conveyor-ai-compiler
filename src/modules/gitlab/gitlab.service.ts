import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { WinstonService } from "src/shared/logger/winston.service";
import { TerminalService } from "../terminal/terminal.service";
import type { GitLabProjectType, GitLabPipelineType, GitLabJobType, CreateGitLabProjectType } from "./types";

@Injectable()
export class GitLabService {
  private readonly url: string;
  private readonly token: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly winstonService: WinstonService,
    private readonly terminalService: TerminalService,
  ) {
    this.url = this.configService.get<string>("core.gitlab.url", "http://localhost:8080");
    this.token = this.configService.get<string>("core.gitlab.token", "");
  }



  async createProject(data: CreateGitLabProjectType): Promise<GitLabProjectType> {
    this.winstonService.debug(`Creating GitLab project: ${data.name}`);

    try {
      const existing = await this.findProjectByName(data.name);
      if (existing) return existing;

      const response = await firstValueFrom(
        this.httpService.post(`${this.url}/api/v4/projects`, {
          name: data.name,
          visibility: data.visibility || "private",
          description: data.description,
          initialize_with_readme: false,
        }, { headers: this.getHeaders() })
      );
      return this.mapProject(response.data);
    } catch (error) {
      this.winstonService.error(`Failed to create GitLab project: ${error}`);
      throw new InternalServerErrorException("Failed to create GitLab project");
    }
  }

  async findProjectByName(name: string): Promise<GitLabProjectType | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<GitLabProjectType[]>(
          `${this.url}/api/v4/projects?search=${encodeURIComponent(name)}&owned=true&per_page=5`,
          { headers: this.getHeaders() }
        )
      );
      const found = response.data?.find(p => p.name === name);
      return found ? this.mapProject(found) : null;
    } catch {
      return null;
    }
  }

  async createPipeline(projectId: number, ref: string, variables?: Record<string, string>): Promise<GitLabPipelineType> {
    const payload: Record<string, unknown> = { ref };
    if (variables && Object.keys(variables).length > 0) {
      payload.variables = Object.entries(variables).map(([key, value]) => ({
        key,
        value,
      }));
    }

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.url}/api/v4/projects/${projectId}/pipeline`,
        payload,
        { headers: this.getHeaders() }
      )
    );
    return this.mapPipeline(response.data);
  }

  async pushToRepository(projectPath: string, projectId: number, httpUrlToRepo: string): Promise<void> {
    const token = this.configService.get<string>("core.gitlab.token", "");

    const originalUrl = new URL(httpUrlToRepo);
    const path = originalUrl.pathname;
    const host = this.url.replace(/^https?:\/\//, '');
    const authUrl = `http://oauth2:${token}@${host}${path}`;

    const git = (args: string[], extraEnv?: Record<string, string>) => {
      return this.terminalService.execute({
        command: "git",
        args,
        cwd: projectPath,
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(([, v]) => v !== undefined) as [string, string][]
          ),
          ...extraEnv
        }
      });
    };

    await git(["init"]).catch(() => {});
    await git(["config", "user.email", "compiler@example.com"]);
    await git(["config", "user.name", "Compiler"]);
    await git(["branch", "-M", "main"]);
    await git(["remote", "remove", "origin"]).catch(() => {});
    await git(["remote", "add", "origin", authUrl]);
    await git(["add", "."]);

    const status = await git(["status", "--porcelain"]);
    if (!status.stdout?.trim()) return; // нет изменений

    await git(["commit", "-m", `Compiler build ${Date.now()}`]);

    await this.unprotectBranch(projectId, 'main');
    
    const push = await git(["push", "--force", "-u", "origin", "main"], {
      GIT_ASKPASS: "echo",
      GIT_TERMINAL_PROMPT: "0",
    });

    if (push.code !== 0) {
      this.winstonService.error(`Git push failed: ${push.stderr}`);
      throw new InternalServerErrorException("Failed to push to GitLab");
    }
  }

  async getPipelineJobs(projectId: number, pipelineId: number): Promise<GitLabJobType[]> {
    try {
      const res = await firstValueFrom(
        this.httpService.get<GitLabJobType[]>(
          `${this.url}/api/v4/projects/${projectId}/pipelines/${pipelineId}/jobs`,
          { headers: this.getHeaders() }
        )
      );
      return res.data;
    } catch { return []; }
  }

  async getJobTrace(projectId: number, jobId: number): Promise<string> {
    try {
      const res = await firstValueFrom(
        this.httpService.get(
          `${this.url}/api/v4/projects/${projectId}/jobs/${jobId}/trace`,
          { headers: this.getHeaders(), responseType: 'text' }
        )
      );
      return res.data as string;
    } catch { return ""; }
  }

  async unprotectBranch(projectId: number, branchName: string = 'main'): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.delete(
          `${this.url}/api/v4/projects/${projectId}/protected_branches/${branchName}`,
          { headers: this.getHeaders() }
        )
      );
      this.winstonService.debug(`Unprotected branch ${branchName} in project ${projectId}`);
    } catch (error: any) {
      // 404 = ветка уже не защищена — это нормально
      if (error?.response?.status !== 404) {
        this.winstonService.warn(`Failed to unprotect branch ${branchName}: ${error?.message}`);
      }
    }
  }

  async getLatestPipeline(projectId: number): Promise<GitLabPipelineType | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<GitLabPipelineType[]>(
          `${this.url}/api/v4/projects/${projectId}/pipelines?per_page=1`,
          { headers: this.getHeaders() }
        )
      );
      return response.data[0] ? this.mapPipeline(response.data[0]) : null;
    } catch {
      return null;
    }
  }



  private mapProject(data: any): GitLabProjectType {
    return {
      id: data.id, name: data.name, webUrl: data.web_url,
      path: data.path_with_namespace, httpUrlToRepo: data.http_url_to_repo,
    };
  }

  private mapPipeline(data: any): GitLabPipelineType {
    return {
      id: data.id, status: data.status, ref: data.ref,
      sha: data.sha, webUrl: data.web_url, createdAt: new Date(data.created_at),
    };
  }

  private getHeaders(): Record<string, string> {
    return { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" };
  }
}