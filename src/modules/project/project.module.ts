import { Module } from "@nestjs/common";
import { ProjectService } from "./project.service";
import { TerminalModule } from "../terminal/terminal.module";
import { GitLabModule } from "../gitlab/gitlab.module";
import { TemplateModule } from "../template/template.module";
import { BackendModule } from "../backend/backend.module";

@Module({
  imports: [TerminalModule, GitLabModule, TemplateModule, BackendModule],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
