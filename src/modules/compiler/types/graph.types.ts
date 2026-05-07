import type { CompilerType } from './compiler.types';

export type GraphType = {
  id: number;
  env: string;
  compiler: CompilerType | null;
}
