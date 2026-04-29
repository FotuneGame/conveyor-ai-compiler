import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "src/common/guards/auth.guard";

@UseGuards(AuthGuard)
@Controller()
export class CompilerController {
    constructor(){}

    @Get("/default")
    async getDefaultEnv() {
        console.log("default");
        return "default env";
    }

    @Post("/compilate")
    async compile() {
        console.log("compilate");
        return "compiled";
    }

    @Post("/stop")
    async stop() {
        console.log("stop");
        return "stopped";
    }
}