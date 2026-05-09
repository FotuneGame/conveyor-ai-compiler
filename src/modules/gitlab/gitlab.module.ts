import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { GitLabService } from "./gitlab.service";
import { TerminalModule } from "../terminal/terminal.module";

@Module({
  imports: [HttpModule, TerminalModule],
  providers: [GitLabService],
  exports: [GitLabService],
})
export class GitLabModule {}
