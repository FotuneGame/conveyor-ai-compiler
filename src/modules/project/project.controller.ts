import { Controller, Post, Get, Body, Param, Delete } from "@nestjs/common";
import { ProjectService } from "./project.service";
import type { TempProjectType, CompileResultType, CreateTempProjectDto } from "./types";


@Controller("project")
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post("create")
  async create(@Body() data: CreateTempProjectDto): Promise<TempProjectType> {
    return await this.projectService.createTempProject(data);
  }

  @Post("compile/:projectId")
  async compile(@Param("projectId") projectId: string): Promise<CompileResultType> {
    return await this.projectService.compileProject(projectId);
  }

  @Post("stop/:projectId")
  async stop(@Param("projectId") projectId: string): Promise<boolean> {
    return await this.projectService.stopProject(projectId);
  }

  @Delete("cleanup/:projectId")
  async cleanup(@Param("projectId") projectId: string): Promise<void> {
    await this.projectService.cleanupProject(projectId);
  }

  @Get(":projectId")
  async get(@Param("projectId") projectId: string): Promise<TempProjectType | undefined> {
    return await this.projectService.getProject(projectId);
  }

  @Get()
  async getAll(): Promise<TempProjectType[]> {
    return await this.projectService.getAllProjects();
  }
}
