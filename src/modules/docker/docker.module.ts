import { Module } from "@nestjs/common";
import { DockerService } from "./docker.service";
import { TerminalModule } from "../terminal/terminal.module";

@Module({
  imports: [TerminalModule],
  providers: [DockerService],
  exports: [DockerService],
})
export class DockerModule {}
