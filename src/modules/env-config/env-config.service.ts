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

  private getFallbackEnvConfig(): string {
    return `NODE_ENV=production\nPORT=3000\n`;
  }
}
