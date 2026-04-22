import { Controller, Get, Post } from "@nestjs/common";

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
}