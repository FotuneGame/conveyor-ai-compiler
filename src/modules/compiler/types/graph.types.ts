import type { CompilerType } from './compiler.types';

export type GraphType = {
  id: number;
  name: string;
  env: string;
  compiler: CompilerType | null;
}
