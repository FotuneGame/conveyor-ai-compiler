import { Module } from "@nestjs/common";
import { ProjectController } from "./project.controller";
import { ProjectService } from "./project.service";
import { TerminalModule } from "../terminal/terminal.module";
import { GitLabModule } from "../gitlab/gitlab.module";
import { DockerModule } from "../docker/docker.module";
import { TemplateModule } from "../template/template.module";

@Module({
  imports: [TerminalModule, GitLabModule, DockerModule, TemplateModule],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
