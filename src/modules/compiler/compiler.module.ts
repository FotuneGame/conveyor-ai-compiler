import { Module } from "@nestjs/common";
import { CompilerController } from "./compiler.controller";
import { ProjectModule } from "../project/project.module";
import { GitLabModule } from "../gitlab/gitlab.module";

@Module({
  imports: [ProjectModule, GitLabModule],
  controllers: [CompilerController],
  providers: [],
})
export class CompilerModule {}