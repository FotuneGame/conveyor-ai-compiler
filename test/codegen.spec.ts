import { CodegenService } from '../src/modules/codegen/codegen.service';
import { GraphTraversalService } from '../src/modules/graph-traversal/graph-traversal.service';
import { ParserService } from '../src/modules/parser/parser.service';
import {
  createLinearGraph,
  createBranchGraph,
  createCompileRequest,
  createBaseNode,
} from './codegen-test-data';

describe('CodegenService', () => {
  let codegen: CodegenService;
  let traversal: GraphTraversalService;
  let parser: ParserService;

  beforeEach(() => {
    codegen = new CodegenService();
    traversal = new GraphTraversalService();
    parser = new ParserService();
  });

  it('should generate node files for all types', () => {
    const nodes = createLinearGraph();
    const request = createCompileRequest(nodes);
    const parseResult = parser.parse(request);
    expect(parseResult.success).toBe(true);

    const graph = traversal.buildGraph(parseResult.nodes);
    const result = codegen.generate(request, graph);

    expect(result.nodes).toHaveLength(9);
    expect(result.nodes.every((n) => n.content.includes('export const'))).toBe(true);
    expect(result.nodes.every((n) => n.content.includes('import type'))).toBe(true);
  });

  it('should generate engine with all nodes', () => {
    const nodes = createLinearGraph();
    const request = createCompileRequest(nodes);
    const parseResult = parser.parse(request);
    const graph = traversal.buildGraph(parseResult.nodes);
    const result = codegen.generate(request, graph);

    expect(result.engine.content).toContain('GraphEngine');
    expect(result.engine.content).toContain('node_1');
    expect(result.engine.content).toContain('node_9');
    expect(result.engine.content).toContain('run(');
  });

  it('should generate app with required endpoints', () => {
    const nodes = createLinearGraph();
    const request = createCompileRequest(nodes);
    const parseResult = parser.parse(request);
    const graph = traversal.buildGraph(parseResult.nodes);
    const result = codegen.generate(request, graph);

    expect(result.app).toContain("/health");
    expect(result.app).toContain("/logs");
    expect(result.app).toContain("/api/run");
    expect(result.app).toContain("/api/status");
    expect(result.app).toContain("/api/nodes");
  });

  it('should generate types file', () => {
    const nodes = createLinearGraph();
    const request = createCompileRequest(nodes);
    const parseResult = parser.parse(request);
    const graph = traversal.buildGraph(parseResult.nodes);
    const result = codegen.generate(request, graph);

    expect(result.types).toContain('export type');
  });

  it('should handle branch graph', () => {
    const nodes = createBranchGraph();
    const request = createCompileRequest(nodes);
    const parseResult = parser.parse(request);
    expect(parseResult.success).toBe(true);

    const graph = traversal.buildGraph(parseResult.nodes);
    const result = codegen.generate(request, graph);

    expect(result.nodes).toHaveLength(4);
    expect(result.engine.content).toContain('node_1');
    expect(result.engine.content).toContain('node_2');
    expect(result.engine.content).toContain('node_3');
    expect(result.engine.content).toContain('node_4');
  });

  it('should generate function node with code body', () => {
    const nodes = createLinearGraph();
    const request = createCompileRequest(nodes);
    const parseResult = parser.parse(request);
    const graph = traversal.buildGraph(parseResult.nodes);
    const result = codegen.generate(request, graph);

    const functionNode = result.nodes.find((n) => n.id === 1);
    expect(functionNode?.content).toContain('export const node_1');
    expect(functionNode?.content).toContain('(input:');
  });

  it('should generate condition node with expression code', () => {
    const nodes = createLinearGraph();
    const request = createCompileRequest(nodes);
    const parseResult = parser.parse(request);
    const graph = traversal.buildGraph(parseResult.nodes);
    const result = codegen.generate(request, graph);

    const conditionNode = result.nodes.find((n) => n.id === 2);
    expect(conditionNode?.content).toContain('export const node_2');
    expect(conditionNode?.content).toContain('input === "yes"');
  });

  it('should generate engine with condition branch stop logic', () => {
    const nodes = createLinearGraph();
    const request = createCompileRequest(nodes);
    const parseResult = parser.parse(request);
    const graph = traversal.buildGraph(parseResult.nodes);
    const result = codegen.generate(request, graph);

    expect(result.engine.content).toContain('node.kind === "condition"');
    expect(result.engine.content).toContain('if (node.kind === "condition" && !result)');
    expect(result.engine.content).toContain('continue;');
  });

  it('should generate HTTP node with response.ok check', () => {
    const nodes = createLinearGraph();
    const request = createCompileRequest(nodes);
    const parseResult = parser.parse(request);
    const graph = traversal.buildGraph(parseResult.nodes);
    const result = codegen.generate(request, graph);

    const apiNodeFile = result.nodes.find((n) => n.id === 3);
    expect(apiNodeFile?.content).toContain('if (!response.ok)');
    expect(apiNodeFile?.content).toContain('throw new Error');
  });

  it('should generate memory node with fs imports at module level', () => {
    const nodes = createLinearGraph();
    const request = createCompileRequest(nodes);
    const parseResult = parser.parse(request);
    const graph = traversal.buildGraph(parseResult.nodes);
    const result = codegen.generate(request, graph);

    const memNodeFile = result.nodes.find((n) => n.id === 8);
    expect(memNodeFile?.content).toContain("import { readFileSync, writeFileSync, existsSync } from 'fs'");
    expect(memNodeFile?.content).toContain("import { join } from 'path'");
    expect(memNodeFile?.content).toContain('memory-node-8.json');
  });

  it('should mark WS node as self-managed in engine', () => {
    const wsNode = {
      ...createBaseNode(10, 'WS Node', 'api'),
      api: {
        id: 1,
        protocol: {
          id: 2,
          name: 'WS',
          type: { id: 2, name: 'WS' },
          http: null,
          ws: {
            id: 1,
            url: 'ws://localhost:5000',
            query: '{}',
            auth: '{}',
            event: 'message',
            secure: false,
          },
        },
      },
    };
    const nodes = [wsNode];
    const request = createCompileRequest(nodes);
    const parseResult = parser.parse(request);
    const graph = traversal.buildGraph(parseResult.nodes);
    const result = codegen.generate(request, graph);

    // Engine should have empty children array for self-managed WS node
    expect(result.engine.content).toContain('[10, { id: 10, kind: \'api\', fn: node_10 as unknown as (input: unknown, env: Record<string, unknown>) => Promise<unknown>, children: [] }]');
    // Node file should contain runChildren helper and socket.io-client dynamic import
    const wsFile = result.nodes.find((n) => n.id === 10);
    expect(wsFile?.content).toContain("await import('socket.io-client')");
    expect(wsFile?.content).toContain('runChildren');
  });
});
