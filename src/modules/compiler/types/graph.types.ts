import type { ModelType } from './model.types';
import type { NodeType } from './node.types';
import type { ProtocolType } from './protocol.types';
import type { DataTypeType } from './data-type.types';
import type { CompilerType } from './compiler.types';

export type GraphType = {
  id: number;
  env: string;
  model: ModelType;
  nodes: NodeType[];
  protocols: ProtocolType[];
  dataTypes: DataTypeType[];
  compiler: CompilerType | null;
}
