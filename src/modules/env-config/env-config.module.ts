import { Module } from "@nestjs/common";
import { EnvConfigController } from "./env-config.controller";
import { EnvConfigService } from "./env-config.service";

@Module({
  controllers: [EnvConfigController],
  providers: [EnvConfigService],
  exports: [EnvConfigService],
})
export class EnvConfigModule {}
