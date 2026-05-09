import { Module } from "@nestjs/common";
import { ProjectService } from "./project.service";
import { TerminalModule } from "../terminal/terminal.module";
import { GitLabModule } from "../gitlab/gitlab.module";
import { DockerModule } from "../docker/docker.module";
import { TemplateModule } from "../template/template.module";
import { BackendModule } from "../backend/backend.module";

@Module({
  imports: [TerminalModule, GitLabModule, DockerModule, TemplateModule, BackendModule],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
