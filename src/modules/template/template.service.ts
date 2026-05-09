import { Injectable } from "@nestjs/common";
import { WinstonService } from "src/shared/logger/winston.service";
import type { GeneratedFileType, TemplateContextType } from "./types";

@Injectable()
export class TemplateService {
  constructor(
    private readonly winstonService: WinstonService
  ) {}

  generateFiles(context: TemplateContextType): GeneratedFileType[] {
    this.winstonService.debug(`Generating files for model ${context.model.id}/graph ${context.graph.id}`);

    return [
      { path: ".env", content: this.generateEnv(context) },
      { path: ".gitignore", content: this.generateGitignore() },
      { path: ".dockerignore", content: this.generateDockerignore() },
      { path: "Dockerfile", content: this.generateDockerfile(context) },
      { path: ".gitlab-ci.yml", content: this.generateGitlabCi(context) },
      { path: "package.json", content: this.generatePackageJson(context) },
      { path: "src/index.ts", content: this.generateMainFile(context) },
      { path: "src/app.ts", content: this.generateAppFile(context) },
    ];
  }

  patchEnvFile(baseEnv: string, customEnv?: Record<string, string>): string {
    if (!customEnv) return baseEnv;
    
    const customLines = Object.entries(customEnv)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    
    return `${baseEnv}\n${customLines}`;
  }

  private generateEnv(ctx: TemplateContextType): string {
    const { model, graph } = ctx;
    const env = {
      NODE_ENV: "production",
      PORT: "3000",
      GRAPH_ID: String(graph.id),
      MODEL_ID: String(model.id),
      MODEL_NAME: model.name,
      MODEL_TAG: model.tag,
    };
    return Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n");
  }

  private generateGitignore(): string {
    return ["node_modules/", "dist/", ".env", "*.log", ".DS_Store"].join("\n");
  }

  private generateDockerignore(): string {
    return ["node_modules", "npm-debug.log", ".git", ".env.local", ".env.*.local"].join("\n");
  }

  private generateDockerfile(ctx: TemplateContextType): string {
    return [
      "FROM node:20-alpine",
      "",
      "WORKDIR /app",
      "COPY package*.json ./",
      "RUN npm ci --only=production",
      "COPY . .",
      "RUN npm run build",
      "",
      "EXPOSE ${PORT:-3000}",
      'CMD ["npm", "run", "start:prod"]',
    ].join("\n");
  }

