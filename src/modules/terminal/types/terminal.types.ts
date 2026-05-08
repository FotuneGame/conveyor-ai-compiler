export type TerminalExecResultType = {
  code: number;
  stdout: string;
  stderr: string;
};

export type TerminalCommandType = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
};
