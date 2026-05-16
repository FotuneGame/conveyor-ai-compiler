import { ParserService } from '../src/modules/parser/parser.service';
import {
  functionNode,
  conditionNode,
  apiNode,
  llmNode,
  timerNode,
  intervalNode,
  circleNode,
  memoryNode,
  callNode,
  createLinearGraph,
  createBranchGraph,
  createCompileRequest,
} from './codegen-test-data';
describe('ParserService', () => {
  let parser: ParserService;

  beforeEach(() => {
    parser = new ParserService();
  });

  it('should parse valid linear graph', () => {
    const nodes = createLinearGraph();
    const result = parser.parse(createCompileRequest(nodes));

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.startNode?.id).toBe(1);
  });

  it('should parse valid branch graph', () => {
    const nodes = createBranchGraph();
    const result = parser.parse(createCompileRequest(nodes));

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.startNode?.id).toBe(1);
  });

  it('should fail when function node has no function data', () => {
    const badNode = { ...functionNode, function: undefined };
    const result = parser.parse(createCompileRequest([badNode]));

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('function') && e.nodeId === badNode.id)).toBe(true);
  });

  it('should fail when api node has no api data', () => {
    const badNode = { ...apiNode, api: undefined };
    const result = parser.parse(createCompileRequest([badNode]));

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('api') && e.nodeId === badNode.id)).toBe(true);
  });

  it('should fail when llm node has no llm data', () => {
    const badNode = { ...llmNode, llm: undefined };
    const result = parser.parse(createCompileRequest([badNode]));

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('llm') && e.nodeId === badNode.id)).toBe(true);
  });

  it('should fail when condition node has no condition data', () => {
    const badNode = { ...conditionNode, condition: undefined };
    const result = parser.parse(createCompileRequest([badNode]));

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('condition') && e.nodeId === badNode.id)).toBe(true);
  });

  it('should fail when circle node has no circle data', () => {
    const badNode = { ...circleNode, circle: undefined };
    const result = parser.parse(createCompileRequest([badNode]));

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('circle') && e.nodeId === badNode.id)).toBe(true);
  });

  it('should fail when timer node has no timer data', () => {
    const badNode = { ...timerNode, timer: undefined };
    const result = parser.parse(createCompileRequest([badNode]));

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('timer') && e.nodeId === badNode.id)).toBe(true);
  });

  it('should fail when interval node has no interval data', () => {
    const badNode = { ...intervalNode, interval: undefined };
    const result = parser.parse(createCompileRequest([badNode]));

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('interval') && e.nodeId === badNode.id)).toBe(true);
  });

  it('should fail when memory node has no memory data', () => {
    const badNode = { ...memoryNode, memory: undefined };
    const result = parser.parse(createCompileRequest([badNode]));

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('memory') && e.nodeId === badNode.id)).toBe(true);
  });

  it('should fail when call node has no call data', () => {
    const badNode = { ...callNode, call: undefined };
    const result = parser.parse(createCompileRequest([badNode]));

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('call') && e.nodeId === badNode.id)).toBe(true);
  });

  it('should fail on duplicate node ids', () => {
    const nodes = createLinearGraph();
    nodes[1].id = nodes[0].id;
    const result = parser.parse(createCompileRequest(nodes));

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
  });

  it('should fail on cycle', () => {
    const nodes = createLinearGraph();
    const last = nodes[nodes.length - 1];
    // Backend semantics: parentLines = outgoing edges
    last.parentLines = [
      ...(last.parentLines || []),
      {
        id: 999,
        parent: last as any,
        child: nodes[0] as any,
      },
    ];
    nodes[0].childLines = [
      ...(nodes[0].childLines || []),
      {
        id: 999,
        parent: last as any,
        child: nodes[0] as any,
      },
    ];

    const result = parser.parse(createCompileRequest(nodes));
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Cycle'))).toBe(true);
  });

  it('should fail on unreachable node', () => {
    const nodes = createLinearGraph();
    const isolated = {
      ...memoryNode,
      id: 999,
      type: { id: 99, name: 'unknown' },
      // no outgoing edges
      parentLines: [],
      // incoming edge from nodes[0] (does not make it reachable because traversal follows outgoing edges)
      childLines: [{ id: 998, parent: nodes[0] as any, child: { id: 999 } as any }],
    };
    const result = parser.parse(createCompileRequest([...nodes, isolated]));

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Unreachable') && e.nodeId === 999)).toBe(true);
  });


});
