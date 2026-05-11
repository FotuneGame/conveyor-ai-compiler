import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { WinstonService } from "../../shared/logger/winston.service";
import type { TempProjectType, StoreType } from "./types";



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
    this.projects[projectId] = project;
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

  findProjectByModelAndGraph(modelId: number, graphId: number): TempProjectType | undefined {
    const projects = Object.values(this.projects).filter(
      p => Number(p.modelId) === modelId && Number(p.graphId) === graphId
    );
    
    if (projects.length === 0) {
      this.winstonService.warn(`[Store] ✗ Not found for modelId="${modelId}", graphId="${graphId}"`);
      return undefined;
    }
    
    const latest = projects.reduce((a, b) => 
      new Date(a.createdAt) > new Date(b.createdAt) ? a : b
    );
    
    return {
      ...latest,
      createdAt: new Date(latest.createdAt),
    };
  }

  clear(): void {
    this.projects = {};
    this.saveStore();
  }
}
