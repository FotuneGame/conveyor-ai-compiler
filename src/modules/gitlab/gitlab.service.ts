import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { WinstonService } from "src/shared/logger/winston.service";
import { TerminalService } from "../terminal/terminal.service";
import type { GitLabProjectType, GitLabPipelineType, GitLabJobType, CreateGitLabProjectType } from "./types";

@Injectable()
export class GitLabService {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly winstonService: WinstonService,
    private readonly terminalService: TerminalService,
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
    } catch (error: any) {
      // Проверяем если проект уже существует (ошибка 400)
      if (error?.response?.status === 400) {
        this.winstonService.debug(`Project ${data.name} already exists, searching for it`);
        const existing = await this.findProjectByName(data.name);
        if (existing) {
          return existing;
        }
      }
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

  async findProjectByName(name: string): Promise<GitLabProjectType | null> {
    this.winstonService.debug(`Searching GitLab project by name: ${name}`);

    try {
      // Ищем проект по имени через search API
      const response = await firstValueFrom(
        this.httpService.get<{ projects: GitLabProjectType[] }>(
          `${this.baseUrl}/api/v4/projects?search=${encodeURIComponent(name)}&owned=true&per_page=10`,
          { headers: this.getHeaders() }
        )
      );

      const projects = response.data.projects || [];
      const found = projects.find(p => p.name === name);
      
      if (found) {
        this.winstonService.debug(`Found GitLab project: ${found.name} (ID: ${found.id})`);
        return found;
      }

      this.winstonService.debug(`Project ${name} not found`);
      return null;
    } catch (error) {
      this.winstonService.error(`Failed to find GitLab project: ${error}`);
      return null;
    }
  }

  async pushToRepository(projectPath: string, projectId: number, httpUrlToRepo: string): Promise<void> {
    this.winstonService.debug(`Pushing code to GitLab repository: ${httpUrlToRepo}`);

    const token = this.configService.get<string>("core.gitlab.token", "");

    try {
      // Инициализируем git если нужно
      await this.terminalService.execute({
        command: "git",
        args: ["init"],
        cwd: projectPath,
      }).catch(() => {});

      // Настраиваем пользователя
      await this.terminalService.execute({
        command: "git",
        args: ["config", "user.email", "compiler@example.com"],
        cwd: projectPath,
      }).catch(() => {});

      await this.terminalService.execute({
        command: "git",
        args: ["config", "user.name", "Compiler"],
        cwd: projectPath,
      }).catch(() => {});

      // Устанавливаем основную ветку как main
      await this.terminalService.execute({
        command: "git",
        args: ["symbolic-ref", "HEAD", "refs/heads/main"],
        cwd: projectPath,
      }).catch(() => {});

      // Удаляем существующий remote если есть
      try {
        await this.terminalService.execute({
          command: "git",
          args: ["remote", "remove", "origin"],
          cwd: projectPath,
        });
      } catch (e) {
        // remote может не существовать
      }

      // Добавляем remote с токеном в URL
      const authenticatedUrl = httpUrlToRepo.replace('http://', `http://oauth2:${token}@`);
      await this.terminalService.execute({
        command: "git",
        args: ["remote", "add", "origin", authenticatedUrl],
        cwd: projectPath,
      });

      // Добавляем все файлы
      await this.terminalService.execute({
        command: "git",
        args: ["add", "."],
        cwd: projectPath,
      });

      // Проверяем есть ли что коммитить
      const statusResult = await this.terminalService.execute({
        command: "git",
        args: ["status", "--porcelain"],
        cwd: projectPath,
      });

      if (!statusResult.stdout || statusResult.stdout.trim() === "") {
        this.winstonService.debug("No changes to commit");
        return;
      }

      // Делаем коммит
      const commitResult = await this.terminalService.execute({
        command: "git",
        args: ["commit", "-m", `Compiler build ${Date.now()}`],
        cwd: projectPath,
      });

      if (commitResult.code !== 0) {
        this.winstonService.warn(`No changes to commit: ${commitResult.stderr}`);
        // Проверяем есть ли файлы
        const lsResult = await this.terminalService.execute({
          command: "ls",
          args: ["-la"],
          cwd: projectPath,
        });
        this.winstonService.warn(`Project path contents: ${lsResult.stdout}`);
        throw new InternalServerErrorException("No files to commit");
      }

      this.winstonService.debug(`Commit successful`);

      // Отправляем код с force push для автоматического разрешения конфликтов
      const result = await this.terminalService.execute({
        command: "git",
        args: ["push", "--force", "-u", "origin", "main"],
        cwd: projectPath,
        env: {
          ...process.env,
          GIT_ASKPASS: "echo",
          GIT_TERMINAL_PROMPT: "0",
        },
      });

      if (result.code !== 0) {
        this.winstonService.error(`Failed to push to repository: ${result.stderr}`);
        throw new InternalServerErrorException("Failed to push code to GitLab");
      }

      this.winstonService.debug(`Successfully pushed code to ${httpUrlToRepo}`);
    } catch (error) {
      this.winstonService.error(`Failed to push to repository: ${error}`);
      throw new InternalServerErrorException("Failed to push code to GitLab");
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
      webUrl: data.web_url as string,
      path: data.path_with_namespace as string,
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

