import type { NodeType, LineType, CompileRequestType } from '../../compiler/types';

export type NodeWithLinesType = NodeType & {
  parentLines?: Array<LineType>;
  childLines?: Array<LineType>;
};

export type ParseErrorType = {
  message: string;
  nodeId?: number;
  field?: string;
};

export type ParseResultType = {
  success: boolean;
  errors: Array<ParseErrorType>;
  nodes: Array<NodeWithLinesType>;
  startNode?: NodeWithLinesType;
};

export type CompileRequestWithLinesType = Omit<CompileRequestType, 'nodes'> & {
  nodes: Array<NodeWithLinesType>;
};
