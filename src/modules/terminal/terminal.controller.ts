import { Controller, Post, Body } from "@nestjs/common";
import { TerminalService } from "./terminal.service";
import type { TerminalCommandType, TerminalExecResultType } from "./types";

@Controller("terminal")
export class TerminalController {
  constructor(private readonly terminalService: TerminalService) {}

  @Post("execute")
  async execute(@Body() command: TerminalCommandType): Promise<TerminalExecResultType> {
    return await this.terminalService.execute(command);
  }

  @Post("execute-simple")
  async executeSimple(@Body() { command, cwd }: { command: string; cwd?: string }): Promise<TerminalExecResultType> {
    return await this.terminalService.executeSimple(command, cwd);
  }
}
