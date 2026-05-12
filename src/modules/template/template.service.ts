import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WinstonService } from "src/shared/logger/winston.service";
import type { GeneratedFileType } from "./types";
import type { CompileRequestType } from "../compiler/types";



@Injectable()
export class TemplateService {
  private readonly prefix: string;
  private readonly registry: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly winstonService: WinstonService
  ) {
    this.prefix = this.configService.get<string>("core.compiler.name", "compiler-typescript");
    this.registry = this.configService.get<string>("core.gitlab.registry", "http://localhost:8081");
  }

  generateFiles(context: CompileRequestType): GeneratedFileType[] {
    this.winstonService.debug(`Generating files for model ${context.model.id}/graph ${context.graph.id}`);

    return [
      { path: ".env", content: this.generateEnv(context) },
      { path: ".gitignore", content: this.generateGitignore() },
      { path: ".dockerignore", content: this.generateDockerignore() },
      { path: "Dockerfile", content: this.generateDockerfile(context) },
      { path: ".gitlab-ci.yml", content: this.generateGitlabCi(context) },
      { path: "package.json", content: this.generatePackageJson(context) },
      { path: "tsconfig.json", content: this.generateTsConfig() },
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

  private generateEnv(ctx: CompileRequestType): string {
    const { model, graph } = ctx;
    const baseEnv = {
      NODE_ENV: "production",
      PORT: "3000",
      GRAPH_ID: String(graph.id),
      MODEL_ID: String(model.id),
      MODEL_NAME: model.name,
      MODEL_TAG: model.tag,
    };
    const customEnv = (graph as any).customEnv ?? (graph as any).env;
    const mergedEnv = { ...baseEnv, ...customEnv };
    return Object.entries(mergedEnv).map(([k, v]) => `${k}=${v}`).join("\n");
  }

  private generateGitignore(): string {
    return ["node_modules/", "dist/", "*.log", ".DS_Store"].join("\n");
  }

  private generateDockerignore(): string {
    return ["node_modules", "npm-debug.log", ".git"].join("\n");
  }

  private generateDockerfile(ctx: CompileRequestType): string {
    const customEnv = (ctx.graph as any).customEnv ?? (ctx.graph as any).env;
    const port = customEnv?.PORT ?? "3000";
    return [
      "FROM node:20-alpine",
      "WORKDIR /app",
      "COPY package*.json ./",
      "RUN npm install",
      "COPY . .",
      "RUN npm run build",
      "",
      `EXPOSE ${port}`,
      `ENV PORT=${port}`,
      'CMD ["npm", "run", "start:prod"]',
    ].join("\n");
  }

  private generateGitlabCi(ctx: CompileRequestType): string {
    const { model, graph, gitlab } = ctx;
    const registryHost = this.registry.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const projectPath = gitlab?.project?.path ?? `root/${this.prefix}-${model.id}-${graph.id}`;
    const imageName = `${registryHost}/${projectPath}`;
    
    const containerName = `${this.prefix}-container-${model.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${model.tag.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
    const modelId = model.id;
    const port = (graph as any).customEnv?.PORT ?? "3000";

    const backendUrl = "http://localhost:5000";
    const registryLogin = 
      "git config --global --add safe.directory /builds/$CI_PROJECT_PATH && " +
      "echo \"$CI_REGISTRY_PASSWORD\" | docker login \"$CI_REGISTRY\" -u \"$CI_REGISTRY_USER\" --password-stdin";

    return [
      "default:",
      "  image: docker:latest",
      "",
      "variables:",
      `  CI_REGISTRY: "${registryHost}"`,
      `  CI_REGISTRY_IMAGE: "${imageName}"`,
      `  DOCKER_IMAGE: "${imageName}"`,
      `  CONTAINER_NAME: ${containerName}`,
      `  MODEL_ID: ${modelId}`,
      `  EXTERNAL_PORT: '${port}'`,
      "  DOCKER_DRIVER: overlay2",
      "  DOCKER_TLS_CERTDIR: ''",
      "",
      "stages:",
      "  - build",
      "  - deploy", 
      "  - stop",
      "  - cleanup",
      "",
      "build:",
      "  stage: build",
      "  tags:",
      "    - compiler",
      "  rules:",
      "    - if: '$STOP_CONTAINER != \"true\"'",
      "  before_script:",
      `    - ${registryLogin}`,
      "  script:",
      "    - echo 'Building Docker image...'",
      "    - docker build -t ${DOCKER_IMAGE}:${CI_COMMIT_SHA} .",
      "    - docker tag ${DOCKER_IMAGE}:${CI_COMMIT_SHA} ${DOCKER_IMAGE}:latest",
      "    - echo 'Pushing image...'",
      "    - docker push ${DOCKER_IMAGE}:${CI_COMMIT_SHA}",
      "    - docker push ${DOCKER_IMAGE}:latest",
      "    - echo 'Build completed'",
      "",
      "deploy:",
      "  stage: deploy",
      "  tags:",
      "    - compiler",
      "  rules:",
      "    - if: '$STOP_CONTAINER != \"true\"'",
      "  before_script:",
      `    - ${registryLogin}`,
      "  script:",
      "    - echo 'Starting container...'",
      "    - docker pull ${DOCKER_IMAGE}:${CI_COMMIT_SHA}",
      "    - docker stop $CONTAINER_NAME || true",
      "    - docker rm $CONTAINER_NAME || true",
      `    - docker run -d --name $CONTAINER_NAME -p ${port}:${port} \${DOCKER_IMAGE}:\${CI_COMMIT_SHA}`,
      "    - sleep 10",
      "    - docker ps",
      "    - echo 'Registering container in backend...'",
      "    - |",
      "      CONTAINER_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $CONTAINER_NAME 2>/dev/null || echo 'localhost')",
      `      ENDPOINT_URL=\"http://$CONTAINER_IP:${port}\"`,
      `      DOCKER_URL=\"http://$CONTAINER_IP:${port}\"`,
      "      LOGS_URL=\"${backendUrl}/logs/$MODEL_ID/$CONTAINER_NAME\"",
      "      curl -s -X POST \"${backendUrl}/api/compiler/models/$MODEL_ID/containers\" \\",
      "        -H \"Authorization: Bearer \\$COMPILER_SECRET\" \\",
      "        -H \"Content-Type: application/json\" \\",
      "        -d \"{\\\"name\\\": \\\"$CONTAINER_NAME\\\", \\\"logsUrl\\\": \\\"$LOGS_URL\\\", \\\"dockerUrl\\\": \\\"$DOCKER_URL\\\", \\\"endpointUrl\\\": \\\"$ENDPOINT_URL\\\"}\" || echo 'Container registration skipped'",
      "    - echo 'Container deployed and registered'",
      "",
      "stop_container:",
      "  stage: stop",
      "  tags:",
      "    - compiler",
      "  rules:",
      "    - if: '$STOP_CONTAINER == \"true\"'",
      "  before_script:",
      "    - apk add --no-cache git openssh-client curl jq >/dev/null 2>&1",
      "    - git config --global --add safe.directory /builds/$CI_PROJECT_PATH",
      "  script:",
      "    - echo 'Stopping container...'",
      "    - docker stop $CONTAINER_NAME || true",
      "    - echo 'Updating container status in backend...'",
      "    - |",
      "      CONTAINER_INFO=$(curl -s -H \"Authorization: Bearer \\$COMPILER_SECRET\" \"${backendUrl}/api/compiler/models/$MODEL_ID/containers\" 2>/dev/null || echo '{}')",
      "      CONTAINER_ID=$(echo $CONTAINER_INFO | jq -r \".data[] | select(.name == \\\"$CONTAINER_NAME\\\") | .id\" 2>/dev/null || echo '')",
      "      if [ -n \"$CONTAINER_ID\" ] && [ \"$CONTAINER_ID\" != \"null\" ]; then",
      "        curl -s -X PATCH \"${backendUrl}/api/compiler/models/$MODEL_ID/containers/$CONTAINER_ID\" \\",
      "          -H \"Authorization: Bearer \\$COMPILER_SECRET\" \\",
      "          -H \"Content-Type: application/json\" \\",
      "          -d '{\"active\": false, \"status\": \"stopped\"}' || echo 'Container status update skipped'",
      "        echo 'Container status updated in backend'",
      "      fi",
      "    - docker rm $CONTAINER_NAME || true",
      "    - echo 'Container stopped successfully'",
      "",
      "cleanup:",
      "  stage: cleanup",
      "  tags:",
      "    - compiler",
      "  rules:",
      "    - if: '$STOP_CONTAINER != \"true\"'",
      "  before_script:",
      `    - ${registryLogin}`,
      "  script:",
      "    - docker rmi ${DOCKER_IMAGE}:${CI_COMMIT_SHA} || true",
      "    - docker rmi ${DOCKER_IMAGE}:latest || true",
    ].join("\n");
  }

  private generatePackageJson(ctx: CompileRequestType): string {
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
        express: "^4.21.0",
        cors: "^2.8.5",
        dotenv: "^16.4.5",
      },
      devDependencies: {
        "@types/cors": "^2.8.17",
        "@types/express": "^4.17.21",
        "@types/morgan": "^1.9.9",
        "@types/node": "^20.12.12",
        "ts-node": "^10.9.2",
        "typescript": "^5.4.5",
      },
    }, null, 2);
  }

  private generateTsConfig(): string {
    return JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        module: "commonjs",
        outDir: "./dist",
        rootDir: "./src",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        declaration: true,
        moduleResolution: "node"
      },
      include: ["src/**/*"],
      exclude: ["node_modules", "dist"]
    }, null, 2);
  }

  private generateMainFile(ctx: CompileRequestType): string {
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
      "app.start(Number(port)).then(() => {",
      `  console.log('Server ${model.name} running on port ' + port);`,
      "  console.log('Model ID: ' + process.env.MODEL_ID);",
      "  console.log('Graph ID: ' + process.env.GRAPH_ID);",
      "});",
    ].join("\n");
  }

  private generateAppFile(ctx: CompileRequestType): string {
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