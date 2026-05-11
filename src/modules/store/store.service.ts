import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { WinstonService } from "../../shared/logger/winston.service";
import type { TempProjectType } from "./types";

export interface StoreType {
  [projectId: string]: {
    id: string;
    path: string;
    graphId: string;
    modelId: string;
    containerName: string;
    imageName: string;
    createdAt: string;
    gitLabPipelineId?: number;
    gitLabId?: number;
  };
}

@Injectable()
export class StoreService implements OnModuleInit, OnModuleDestroy {
  private storePath: string;
  private projects: StoreType = {};

  constructor(
    private readonly configService: ConfigService,
    private readonly winstonService: WinstonService
  ) {
    const tempDir = this.configService.get<string>("core.compiler.tempDir", "./tmp/compiler-projects");
    this.storePath = join(tempDir, "..", "store.json");
  }

  onModuleInit(): void {
    this.loadStore();
  }

  onModuleDestroy(): void {
    this.saveStore();
  }

  private loadStore(): void {
    try {
      if (existsSync(this.storePath)) {
        const data = readFileSync(this.storePath, "utf-8");
        this.projects = JSON.parse(data);
        this.winstonService.debug(`Loaded ${Object.keys(this.projects).length} projects from store`);
      }
    } catch (error) {
      this.winstonService.warn(`Failed to load project store: ${error}`);
      this.projects = {};
    }
  }

  private saveStore(): void {
    try {
      writeFileSync(this.storePath, JSON.stringify(this.projects, null, 2));
    } catch (error) {
      this.winstonService.warn(`Failed to save project store: ${error}`);
    }
  }

  set(projectId: string, project: TempProjectType): void {
    this.projects[projectId] = {
      ...project,
      createdAt: project.createdAt.toISOString(),
    };
    this.saveStore();
  }

  get(projectId: string): TempProjectType | undefined {
    const project = this.projects[projectId];
    if (!project) return undefined;
    return {
      ...project,
      createdAt: new Date(project.createdAt),
    };
  }

  delete(projectId: string): void {
    const keepTempFiles = this.configService.get<boolean>("core.compiler.keepTempFiles", false);
    if(keepTempFiles)
      return;
    delete this.projects[projectId];
    this.saveStore();
  }

  getAll(): StoreType {
    return this.projects;
  }

  findProjectByModelAndGraph(modelId: string, graphId: string): TempProjectType | undefined {
    const project = Object.values(this.projects).find(
      (p) => p.modelId === modelId && p.graphId === graphId
    );
    if (!project) return undefined;
    return {
      ...project,
      createdAt: new Date(project.createdAt),
    };
  }

  clear(): void {
    this.projects = {};
    this.saveStore();
  }
}
