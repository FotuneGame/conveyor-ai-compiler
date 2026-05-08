import { Module } from "@nestjs/common";
import { DockerController } from "./docker.controller";
import { DockerService } from "./docker.service";
import { TerminalModule } from "../terminal/terminal.module";

@Module({
  imports: [TerminalModule],
  controllers: [DockerController],
  providers: [DockerService],
  exports: [DockerService],
})
export class DockerModule {}
