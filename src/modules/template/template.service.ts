import { Injectable, Logger } from "@nestjs/common";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { TemplateProjectConfigType, GeneratedFileType, TemplateContextType } from "./types";

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  async generateProject(config: TemplateProjectConfigType, context: TemplateContextType): Promise<string> {
    const { outputDir } = config;

    this.logger.debug("Generating project in: " + outputDir);

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const files = await this.generateFiles(context);

    for (const file of files) {
      const fullPath = join(outputDir, file.path);
      const dir = fullPath.split("/").slice(0, -1).join("/");

      if (dir && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(fullPath, file.content);
      this.logger.debug("Generated file: " + file.path);
    }

    return outputDir;
  }

  async generateFiles(context: TemplateContextType): Promise<GeneratedFileType[]> {
    const files: GeneratedFileType[] = [];

    files.push({
      path: ".env",
      content: this.generateEnv(context),
    });

    files.push({
      path: ".gitignore",
      content: this.generateGitignore(),
    });

    files.push({
      path: ".dockerignore",
      content: this.generateDockerignore(),
    });

    files.push({
      path: "Dockerfile",
      content: this.generateDockerfile(context),
    });

    files.push({
      path: ".gitlab-ci.yml",
      content: this.generateGitlabCi(context),
    });

    files.push({
      path: "package.json",
      content: this.generatePackageJson(context),
    });

    files.push({
      path: "src/index.ts",
      content: this.generateMainFile(context),
    });

    files.push({
      path: "src/app.ts",
      content: this.generateAppFile(context),
    });

    return files;
  }

  private generateEnv(context: TemplateContextType): string {
    const model = context.model;
    const graph = context.graph;

    const env = {
      NODE_ENV: "production",
      PORT: "3000",
      GRAPH_ID: String(graph.id),
      MODEL_ID: String(model.id),
      MODEL_NAME: model.name,
      MODEL_TAG: model.tag,
    };

    return Object.entries(env)
      .map((entry) => entry[0] + "=" + entry[1])
      .join("\n");
  }

  private generateGitignore(): string {
    return [
      "node_modules/",
      "dist/",
      ".env",
      "*.log",
      ".DS_Store",
    ].join("\n");
  }

  private generateDockerignore(): string {
    return [
      "node_modules",
      "npm-debug.log",
      ".git",
      ".env.local",
      ".env.*.local",
    ].join("\n");
  }

  private generateDockerfile(context: TemplateContextType): string {
    return [
      "FROM node:20-alpine",
      "",
      "WORKDIR /app",
      "",
      "COPY package*.json ./",
      "",
      "RUN npm ci --only=production",
      "",
      "COPY . .",
      "",
      "RUN npm run build",
      "",
      "EXPOSE ${PORT:-3000}",
      "",
      'CMD ["npm", "run", "start:prod"]',
    ].join("\n");
  }

  private generateGitlabCi(context: TemplateContextType): string {
    const model = context.model;
    const imageName = model.name.toLowerCase().replace(/[^a-z0-9]/g, "-") + ":" + model.tag;

    return [
      "variables:",
      "  DOCKER_IMAGE: " + imageName,
      "  DOCKER_REGISTRY: registry.gitlab.com",
      "",
      "stages:",
      "  - build",
      "  - test",
      "  - deploy",
      "",
      "build:",
      "  stage: build",
      "  script:",
      "    - docker build -t ${DOCKER_REGISTRY}/${DOCKER_IMAGE} .",
      "    - docker push ${DOCKER_REGISTRY}/${DOCKER_IMAGE}",
      "  only:",
      "    - main",
      "",
      "test:",
      "  stage: test",
      "  script:",
      "    - docker run ${DOCKER_REGISTRY}/${DOCKER_IMAGE} npm test",
      "  only:",
      "    - main",
      "",
      "deploy:",
      "  stage: deploy",
      "  script:",
      "    - docker pull ${DOCKER_REGISTRY}/${DOCKER_IMAGE}",
      "    - docker stop ${DOCKER_IMAGE} || true",
      "    - docker rm ${DOCKER_IMAGE} || true",
      "    - docker run -d --name ${DOCKER_IMAGE} -p 3000:3000 ${DOCKER_REGISTRY}/${DOCKER_IMAGE}",
      "  only:",
      "    - main",
      "  artifacts:",
      "    paths:",
      "      - logs/",
      "    expire_in: 1 week",
    ].join("\n");
  }

  private generatePackageJson(context: TemplateContextType): string {
    const model = context.model;
    const name = model.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const version = model.tag;
    const description = model.description || "Auto-generated Express project";

    const packageJson = {
      name: name,
      version: version,
      description: description,
      main: "dist/index.js",
      scripts: {
        build: "tsc",
        start: "node dist/index.js",
        "start:prod": "node dist/index.js",
        dev: "ts-node src/index.ts",
        test: "echo 'No tests defined'",
      },
      dependencies: {
        express: "^4.18.2",
        cors: "^2.8.5",
        dotenv: "^16.3.1",
      },
      devDependencies: {
        "@types/express": "^4.17.21",
        "@types/node": "^20.10.0",
        "typescript": "^5.3.0",
        "ts-node": "^10.9.2",
      },
    };

    return JSON.stringify(packageJson, null, 2);
  }

  private generateMainFile(context: TemplateContextType): string {
    const model = context.model;
    const modelName = model.name;

    const lines = [
      "import { App } from './app';",
      "import dotenv from 'dotenv';",
      "",
      "dotenv.config();",
      "",
      "const app = new App();",
      "const port = process.env.PORT || 3000;",
      "",
      "app.start(port).then(() => {",
      "  console.log('Server " + modelName + " running on port ' + port);",
      "  console.log('Model ID: ' + process.env.MODEL_ID);",
      "  console.log('Graph ID: ' + process.env.GRAPH_ID);",
      "});",
    ];

    return lines.join("\n");
  }

  private generateAppFile(context: TemplateContextType): string {
    const nodes = context.nodes;

    const nodesInfo = nodes
      .map((node) => "    // Node: " + node.name + " (" + node.type.name + ")")
      .join("\n");

    const lines = [
      "import express, { Request, Response } from 'express';",
      "import cors from 'cors';",
      "",
      "export class App {",
      "  private app: express.Application;",
      "",
      "  constructor() {",
      "    this.app = express();",
      "    this.initializeMiddleware();",
      "    this.initializeRoutes();",
      "  }",
      "",
      "  private initializeMiddleware(): void {",
      "    this.app.use(cors());",
      "    this.app.use(express.json());",
      "  }",
      "",
      "  private initializeRoutes(): void {",
      "    this.app.get('/health', (req: Request, res: Response) => {",
      "      res.json({ status: 'ok', timestamp: new Date().toISOString() });",
      "    });",
      "",
      "    this.app.get('/graph', (req: Request, res: Response) => {",
      "      res.json({",
      "        graphId: process.env.GRAPH_ID,",
      "        modelId: process.env.MODEL_ID,",
      "        modelName: process.env.MODEL_NAME,",
      "      });",
      "    });",
      "",
      nodesInfo,
      "",
      "    this.app.use((req: Request, res: Response) => {",
      "      res.status(404).json({ error: 'Not found' });",
      "    });",
      "  }",
      "",
      "  async start(port: number): Promise<void> {",
      "    return new Promise((resolve) => {",
      "      this.app.listen(port, () => {",
      "        resolve();",
      "      });",
      "    });",
      "  }",
      "",
      "  async stop(): Promise<void> {",
      "    return new Promise((resolve) => {",
      "      this.app.close(() => {",
      "        resolve();",
      "      });",
      "    });",
      "  }",
      "}",
    ];

    return lines.join("\n");
  }
}
