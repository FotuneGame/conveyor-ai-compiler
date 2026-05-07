import { Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "src/common/guards/auth.guard";
import type { Request } from "express";

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
    async compile(
        @Req() req: Request
    ) {
        console.log("compilate");
        return req.body;
    }

    @Post("/stop")
    async stop(
        @Req() req: Request
    ) {
        console.log("stop");
        return req.body;
    }
}