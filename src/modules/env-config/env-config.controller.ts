import { Controller, Get } from "@nestjs/common";
import { EnvConfigService } from "./env-config.service";
import type { EnvConfigType } from "./types";

@Controller("env-config")
export class EnvConfigController {
  constructor(private readonly envConfigService: EnvConfigService) {}

  @Get("default")
  async getDefaultEnv(): Promise<EnvConfigType> {
    return await this.envConfigService.getDefaultEnvConfig();
  }
}
