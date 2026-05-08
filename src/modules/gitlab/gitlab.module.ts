import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { GitLabController } from "./gitlab.controller";
import { GitLabService } from "./gitlab.service";

@Module({
  imports: [HttpModule],
  controllers: [GitLabController],
  providers: [GitLabService],
  exports: [GitLabService],
})
export class GitLabModule {}
