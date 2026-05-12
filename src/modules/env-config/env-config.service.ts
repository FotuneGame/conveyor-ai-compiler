import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFileSync, existsSync } from "fs";
import { WinstonService } from "src/shared/logger/winston.service";



@Injectable()
export class EnvConfigService {
  constructor(
    private readonly winstonService: WinstonService,
    private readonly configService: ConfigService
  ) {}

  async getDefaultEnvConfig(): Promise<string> {
    const envPath = this.configService.get<string>("core.compiler.envPath", './public/example.env');

    this.winstonService.debug(`Reading default env from: ${envPath}`);

    if (!existsSync(envPath)) {
      this.winstonService.warn(`Example env file not found: ${envPath}`);
      return this.getFallbackEnvConfig();
    }

    try {
      const content = readFileSync(envPath, "utf-8");
      return content;
    } catch (error) {
      this.winstonService.error(`Failed to read env file: ${error}`);
      return this.getFallbackEnvConfig();
    }
  }

  parseEnv(envContent: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = envContent.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.substring(0, separatorIndex).trim();
      let value = trimmed.substring(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }

    return result;
  }

  private getFallbackEnvConfig(): string {
    return `NODE_ENV=production\nPORT=3000\n`;
  }
}
