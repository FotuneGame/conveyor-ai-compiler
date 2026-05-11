import { Controller, Get } from "@nestjs/common";
import { EnvConfigService } from "./env-config.service";

@Controller()
export class EnvConfigController {
  constructor(private readonly envConfigService: EnvConfigService) {}

  @Get("default")
  async getDefaultEnv(): Promise<string> {
    return await this.envConfigService.getDefaultEnvConfig();
  }
}
