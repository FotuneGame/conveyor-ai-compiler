import { Module } from "@nestjs/common";
import { ProjectService } from "./project.service";
import { StoreModule } from "../store/store.module";
import { GitLabModule } from "../gitlab/gitlab.module";
import { TemplateModule } from "../template/template.module";

@Module({
  imports: [StoreModule, GitLabModule, TemplateModule],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
