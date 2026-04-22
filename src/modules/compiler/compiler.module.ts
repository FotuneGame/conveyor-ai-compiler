import { Module } from "@nestjs/common";
import { CompilerController } from "./compiler.controller";

@Module({
    controllers: [CompilerController],
    providers: []
})
export class CompilerModule {}