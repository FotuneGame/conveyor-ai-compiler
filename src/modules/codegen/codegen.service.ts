import { Injectable } from '@nestjs/common';
import type {
  CompileRequestType,
  FunctionType,
  APIType,
  LLMType,
  ConditionType,
  CircleType,
  TimerType,
  IntervalType,
  MemoryType,
  CallType,
  DataType,
} from '../compiler/types';
import type { NodeWithLinesType } from '../parser/types';
import type { GraphType } from '../graph-traversal/types';
import type { CodegenResultType, GeneratedNodeType, GeneratedEngineType } from './types';

@Injectable()
export class CodegenService {
  generate(context: CompileRequestType, graph: GraphType): CodegenResultType {
    const nodes = context.nodes as Array<NodeWithLinesType>;
    const nodeFiles: Array<GeneratedNodeType> = [];

    for (const node of nodes) {
      nodeFiles.push(this.generateNode(node));
    }

    const engine = this.generateEngine(graph);
    const types = this.generateTypes(context.dataTypes);
    const app = this.generateApp(graph, context.model.name);

    return { nodes: nodeFiles, engine, types, app };
  }

  private generateNode(node: NodeWithLinesType): GeneratedNodeType {
    const enterType = this.sanitizeTypeName(node.enterDataType?.name || 'unknown');
    const exitType = this.sanitizeTypeName(node.exitDataType?.name || 'unknown');
    let body = '';

    if (node.function) {
      body = this.generateFunctionNode(node.function);
    } else if (node.api) {
      body = this.generateApiNode(node.api);
    } else if (node.llm) {
      body = this.generateLlmNode(node.llm);
    } else if (node.condition) {
      body = this.generateConditionNode(node.condition);
    } else if (node.circle) {
      body = this.generateCircleNode(node.circle);
    } else if (node.timer) {
      body = this.generateTimerNode(node.timer);
    } else if (node.interval) {
      body = this.generateIntervalNode(node.interval);
    } else if (node.memory) {
      body = this.generateMemoryNode(node.memory);
    } else if (node.call) {
      body = this.generateCallNode(node.call);
    } else {
      body = `return input as ${exitType};`;
    }

    const typeImports = enterType === exitType ? enterType : `${enterType}, ${exitType}`;
    const content = [
      `import type { ${typeImports} } from '../types/generated';`,
      ``,
      `export async function node_${node.id}(input: ${enterType}, env: Record<string, unknown>): Promise<${exitType}> {`,
      `  ${body}`,
      `}`,
    ].join('\n');

    return {
      id: node.id,
      name: node.name,
      fileName: `src/nodes/node_${node.id}.ts`,
      content,
    };
  }

  private generateFunctionNode(fn: FunctionType): string {
    const args = fn.args ? fn.args.split(',').map((a) => a.trim()).filter(Boolean) : [];
    const argsStr = args.length > 0 ? `const [${args.join(', ')}] = input as unknown[];` : '';
    return [
      argsStr,
      `const fn = ${fn.body};`,
      `return fn(${args.join(', ')}) as unknown;`,
    ]
      .filter(Boolean)
      .join('\n  ');
  }

  private generateApiNode(api: APIType): string {
    const protocol = api.protocol;
    if (protocol.http) {
      const headers = protocol.http.headers || '{}';
      return [
        `const response = await fetch('${protocol.http.url}', {`,
        `  method: '${protocol.http.method}',`,
        `  headers: ${headers},`,
        `  body: ${protocol.http.body ? `JSON.stringify(${protocol.http.body})` : 'undefined'},`,
        `});`,
        `return await response.json() as unknown;`,
      ].join('\n  ');
    }
    return `return input as unknown;`;
  }

  private generateLlmNode(llm: LLMType): string {
    const url = llm.protocol.http?.url || '';
    return [
      `const response = await fetch('${url}', {`,
      `  method: 'POST',`,
      `  headers: { 'Content-Type': 'application/json' },`,
      `  body: JSON.stringify({ prompt: ${JSON.stringify(llm.prompt)}, temperature: ${llm.temperature}, context: ${JSON.stringify(llm.context)} }),`,
      `});`,
      `return await response.json() as unknown;`,
    ].join('\n  ');
  }

  private generateConditionNode(condition: ConditionType): string {
    return [
      `const condition = Boolean(${condition.expression});`,
      `return { condition, data: input } as unknown;`,
    ].join('\n  ');
  }

  private generateCircleNode(circle: CircleType): string {
    return [
      `let step = 0;`,
      `while (step < ${circle.maxStep ?? 1000} && (${circle.expression})) {`,
      `  step++;`,
      `}`,
      `return input as unknown;`,
    ].join('\n  ');
  }

  private generateTimerNode(timer: TimerType): string {
    return [
      `const delay = new Date('${timer.end.toISOString()}').getTime() - Date.now();`,
      `await new Promise((r) => setTimeout(r, Math.max(delay, 0)));`,
      `return input as unknown;`,
    ].join('\n  ');
  }

  private generateIntervalNode(interval: IntervalType): string {
    return [
      `await new Promise((r) => setTimeout(r, ${interval.milliseconds}));`,
      `return input as unknown;`,
    ].join('\n  ');
  }

