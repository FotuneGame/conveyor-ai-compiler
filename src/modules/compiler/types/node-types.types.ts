import type { ProtocolType } from './protocol.types';

export type ConditionType = {
  id: number;
  expression: string;
}

export type MemoryType = {
  id: number;
  maxSize: number | null;
  maxDate: Date | null;
}

export type FunctionType = {
  id: number;
  name: string;
  body: string;
}

export type CallType = {
  id: number;
  name: string;
}

export type TimerType = {
  id: number;
  start: Date;
  end: Date;
}

export type IntervalType = {
  id: number;
  start: Date;
  milliseconds: number;
}

export type APIType = {
  id: number;
  protocol: ProtocolType;
}

export type LLMType = {
  id: number;
  temperature: number;
  prompt: string;
  context: string;
  size: number;
  protocol: ProtocolType;
}

export type CircleType = {
  id: number;
  expression: string;
  maxStep: number | null;
}
