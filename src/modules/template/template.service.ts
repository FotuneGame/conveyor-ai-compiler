import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WinstonService } from "src/shared/logger/winston.service";
import type { GeneratedFileType } from "./types";
import type { CompileRequestType } from "../compiler/types";
import { ParserService } from "../parser/parser.service";
import { GraphTraversalService } from "../graph-traversal/graph-traversal.service";
import { CodegenService } from "../codegen/codegen.service";

@Injectable()
export class TemplateService {
  private readonly prefix: string;
  private readonly registry: string;
  private readonly backend: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly winstonService: WinstonService,
    private readonly parserService: ParserService,
    private readonly graphTraversalService: GraphTraversalService,
    private readonly codegenService: CodegenService,
  ) {
    this.prefix = this.configService.get<string>("core.compiler.name", "compiler-typescript");
    this.registry = this.configService.get<string>("core.gitlab.registry", "http://localhost:8081");
    this.backend = this.configService.get<string>("core.gitlab.backend", "http://host.docker.internal:5000");
  }

  generateFiles(context: CompileRequestType): GeneratedFileType[] {
    this.winstonService.debug(`Generating files for model ${context.model.id}/graph ${context.graph.id}`);

    const parseResult = this.parserService.parse(context);
    if (!parseResult.success) {
      const errorMessage = parseResult.errors.map((e) => e.message).join("; ");
      throw new Error(`Graph validation failed: ${errorMessage}`);
    }

    const graph = this.graphTraversalService.buildGraph(parseResult.nodes);
    const codegen = this.codegenService.generate(context, graph);

    return [
      { path: ".env", content: this.generateEnv(context) },
      { path: ".gitignore", content: this.generateGitignore() },
      { path: ".dockerignore", content: this.generateDockerignore() },
      { path: "Dockerfile", content: this.generateDockerfile(context) },
      { path: ".gitlab-ci.yml", content: this.generateGitlabCi(context) },
      { path: "package.json", content: this.generatePackageJson(context) },
      { path: "tsconfig.json", content: this.generateTsConfig() },
      { path: "src/index.ts", content: this.generateMainFile(context) },
      { path: "src/app.ts", content: codegen.app },
      { path: "src/engine/graph-engine.ts", content: codegen.engine.content },
      { path: "src/types/generated.ts", content: codegen.types },
      ...codegen.nodes.map((n) => ({ path: n.fileName, content: n.content })),
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
    const baseEnv: Record<string, string> = {
      NODE_ENV: "production",
      PORT: "3000",
      GRAPH_ID: String(graph.id),
      MODEL_ID: String(model.id),
      MODEL_NAME: model.name,
      MODEL_TAG: model.tag,
    };
    const mergedEnv: Record<string, string> = { ...baseEnv };
    if (ctx.customEnv) {
      for (const [key, value] of Object.entries(ctx.customEnv)) {
        mergedEnv[key] = String(value);
      }
    }
    return Object.entries(mergedEnv).map(([k, v]) => `${k}=${v}`).join("\n");
  }

  private generateGitignore(): string {
    return ["node_modules/", "dist/", "*.log", ".DS_Store"].join("\n");
  }

  private generateDockerignore(): string {
    return ["node_modules", "npm-debug.log", ".git"].join("\n");
  }

  private generateDockerfile(ctx: CompileRequestType): string {
    const { customEnv } = ctx;
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
    const { model, graph, gitlab, customEnv } = ctx;

    const registryHost = this.registry.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const projectPath = gitlab?.project?.path ?? `root/${this.prefix}-${model.id}-${graph.id}`;
    const imageName = `${registryHost}/${projectPath}`;

    const tagName = model.tag.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const containerName = `${this.prefix}-container-${model.id}-${graph.id}`;
    const port = customEnv?.PORT ?? "3000";
    const backendUrl = this.backend.replace(/\/$/, '');

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
      `  DOCKER_TAG: "${tagName}"`,
      `  CONTAINER_NAME: "${containerName}"`,
      `  MODEL_ID: "${model.id}"`,
      `  GRAPH_ID: "${graph.id}"`,
      `  EXTERNAL_PORT: "${port}"`,
      `  BACKEND: "${backendUrl}"`,
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
      "  tags: [compiler]",
      "  rules:",
      "    - if: '$STOP_CONTAINER != \"true\"'",
      "  before_script:",
      `    - ${registryLogin}`,
      "  script:",
      "    - echo 'Building Docker image...'",
      "    - docker build -t $DOCKER_IMAGE:$CI_COMMIT_SHA .",
      "    - docker tag $DOCKER_IMAGE:$CI_COMMIT_SHA $DOCKER_IMAGE:$DOCKER_TAG",
      "    - docker push $DOCKER_IMAGE:$CI_COMMIT_SHA",
      "    - docker push $DOCKER_IMAGE:latest",
      "    - echo 'Build completed'",
      "",
      "deploy:",
      "  stage: deploy",
      "  tags: [compiler]",
      "  rules:",
      "    - if: '$STOP_CONTAINER != \"true\"'",
      "  before_script:",
      `    - ${registryLogin}`,
      "    - apk add --no-cache curl jq >/dev/null 2>&1",
      "  script:",
      "    - echo 'Starting container...'",
      "    - docker pull $DOCKER_IMAGE:$CI_COMMIT_SHA",
      "    - docker stop $CONTAINER_NAME || true",
      "    - docker rm $CONTAINER_NAME || true",
      "    - docker run -d --name $CONTAINER_NAME -p $EXTERNAL_PORT:$EXTERNAL_PORT $DOCKER_IMAGE:$DOCKER_TAG",
      "    - sleep 10",
      "    - docker ps",
      "    - echo 'Registering container in backend...'",
      "    - |",
      "      export BACKEND=\"$BACKEND\"",
      "      CONTAINER_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $CONTAINER_NAME 2>/dev/null || echo 'localhost')",
      "      ENDPOINT_URL=\"http://$CONTAINER_IP:$EXTERNAL_PORT/api\"",
      "      DOCKER_URL=\"http://$CONTAINER_IP:$EXTERNAL_PORT\"",
      "      LOGS_URL=\"http://$CONTAINER_IP:$EXTERNAL_PORT/logs\"",
      "      curl -s -X POST \"$BACKEND/compiler/models/$MODEL_ID/containers\" \\",
      "        -H \"Authorization: Bearer $COMPILER_SECRET\" \\",
      "        -H \"Content-Type: application/json\" \\",
      "        -d \"{\\\"name\\\": \\\"$CONTAINER_NAME\\\", \\\"logsUrl\\\": \\\"$LOGS_URL\\\", \\\"dockerUrl\\\": \\\"$DOCKER_URL\\\", \\\"endpointUrl\\\": \\\"$ENDPOINT_URL\\\"}\" || echo 'Container registration skipped'",
      "    - echo 'Container deployed and registered'",
      "",
      "stop_container:",
      "  stage: stop",
      "  tags: [compiler]",
      "  rules:",
      "    - if: '$STOP_CONTAINER == \"true\"'",
      "  before_script:",
      "    - apk add --no-cache curl jq >/dev/null 2>&1",
      "    - git config --global --add safe.directory /builds/$CI_PROJECT_PATH",
      "  script:",
      "    - echo 'Stopping container...'",
      "    - docker stop $CONTAINER_NAME || true",
      "    - echo 'Updating container status in backend (DELETE)...'",
      "    - |",
      "      export BACKEND=\"${BACKEND}\"",
      "",
      "      echo \"DEBUG: Searching container '$CONTAINER_NAME' for model $MODEL_ID\"",
      "      echo \"DEBUG: Backend = $BACKEND\"",
      "",
      "      RESPONSE=$(curl -s -H \"Authorization: Bearer $COMPILER_SECRET\" \\",
      "        \"$BACKEND/compiler/models/$MODEL_ID/containers?name=$CONTAINER_NAME&limit=100&page=1&active=true\")",
      "",
      "      echo \"DEBUG: Response = $RESPONSE\"",
      "",
      "      CONTAINER_ID=$(echo \"$RESPONSE\" | jq -r '.data[0]?.id // empty' 2>/dev/null || echo '')",
      "",
      "      if [ -n \"$CONTAINER_ID\" ] && [ \"$CONTAINER_ID\" != \"null\" ] && [ \"$CONTAINER_ID\" != \"\" ]; then",
      "        echo \"Found container ID: $CONTAINER_ID\"",
      "",
      "        curl -s -X DELETE -H \"Authorization: Bearer $COMPILER_SECRET\" \\",
      "          \"$BACKEND/compiler/models/$MODEL_ID/containers/$CONTAINER_ID\"",
      "",
      "        echo 'Container record successfully deleted from backend'",
      "      else",
      "        echo 'Container not found in backend'",
      "      fi",
      "",
      "    - docker rm $CONTAINER_NAME || true",
      "    - echo 'Container stopped and cleaned successfully'",
      "cleanup:",
      "  stage: cleanup",
      "  tags: [compiler]",
      "  rules:",
      "    - if: '$STOP_CONTAINER != \"true\"'",
      "  before_script:",
      `    - ${registryLogin}`,
      "  script:",
      "    - docker rmi $DOCKER_IMAGE:$DOCKER_TAG || true",
      "    - docker rmi $DOCKER_IMAGE:latest || true",
      "    - echo 'Cleanup completed'",
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
        ws: "^8.18.0",
        "socket.io-client": "^4.8.1",
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
}