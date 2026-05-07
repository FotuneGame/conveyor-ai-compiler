import type {
  ConditionType,
  MemoryType,
  FunctionType,
  CallType,
  TimerType,
  IntervalType,
  APIType,
  LLMType,
  CircleType,
} from './node-types.types';
import type { DataType } from './data-type.types';

export type NodeTypeType = {
  id: number;
  name: string;
}

export type NodeType = {
  id: number;
  name: string;
  description: string;
  size: number[];
  position: number[];
  createdAt: Date;
  updatedAt: Date;
  enterDataType: DataType;
  exitDataType: DataType;
  type: NodeTypeType;
  condition?: ConditionType | null;
  memory?: MemoryType | null;
  circle?: CircleType | null;
  function?: FunctionType | null;
  call?: CallType | null;
  timer?: TimerType | null;
  interval?: IntervalType | null;
  api?: APIType | null;
  llm?: LLMType | null;
}