  private generateGitlabCi(ctx: TemplateContextType): string {
    const { model } = ctx;
    const imageName = model.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const containerName = `compiler-${imageName}`;
    const modelId = model.id;

    return [
      "variables:",
      `  DOCKER_IMAGE: ${imageName}`,
      `  CONTAINER_NAME: ${containerName}`,
      "  DOCKER_REGISTRY: registry.gitlab.com",
      `  MODEL_ID: ${modelId}`,
      "  BACKEND_URL: ${process.env.BACKEND_URL || 'http://localhost:3000'}",
      "  COMPILER_SECRET: ${process.env.COMPILER_SECRET || 'test-compiler-secret'}",
      "  EXTERNAL_PORT: 3000",
      "",
      "stages:",
      "  - build",
      "  - deploy",
      "  - cleanup",
      "",
      "build:",
      "  stage: build",
      "  image: docker:24-dind",
      "  services:",
      "    - docker:24-dind",
      "  script:",
      "    - docker build -t ${DOCKER_REGISTRY}/${DOCKER_IMAGE}:${CI_COMMIT_SHA} .",
      "    - docker push ${DOCKER_REGISTRY}/${DOCKER_IMAGE}:${CI_COMMIT_SHA}",
      "  rules:",
      "    - if: $CI_COMMIT_BRANCH == 'main'",
      "",
      "deploy:",
      "  stage: deploy",
      "  image: curlimages/curl:latest",
      "  script:",
      '    - |',
      "      # Создаем запись о контейнере в backend",
      '      CONTAINER_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/compiler/models/$MODEL_ID/containers" \\',
      '        -H "Authorization: Bearer $COMPILER_SECRET" \\',
      '        -H "Content-Type: application/json" \\',
      '        -d "{\\"name\\": \\"$CONTAINER_NAME\\", \\"logsUrl\\": \\"$BACKEND_URL/api/compiler/models/$MODEL_ID/containers/$CONTAINER_NAME/logs\\", \\"dockerUrl\\": \\"$BACKEND_URL/api/docker/containers/$CONTAINER_NAME\\", \\"endpointUrl\\": \\"http://$CI_SERVER_FQDN:$EXTERNAL_PORT\\"}")',
      '      CONTAINER_ID=$(echo $CONTAINER_RESPONSE | jq -r \'.id\')',
      "      echo 'Container ID: $CONTAINER_ID'",
      "      echo $CONTAINER_ID > container_id.txt",
      "",
      "    # Запускаем контейнер",
      "    - docker pull ${DOCKER_REGISTRY}/${DOCKER_IMAGE}:${CI_COMMIT_SHA}",
      "    - docker stop $CONTAINER_NAME || true",
      "    - docker rm $CONTAINER_NAME || true",
      "    - docker run -d --name $CONTAINER_NAME -p $EXTERNAL_PORT:3000 ${DOCKER_REGISTRY}/${DOCKER_IMAGE}:${CI_COMMIT_SHA}",
      "",
      "    # Ждем запуска приложения",
      "    - sleep 10",
      "",
      '    - |',
      "      # Обновляем статус контейнера на активный",
      '      if [ -f container_id.txt ]; then',
      '        CONTAINER_ID=$(cat container_id.txt)',
      '        curl -s -X PATCH "$BACKEND_URL/api/compiler/models/$MODEL_ID/containers/$CONTAINER_ID" \\',
      '          -H "Authorization: Bearer $COMPILER_SECRET" \\',
      '          -H "Content-Type: application/json" \\',
      '          -d \'{\\"active\\": true, \\"status\\": \\"running\\", \\"health\\": \\"healthy\\"}\'',
      '      fi',
      "  rules:",
      "    - if: $CI_COMMIT_BRANCH == 'main'",
      "",
      "cleanup:",
      "  stage: cleanup",
      "  image: curlimages/curl:latest",
      "  script:",
      "    # Останавливаем контейнер",
      "    - docker stop $CONTAINER_NAME || true",
      "    - docker rm $CONTAINER_NAME || true",
      "    - docker rmi ${DOCKER_REGISTRY}/${DOCKER_IMAGE}:${CI_COMMIT_SHA} || true",
      "",
      '    - |',
      "      # Обновляем статус контейнера в backend на неактивный",
      '      if [ -f container_id.txt ]; then',
      '        CONTAINER_ID=$(cat container_id.txt)',
      '        curl -s -X PATCH "$BACKEND_URL/api/compiler/models/$MODEL_ID/containers/$CONTAINER_ID" \\',
      '          -H "Authorization: Bearer $COMPILER_SECRET" \\',
      '          -H "Content-Type: application/json" \\',
      '          -d \'{\\"active\\": false, \\"status\\": \\"stopped\\", \\"health\\": \\"unknown\\"}\'',
      '      fi',
      "  rules:",
      "    - if: $CI_PIPELINE_SOURCE == 'web'",
      "    - if: $CI_PIPELINE_SOURCE == 'schedule'",
      "    - if: $STOP_CONTAINER == 'true'",
      "  when: manual",
    ].join("\n");
  }

  private generatePackageJson(ctx: TemplateContextType): string {
    const { model } = ctx;
    const name = model.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    
    return JSON.stringify({
      name,
      version: model.tag,
      description: model.description || "Auto-generated Express project",
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
    }, null, 2);
  }

  private generateMainFile(ctx: TemplateContextType): string {
    const { model } = ctx;
    return [
      "import { App } from './app';",
      "import dotenv from 'dotenv';",
      "",
      "dotenv.config();",
      "",
      "const app = new App();",
      "const port = process.env.PORT || 3000;",
      "",
      "app.start(port).then(() => {",
      `  console.log('Server ${model.name} running on port ' + port);`,
      "  console.log('Model ID: ' + process.env.MODEL_ID);",
      "  console.log('Graph ID: ' + process.env.GRAPH_ID);",
      "});",
    ].join("\n");
  }

  private generateAppFile(ctx: TemplateContextType): string {
    const { nodes } = ctx;
    const nodesInfo = nodes.map(n => `    // Node: ${n.name} (${n.type.name})`).join("\n");

    return [
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
      "      this.app.listen(port, () => resolve());",
      "    });",
      "  }",
      "",
      "  async stop(): Promise<void> {",
      "    return new Promise((resolve) => {",
      "      // @ts-expect-error express app.close exists in @types/express",
      "      this.app.close(() => resolve());",
      "    });",
      "  }",
      "}",
    ].join("\n");
  }
}