  private generateMemoryNode(memory: MemoryType): string {
    return [
      `const store = (env.__memory as Map<string, unknown>) || new Map();`,
      `store.set('node_${memory.id}', input);`,
      `env.__memory = store;`,
      `return input as unknown;`,
    ].join('\n  ');
  }

  private generateCallNode(call: CallType): string {
    return [
      `// Call ${call.name}(${call.args})`,
      `return input as unknown;`,
    ].join('\n  ');
  }

  private generateEngine(graph: GraphType): GeneratedEngineType {
    const nodeImports = Array.from(graph.nodes.values())
      .map((n) => `import { node_${n.id} } from '../nodes/node_${n.id}';`)
      .join('\n');

    const nodeMapEntries = Array.from(graph.nodes.values())
      .map((n) => `  [${n.id}, { id: ${n.id}, fn: node_${n.id}, children: [${n.children.join(', ')}] }]`)
      .join(',\n');

    const content = [
      nodeImports,
      '',
      'type NodeDef = {',
      '  id: number;',
      '  fn: (input: unknown, env: Record<string, unknown>) => Promise<unknown>;',
      '  children: number[];',
      '};',
      '',
      'export class GraphEngine {',
      '  private nodes: Map<number, NodeDef>;',
      '',
      '  constructor() {',
      '    this.nodes = new Map([',
      nodeMapEntries,
      '    ]);',
      '  }',
      '',
      '  async run(startNodeId: number, initialInput: unknown, env: Record<string, unknown>): Promise<unknown> {',
      '    const queue: Array<{ nodeId: number; input: unknown }> = [{ nodeId: startNodeId, input: initialInput }];',
      '    let lastResult: unknown = initialInput;',
      '',
      '    while (queue.length > 0) {',
      '      const current = queue.shift()!;',
      '      const node = this.nodes.get(current.nodeId);',
      '      if (!node) continue;',
      '',
      '      const result = await node.fn(current.input, env);',
      '      lastResult = result;',
      '',
      '      for (const childId of node.children) {',
      '        queue.push({ nodeId: childId, input: result });',
      '      }',
      '    }',
      '',
      '    return lastResult;',
      '  }',
      '}',
    ].join('\n');

    return {
      fileName: 'src/engine/graph-engine.ts',
      content,
    };
  }

  private generateTypes(dataTypes: Array<DataType>): string {
    const types = dataTypes
      .map((dt) => {
        const name = this.sanitizeTypeName(dt.name);
        return `export type ${name} = unknown;`;
      })
      .join('\n');

    return types || `export type UnknownType = unknown;`;
  }

  generateApp(graph: GraphType, modelName: string): string {
    const startNodeId = graph.startNodeId;

    return [
      `import express, { Request, Response } from 'express';`,
      `import cors from 'cors';`,
      `import { GraphEngine } from './engine/graph-engine';`,
      ``,
      `export class App {`,
      `  private app: express.Application;`,
      `  private engine: GraphEngine;`,
      ``,
      `  constructor() {`,
      `    this.app = express();`,
      `    this.engine = new GraphEngine();`,
      `    this.initializeMiddleware();`,
      `    this.initializeRoutes();`,
      `  }`,
      ``,
      `  private initializeMiddleware(): void {`,
      `    this.app.use(cors());`,
      `    this.app.use(express.json());`,
      `  }`,
      ``,
      `  private initializeRoutes(): void {`,
      `    this.app.get('/health', (req: Request, res: Response) => {`,
      `      res.json({ status: 'ok', timestamp: new Date().toISOString() });`,
      `    });`,
      ``,
      `    this.app.get('/logs', (req: Request, res: Response) => {`,
      `      res.json({ logs: [], model: '${modelName}', graphId: process.env.GRAPH_ID });`,
      `    });`,
      ``,
      `    this.app.post('/api/run', async (req: Request, res: Response) => {`,
      `      try {`,
      `        const result = await this.engine.run(${startNodeId}, req.body, process.env as Record<string, unknown>);`,
      `        res.json({ result });`,
      `      } catch (err) {`,
      `        res.status(500).json({ error: String(err) });`,
      `      }`,
      `    });`,
      ``,
      `    this.app.get('/api/status', (req: Request, res: Response) => {`,
      `      res.json({ status: 'running', graphId: process.env.GRAPH_ID });`,
      `    });`,
      ``,
      `    this.app.use((req: Request, res: Response) => {`,
      `      res.status(404).json({ error: 'Not found' });`,
      `    });`,
      `  }`,
      ``,
      `  async start(port: number): Promise<void> {`,
      `    return new Promise((resolve) => {`,
      `      this.app.listen(port, () => resolve());`,
      `    });`,
      `  }`,
      ``,
      `  async stop(): Promise<void> {`,
      `    return new Promise((resolve) => {`,
      `      (this.app as unknown as { close: (cb: () => void) => void }).close(() => resolve());`,
      `    });`,
      `  }`,
      `}`,
    ].join('\n');
  }

  private sanitizeTypeName(name: string | undefined): string {
    if (!name) return 'unknown';
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }
}
