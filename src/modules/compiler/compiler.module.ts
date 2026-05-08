import { Module } from "@nestjs/common";
import { CompilerController } from "./compiler.controller";
import { ProjectModule } from "../project/project.module";
import { EnvConfigModule } from "../env-config/env-config.module";

@Module({
  imports: [ProjectModule, EnvConfigModule],
  controllers: [CompilerController],
  providers: [],
})
export class CompilerModule {}