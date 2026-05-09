import { Injectable } from "@nestjs/common";
import { spawn } from "child_process";
import { WinstonService } from "src/shared/logger/winston.service";
import type { TerminalExecResultType, TerminalCommandType } from "./types";

@Injectable()
export class TerminalService {
  constructor (
    private readonly winstonService: WinstonService
  ) {}

  async execute(command: TerminalCommandType): Promise<TerminalExecResultType> {
    const { command: cmd, args = [], cwd, env = {} } = command;

    this.winstonService.debug(`Executing command: ${cmd} ${args.join(" ")}`);

    return new Promise((resolve, reject) => {
      const options: Record<string, unknown> = { cwd };

      if (Object.keys(env).length > 0) {
        options.env = { ...process.env, ...env };
      }

      const child = spawn(cmd, args, options);
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data: Buffer) => {
        const str = data.toString();
        stdout += str;
        this.winstonService.debug(`[stdout] ${str.trim()}`);
      });

      child.stderr.on("data", (data: Buffer) => {
        const str = data.toString();
        stderr += str;
        this.winstonService.warn(`[stderr] ${str.trim()}`);
      });

      child.on("close", (code: number) => {
        this.winstonService.debug(`Command finished with code: ${code}`);
        resolve({ code, stdout, stderr });
      });

      child.on("error", (error: Error) => {
        this.winstonService.error(`Command error: ${error.message}`);
        reject(error);
      });
    });
  }

  async executeWithTimeout(command: TerminalCommandType, timeoutMs: number): Promise<TerminalExecResultType> {
    return Promise.race([
      this.execute(command),
      new Promise<TerminalExecResultType>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Command timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  }
}
