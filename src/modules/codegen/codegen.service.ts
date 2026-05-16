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
  HTTPType,
  WSType,
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
    const app = this.generateApp(graph, context.model.name, nodes);

    return { nodes: nodeFiles, engine, types, app };
  }

  private isSelfManaged(node: NodeWithLinesType): boolean {
    if (node.circle) return true;
    if (node.timer) return true;
    if (node.interval) return true;
    if (node.api?.protocol?.ws) return true;
    return false;
  }

  private getChildIds(node: NodeWithLinesType): number[] {
    // parentLines = outgoing edges (this node is parent)
    return node.parentLines?.map((l) => l.child.id) ?? [];
  }

  private generateChildImports(node: NodeWithLinesType): string {
    const childIds = this.getChildIds(node);
    if (childIds.length === 0) return '';
    return childIds.map((id) => `import { node_${id} } from './node_${id}';`).join('\n');
  }

  private generateRunChildrenHelper(node: NodeWithLinesType, exitType: string): string {
    const childIds = this.getChildIds(node);
    if (childIds.length === 0) {
      return `const runChildren = async (data: ${exitType}): Promise<unknown> => data;`;
    }
    return [
      `const runChildren = async (data: ${exitType}): Promise<unknown> => {`,
      `  let result: any = data;`,
      ...childIds.map((id) => `  result = await node_${id}(result, env);`),
      `  return result;`,
      `};`,
    ].join('\n');
  }

  private generateNode(node: NodeWithLinesType): GeneratedNodeType {
    const enterType = this.sanitizeTypeName(node.enterDataType?.name || 'unknown');
    const exitType = this.sanitizeTypeName(node.exitDataType?.name || 'unknown');
    const isSelfManaged = this.isSelfManaged(node);
    const childImports = isSelfManaged ? this.generateChildImports(node) : '';
    const runChildren = isSelfManaged ? this.generateRunChildrenHelper(node, exitType) : '';

    const body = this.generateNodeBody(node, enterType, exitType, isSelfManaged);

    const typeImports = enterType === exitType ? enterType : `${enterType}, ${exitType}`;
    const memoryImports = node.memory
      ? `import { readFileSync, writeFileSync, existsSync } from 'fs';\nimport { join } from 'path';\n`
      : '';

    const content = [
      memoryImports,
      `import type { ${typeImports} } from '../types/generated';`,
      childImports,
      ``,
      `export const node_${node.id} = async (input: ${enterType}, env: Record<string, unknown>): Promise<${exitType}> => {`,
      runChildren ? `  ${runChildren}\n` : '',
      `  ${body}`,
      `};`,
    ].join('\n');

    return {
      id: node.id,
      name: node.name,
      fileName: `src/nodes/node_${node.id}.ts`,
      content,
    };
  }

  private generateNodeBody(node: NodeWithLinesType, enterType: string, exitType: string, isSelfManaged: boolean): string {
    if (node.function) {
      return this.generateFunctionNode(node.function, exitType);
    }
    if (node.api) {
      return this.generateApiNode(node.api, exitType, isSelfManaged);
    }
    if (node.llm) {
      return this.generateLlmNode(node.llm, exitType);
    }
    if (node.condition) {
      return this.generateConditionNode(node.condition);
    }
    if (node.circle) {
      return this.generateCircleNode(node.circle, exitType);
    }
    if (node.timer) {
      return this.generateTimerNode(node.timer, exitType);
    }
    if (node.interval) {
      return this.generateIntervalNode(node.interval, exitType);
    }
    if (node.memory) {
      return this.generateMemoryNode(node.memory, exitType, node.id);
    }
    if (node.call) {
      return this.generateCallNode(node.call, exitType);
    }
    return `return input as ${exitType};`;
  }

  private ensureReturn(code: string): string {
    const trimmed = code.trim();
    // Check only the start of the entire code, not each line
    if (/^\s*return\s+/.test(trimmed)) {
      return trimmed;
    }
    // Multi-statement code (declarations or semicolons) needs IIFE wrapper
    if (/^\s*(const|let|var)\s+/.test(trimmed) || /;\s*\S/.test(trimmed)) {
      // Use async IIFE if code contains await
      if (/\bawait\b/.test(trimmed)) {
        return `return (async () => { ${trimmed} })();`;
      }
      return `return (() => { ${trimmed} })();`;
    }
    return `return ${trimmed};`;
  }

  private generateFunctionNode(fn: FunctionType, exitType: string): string {
    return this.ensureReturn(fn.body || `return input as ${exitType};`);
  }

  private generateApiNode(api: APIType, exitType: string, isSelfManaged: boolean): string {
    const protocol = api.protocol;
    if (protocol.http) {
      return this.generateHttpNode(protocol.http, exitType);
    }
    if (protocol.ws) {
      return this.generateWsNode(protocol.ws, exitType, isSelfManaged);
    }
    return `return input as ${exitType};`;
  }

  private generateHttpNode(http: HTTPType, exitType: string): string {
    let url = http.url;
    if (http.secure && url.startsWith('http://')) {
      url = url.replace('http://', 'https://');
    }
    const headersCode = http.headers || "{ 'Content-Type': 'application/json' }";
    const bodyCode = http.body || 'undefined';
    const paramsCode = http.params || '{}';

    return [
      `const url = new URL(${url});`,
      `const params = ${paramsCode};`,
      `Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, String(v)));`,
      `const response = await fetch(url.toString(), {`,
      `  method: '${http.method}',`,
      `  headers: ${headersCode},`,
      `  body: ${bodyCode},`,
      `});`,
      `if (!response.ok) {`,
      `  throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);`,
      `}`,
      `return await response.json() as ${exitType};`,
    ].join('\n  ');
  }

  private generateWsNode(ws: WSType, exitType: string, isSelfManaged: boolean): string {
    let url = ws.url;
    if (ws.secure && url.startsWith('ws://')) {
      url = url.replace('ws://', 'wss://');
    }
    if (!isSelfManaged) {
      return `return input as ${exitType};`;
    }
    return [
      `const { io } = await import('socket.io-client');`,
      `const query = ${ws.query || '{}'};`,
      `const auth = ${ws.auth || '{}'};`,
      `const client = io(${url}, { query, auth, transports: ['websocket', 'polling'] });`,
      `const result = await new Promise((resolve, reject) => {`,
      `  client.once('${ws.event || 'message'}', async (data: ${exitType}) => {`,
      `    try {`,
      `      const childResult = await runChildren(data);`,
      `      resolve(childResult);`,
      `    } catch (e) { reject(e); }`,
      `  });`,
      `  client.once('connect_error', reject);`,
      `  setTimeout(() => reject(new Error('WS timeout')), 30000);`,
      `});`,
      `client.disconnect();`,
      `return result as ${exitType};`,
    ].join('\n  ');
  }

  private generateLlmNode(llm: LLMType, exitType: string): string {
    const http = llm.protocol.http;
    let url = http?.url || '';
    if (http?.secure && url.startsWith('http://')) {
      url = url.replace('http://', 'https://');
    }
    const method = http?.method || 'POST';
    const headers = http?.headers || "{ 'Content-Type': 'application/json' }";
    const body = http?.body || `JSON.stringify({ prompt: ${JSON.stringify(llm.prompt)}, temperature: ${llm.temperature}, context: ${JSON.stringify(llm.context)}, max_tokens: ${llm.size} })`;

    return [
      `const response = await fetch(${url}, {`,
      `  method: '${method}',`,
      `  headers: ${headers},`,
      `  body: ${body},`,
      `});`,
      `if (!response.ok) {`,
      `  throw new Error(\`LLM request failed: \${response.status}\`);`,
      `}`,
      `return await response.json() as ${exitType};`,
    ].join('\n  ');
  }

  private generateConditionNode(condition: ConditionType): string {
    return this.ensureReturn(condition.expression || 'return true;');
  }

  private generateCircleNode(circle: CircleType, exitType: string): string {
    return [
      `let step = 0;`,
      `let lastResult = input as ${exitType};`,
      `while (step < ${circle.maxStep ?? 1000}) {`,
      `  const shouldContinue = await (async () => { ${circle.expression || 'return false;'} })();`,
      `  if (!shouldContinue) break;`,
      `  lastResult = await runChildren(lastResult);`,
      `  step++;`,
      `}`,
      `return lastResult;`,
    ].join('\n  ');
  }

  private generateTimerNode(timer: TimerType, exitType: string): string {
    return [
      `const startTime = new Date('${timer.start.toISOString()}').getTime();`,
      `const endTime = new Date('${timer.end.toISOString()}').getTime();`,
      `const now = Date.now();`,
      `if (now < startTime) {`,
      `  await new Promise(r => setTimeout(r, startTime - now));`,
      `}`,
      `if (now < endTime) {`,
      `  await new Promise(r => setTimeout(r, endTime - now));`,
      `}`,
      `return await runChildren(input as ${exitType});`,
    ].join('\n  ');
  }

  private generateIntervalNode(interval: IntervalType, exitType: string): string {
    return [
      `const startTime = new Date('${interval.start.toISOString()}').getTime();`,
      `const now = Date.now();`,
      `if (now < startTime) {`,
      `  await new Promise(r => setTimeout(r, startTime - now));`,
      `}`,
      `await new Promise(r => setTimeout(r, ${interval.milliseconds}));`,
      `return await runChildren(input as ${exitType});`,
    ].join('\n  ');
  }

  private generateMemoryNode(memory: MemoryType, exitType: string, nodeId: number): string {
    const maxSize = memory.maxSize ?? 0;
    return [
      `const filePath = join(process.cwd(), 'memory-node-${nodeId}.json');`,
      `let arr: unknown[] = [];`,
      `if (existsSync(filePath)) {`,
      `  arr = JSON.parse(readFileSync(filePath, 'utf-8'));`,
      `}`,
      `arr.push(input);`,
      `if (${maxSize > 0 ? 'true' : 'false'} && arr.length > ${maxSize}) {`,
      `  arr.shift();`,
      `}`,
      `writeFileSync(filePath, JSON.stringify(arr, null, 2));`,
      `return arr as ${exitType};`,
    ].join('\n  ');
  }

  private generateCallNode(call: CallType, exitType: string): string {
    return [
      `const fn = (env.__functions as Map<string, Function>)?.get('${call.name}');`,
      `if (typeof fn === 'function') {`,
      `  return await fn(input, env);`,
      `}`,
      `return input as ${exitType};`,
    ].join('\n  ');
  }

  private generateEngine(graph: GraphType): GeneratedEngineType {
    const nodeImports = Array.from(graph.nodes.values())
      .map((n) => `import { node_${n.id} } from '../nodes/node_${n.id}';`)
      .join('\n');

    const nodeMapEntries = Array.from(graph.nodes.values())
      .map((n) => {
        const isSelf = this.isSelfManaged(n.node);
        const kind = this.sanitizeIdentifier(n.node.type?.name ?? 'default');
        return `  [${n.id}, { id: ${n.id}, kind: '${kind}', fn: node_${n.id} as unknown as (input: unknown, env: Record<string, unknown>) => Promise<unknown>, children: [${isSelf ? '' : n.children.join(', ')}] }]`;
      })
      .join(',\n');

    const content = [
      nodeImports,
      '',
      'type NodeDef = {',
      '  id: number;',
      "  kind: 'function' | 'api' | 'llm' | 'condition' | 'memory' | 'call' | 'circle' | 'timer' | 'interval' | string;",
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
      '  getNodes(): Map<number, NodeDef> {',
      '    return this.nodes;',
      '  }',
      '',
      '  async run(startNodeId: number, initialInput: unknown, env: Record<string, unknown>): Promise<Record<number, unknown>> {',
      '    const queue: Array<{ nodeId: number; input: unknown }> = [{ nodeId: startNodeId, input: initialInput }];',
      '    const outputs = new Map<number, unknown>();',
      '',
      '    while (queue.length > 0) {',
      '      const current = queue.shift()!;',
      '      const node = this.nodes.get(current.nodeId);',
      '      if (!node) continue;',
      '',
      '      const result = await node.fn(current.input, env);',
      '      outputs.set(current.nodeId, result);',
      '',
      '      // Condition node stops the branch if result is falsy',
      '      if (node.kind === "condition" && !result) {',
      '        continue;',
      '      }',
      '',
      '      for (const childId of node.children) {',
      '        queue.push({ nodeId: childId, input: result });',
      '      }',
      '    }',
      '',
      '    return Object.fromEntries(outputs);',
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
        const value = dt.value || 'unknown';
        return `export type ${name} = ${value};`;
      })
      .join('\n');

    return types || `export type UnknownType = unknown;`;
  }

  generateApp(graph: GraphType, modelName: string, nodes: Array<NodeWithLinesType>): string {
    const startNodeId = graph.startNodeId;

    const functionMapEntries = nodes
      .filter((n) => n.function && n.function.name)
      .map((n) => `  ['${n.function!.name}', node_${n.id} as unknown as Function]`)
      .join(',\n');

    return [
      `import express, { Request, Response } from 'express';`,
      `import cors from 'cors';`,
      `import { GraphEngine } from './engine/graph-engine';`,
      nodes.filter((n) => n.function && n.function.name).map((n) => `import { node_${n.id} } from './nodes/node_${n.id}';`).join('\n'),
      ``,
      `export class App {`,
      `  private app: express.Application;`,
      `  private engine: GraphEngine;`,
      `  private functionMap: Map<string, Function>;`,
      ``,
      `  constructor() {`,
      `    this.app = express();`,
      `    this.engine = new GraphEngine();`,
      `    this.functionMap = new Map([`,
      functionMapEntries,
      `    ]);`,
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
      `      res.json({ logs: [], model: ${JSON.stringify(modelName)}, graphId: process.env.GRAPH_ID });`,
      `    });`,
      ``,
      `    this.app.get('/api/nodes', (req: Request, res: Response) => {`,
      `      const nodeList = Array.from(this.engine.getNodes().values()).map((n) => ({`,
      `        id: n.id,`,
      `        kind: n.kind,`,
      `        children: n.children,`,
      `      }));`,
      `      res.json({ nodes: nodeList, graphId: process.env.GRAPH_ID });`,
      `    });`,
      ``,
      `    this.app.post('/api/run', async (req: Request, res: Response) => {`,
      `      try {`,
      `        const env = { ...process.env, __functions: this.functionMap, __memory: new Map() };`,
      `        const results = await this.engine.run(${startNodeId}, req.body, env);`,
      `        res.json({ results, startNodeId: ${startNodeId} });`,
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
    const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
    const reserved = ['void', 'any', 'never', 'unknown', 'string', 'number', 'boolean', 'symbol', 'bigint', 'object', 'null', 'undefined', 'true', 'false'];
    return reserved.includes(sanitized) ? `T_${sanitized}` : sanitized;
  }

  private sanitizeIdentifier(name: string | undefined): string {
    if (!name) return 'default';
    return name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
  }
}
