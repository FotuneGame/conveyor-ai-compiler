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
  private readonly internalUrl: string | undefined;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly winstonService: WinstonService,
    private readonly terminalService: TerminalService,
  ) {
    this.baseUrl = this.configService.get<string>("core.gitlab.baseUrl", "https://gitlab.com");
    this.token = this.configService.get<string>("core.gitlab.token", "");
    this.internalUrl = this.configService.get<string>("core.gitlab.internalUrl");
  }

  /**
   * Преобразует внешний URL GitLab во внутренний для использования внутри Docker сети
   * Например: http://localhost:8080 -> http://gitlab:80
   */
  private getInternalGitUrl(httpUrlToRepo: string): string {
    if (!this.internalUrl) {
      return httpUrlToRepo;
    }

    // Заменяем внешний URL на внутренний
    // Например: http://localhost:8080/root/project.git -> http://gitlab:80/root/project.git
    const externalUrlPattern = /^https?:\/\/[^\/]+/;
    return httpUrlToRepo.replace(externalUrlPattern, this.internalUrl);
  }

  private getHeaders(): Record<string, string> {
    return {
      "PRIVATE-TOKEN": this.token,
      "Content-Type": "application/json",
    };
  }

  async createProject(data: CreateGitLabProjectType): Promise<GitLabProjectType> {
    this.winstonService.debug(`Creating GitLab project: ${data.name}`);

    // Сначала проверяем существует ли проект
    const existing = await this.findProjectByName(data.name);
    if (existing) {
      this.winstonService.debug(`Project ${data.name} already exists (ID: ${existing.id})`);
      return existing;
    }

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

      const project = this.mapProject(response.data);
      this.winstonService.debug(`Created GitLab project: ${project.name} (ID: ${project.id})`);
      
      // Даем время на синхронизацию
      await this.delay(1000);
      
      return project;
    } catch (error: any) {
      this.winstonService.error(`Failed to create GitLab project: ${error}`);
      
      // Если ошибка 400 - возможно проект был создан параллельно
      if (error?.response?.status === 400) {
        this.winstonService.debug(`Project might already exist, searching...`);
        const found = await this.findProjectByName(data.name);
        if (found) {
          return found;
        }
      }
      
      throw new InternalServerErrorException("Failed to create GitLab project");
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
      // Сначала пробуем поиск через API search
      const searchResponse = await firstValueFrom(
        this.httpService.get<{ projects: GitLabProjectType[] }>(
          `${this.baseUrl}/api/v4/projects?search=${encodeURIComponent(name)}&owned=true&per_page=20`,
          { headers: this.getHeaders() }
        )
      );

      const searchProjects = searchResponse.data.projects || [];
      const found = searchProjects.find(p => p.name === name);
      
      if (found) {
        this.winstonService.debug(`Found GitLab project via search: ${found.name} (ID: ${found.id})`);
        return found;
      }

      // Если не нашли через поиск, пробуем получить все проекты пользователя
      this.winstonService.debug(`Project not found in search, fetching all projects...`);
      
      let allProjects: GitLabProjectType[] = [];
      let page = 1;
      const perPage = 100;
      
      while (true) {
        const response = await firstValueFrom(
          this.httpService.get<GitLabProjectType[]>(
            `${this.baseUrl}/api/v4/projects?owned=true&per_page=${perPage}&page=${page}`,
            { headers: this.getHeaders() }
          )
        );
        
        const projects = response.data || [];
        if (projects.length === 0) {
          break;
        }
        
        allProjects = allProjects.concat(projects);
        
        const foundInPage = projects.find(p => p.name === name);
        if (foundInPage) {
          this.winstonService.debug(`Found GitLab project via list: ${foundInPage.name} (ID: ${foundInPage.id})`);
          return foundInPage;
        }
        
        if (projects.length < perPage) {
          break;
        }
        
        page++;
        
        // Защита от бесконечного цикла
        if (page > 10) {
          break;
        }
      }

      this.winstonService.debug(`Project ${name} not found after checking all projects`);
      return null;
    } catch (error) {
      this.winstonService.error(`Failed to find GitLab project: ${error}`);
      return null;
    }
  }

  async pushToRepository(projectPath: string, projectId: number, httpUrlToRepo: string): Promise<void> {
    this.winstonService.debug(`Pushing code to GitLab repository: ${httpUrlToRepo}`);
    this.winstonService.debug(`Project ID: ${projectId}, Path: ${projectPath}`);

    const token = this.configService.get<string>("core.gitlab.token", "");

    // Используем внутренний URL если он настроен
    const gitUrl = this.getInternalGitUrl(httpUrlToRepo);
    this.winstonService.log(`Using Git URL for push: ${gitUrl}`);

    try {
      // Проверяем что проект существует на диске
      const lsResult = await this.terminalService.execute({
        command: "ls",
        args: ["-la"],
        cwd: projectPath,
      });
      this.winstonService.debug(`Project path contents: ${lsResult.stdout}`);

      // Инициализируем git если нужно
      const initResult = await this.terminalService.execute({
        command: "git",
        args: ["init"],
        cwd: projectPath,
      });
      this.winstonService.debug(`Git init result: ${initResult.stdout} ${initResult.stderr}`);

      // Настраиваем пользователя
      await this.terminalService.execute({
        command: "git",
        args: ["config", "user.email", "compiler@example.com"],
        cwd: projectPath,
      });

      await this.terminalService.execute({
        command: "git",
        args: ["config", "user.name", "Compiler"],
        cwd: projectPath,
      });

      // Устанавливаем основную ветку как main
      await this.terminalService.execute({
        command: "git",
        args: ["symbolic-ref", "HEAD", "refs/heads/main"],
        cwd: projectPath,
      }).catch(() => {});

      // Проверяем есть ли файлы для коммита
      const lsFilesResult = await this.terminalService.execute({
        command: "find",
        args: [projectPath, "-type", "f"],
      });
      this.winstonService.log(`Files to commit: ${lsFilesResult.stdout}`);

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

      // Добавляем remote с токеном в URL - используем внутренний URL
      const authenticatedUrl = gitUrl.replace('http://', `http://oauth2:${token}@`);
      this.winstonService.log(`Adding remote origin with authentication`);
      
      const addRemoteResult = await this.terminalService.execute({
        command: "git",
        args: ["remote", "add", "origin", authenticatedUrl],
        cwd: projectPath,
      });
      this.winstonService.debug(`Add remote result: ${addRemoteResult.stdout} ${addRemoteResult.stderr}`);

      // Добавляем все файлы
      const addResult = await this.terminalService.execute({
        command: "git",
        args: ["add", "."],
        cwd: projectPath,
      });
      this.winstonService.debug(`Git add result: ${addResult.stdout} ${addResult.stderr}`);

      // Проверяем есть ли что коммитить
      const statusResult = await this.terminalService.execute({
        command: "git",
        args: ["status", "--porcelain"],
        cwd: projectPath,
      });

      this.winstonService.log(`Git status: ${statusResult.stdout}`);

      if (!statusResult.stdout || statusResult.stdout.trim() === "") {
        this.winstonService.warn("No changes to commit - repository may already be up to date");
        return;
      }

      // Делаем коммит
      const commitResult = await this.terminalService.execute({
        command: "git",
        args: ["commit", "-m", `Compiler build ${Date.now()}`],
        cwd: projectPath,
      });

      this.winstonService.log(`Commit result: code=${commitResult.code}, stdout=${commitResult.stdout}, stderr=${commitResult.stderr}`);

      if (commitResult.code !== 0) {
        this.winstonService.warn(`No changes to commit: ${commitResult.stderr}`);
        const lsResult2 = await this.terminalService.execute({
          command: "ls",
          args: ["-la"],
          cwd: projectPath,
        });
        this.winstonService.warn(`Project path contents: ${lsResult2.stdout}`);
        throw new InternalServerErrorException("No files to commit");
      }

      this.winstonService.log(`Commit successful`);

      // Проверяем remote перед push
      const remoteResult = await this.terminalService.execute({
        command: "git",
        args: ["remote", "-v"],
        cwd: projectPath,
      });
      this.winstonService.log(`Remote list: ${remoteResult.stdout}`);

      // Проверяем связь с remote перед push
      const lsRemoteResult = await this.terminalService.execute({
        command: "git",
        args: ["ls-remote", "origin"],
        cwd: projectPath,
      });
      this.winstonService.debug(`LS-REMOTE result: ${lsRemoteResult.stdout} ${lsRemoteResult.stderr}`);

      // Отправляем код с force push для автоматического разрешения конфликтов
      this.winstonService.log(`Pushing to origin/main...`);
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

      this.winstonService.log(`Push result: code=${result.code}, stdout=${result.stdout}, stderr=${result.stderr}`);

      if (result.code !== 0) {
        this.winstonService.error(`Failed to push to repository: ${result.stderr}`);
        this.winstonService.error(`Push stderr: ${result.stderr}`);
        this.winstonService.error(`Push stdout: ${result.stdout}`);
        throw new InternalServerErrorException(`Failed to push code to GitLab: ${result.stderr}`);
      }

      this.winstonService.log(`Successfully pushed code to ${gitUrl}`);
    } catch (error) {
      this.winstonService.error(`Failed to push to repository: ${error}`);
      throw new InternalServerErrorException(`Failed to push code to GitLab: ${error instanceof Error ? error.message : String(error)}`);
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

