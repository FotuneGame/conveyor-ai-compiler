import { Module } from "@nestjs/common";
import { CompilerController } from "./compiler.controller";
import { ProjectModule } from "../project/project.module";

@Module({
  imports: [ProjectModule],
  controllers: [CompilerController],
  providers: [],
})
export class CompilerModule {}