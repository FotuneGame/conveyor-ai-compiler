import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFileSync, existsSync } from "fs";
import { WinstonService } from "src/shared/logger/winston.service";
import type { EnvConfigType } from "./types";

@Injectable()
export class EnvConfigService {
  constructor(
    private readonly winstonService: WinstonService,
    private readonly configService: ConfigService
  ) {}

  async getDefaultEnvConfig(): Promise<EnvConfigType> {
    const envPath = this.configService.get<string>("core.compiler.envPath", './public/example.env');

    this.winstonService.debug(`Reading default env from: ${envPath}`);

    if (!existsSync(envPath)) {
      this.winstonService.warn(`Example env file not found: ${envPath}`);
      return this.getFallbackEnvConfig();
    }

    try {
      const content = readFileSync(envPath, "utf-8");
      return this.parseEnvContent(content);
    } catch (error) {
      this.winstonService.error(`Failed to read env file: ${error}`);
      return this.getFallbackEnvConfig();
    }
  }



  private parseEnvContent(content: string): EnvConfigType {
    const env: EnvConfigType = {};

    const lines = content.split("\n");

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmedLine.substring(0, separatorIndex).trim();
      const value = trimmedLine.substring(separatorIndex + 1).trim();

      if (key) {
        env[key] = value;
      }
    }

    return env;
  }

  private getFallbackEnvConfig(): EnvConfigType {
    return {
      NODE_ENV: "production",
      PORT: "3000",
    };
  }
}
