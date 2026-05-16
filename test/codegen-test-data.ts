import type { CompileRequestType } from '../src/modules/compiler/types';
import type { NodeWithLinesType } from '../src/modules/parser/types';

const baseDate = new Date();

export const mockModel = {
  id: 1,
  name: 'Test Model',
  tag: 'test',
  description: 'Test description',
  active: true,
  createdAt: baseDate,
  lastAt: baseDate,
  owner: { id: 1, username: 'test', pictureUrl: null, createdAt: baseDate, lastAt: baseDate },
};

export const mockGraph = {
  id: 1,
  name: 'Test Graph',
  env: '',
  compiler: null,
};

export const mockDataTypes = [
  { id: 1, name: 'string', value: 'string' },
  { id: 2, name: 'number', value: 'number' },
  { id: 3, name: 'boolean', value: 'boolean' },
];

export const mockNodeTypes = [
  { id: 1, name: 'function' },
  { id: 2, name: 'condition' },
  { id: 3, name: 'api' },
  { id: 4, name: 'llm' },
  { id: 5, name: 'timer' },
  { id: 6, name: 'interval' },
  { id: 7, name: 'circle' },
  { id: 8, name: 'memory' },
  { id: 9, name: 'call' },
];

export const mockProtocolTypes = [
  { id: 1, name: 'HTTP' },
];

export function createBaseNode(id: number, name: string, typeName: string): NodeWithLinesType {
  return {
    id,
    name,
    description: `Test ${name}`,
    size: [100, 50],
    position: [0, 0],
    createdAt: baseDate,
    updatedAt: baseDate,
    enterDataType: { id: 1, name: 'string', value: 'string' },
    exitDataType: { id: 1, name: 'string', value: 'string' },
    type: { id: 1, name: typeName },
    parentLines: [] as any,
    childLines: [] as any,
  };
}

export const functionNode: NodeWithLinesType = {
  ...createBaseNode(1, 'Function Node', 'function'),
  function: {
    id: 1,
    name: 'testFn',
    body: 'return x + 1;',
    args: 'x',
  },
};

export const conditionNode: NodeWithLinesType = {
  ...createBaseNode(2, 'Condition Node', 'condition'),
  condition: {
    id: 1,
    expression: 'input === "yes"',
  },
};

export const apiNode: NodeWithLinesType = {
  ...createBaseNode(3, 'API Node', 'api'),
  api: {
    id: 1,
    protocol: {
      id: 1,
      name: 'HTTP',
      type: { id: 1, name: 'HTTP' },
      http: {
        id: 1,
        method: 'GET',
        url: 'https://api.example.com/data',
        format: 'json',
        headers: '{"Authorization": "Bearer token"}',
        params: '',
        body: '',
        secure: true,
      },
      ws: null,
    },
  },
};

export const llmNode: NodeWithLinesType = {
  ...createBaseNode(4, 'LLM Node', 'llm'),
  llm: {
    id: 1,
    temperature: 0.7,
    prompt: 'Hello',
    context: 'default',
    size: 1024,
    protocol: {
      id: 1,
      name: 'HTTP',
      type: { id: 1, name: 'HTTP' },
      http: {
        id: 1,
        method: 'POST',
        url: 'https://llm.example.com/chat',
        format: 'json',
        headers: '{"Content-Type": "application/json"}',
        params: '',
        body: '{"message": "hello"}',
        secure: true,
      },
      ws: null,
    },
  },
};

export const timerNode: NodeWithLinesType = {
  ...createBaseNode(5, 'Timer Node', 'timer'),
  timer: {
    id: 1,
    start: baseDate,
    end: new Date(baseDate.getTime() + 1000),
  },
};

export const intervalNode: NodeWithLinesType = {
  ...createBaseNode(6, 'Interval Node', 'interval'),
  interval: {
    id: 1,
    start: baseDate,
    milliseconds: 1000,
  },
};

export const circleNode: NodeWithLinesType = {
  ...createBaseNode(7, 'Circle Node', 'circle'),
  circle: {
    id: 1,
    expression: 'step < 5',
    maxStep: 10,
  },
};

export const memoryNode: NodeWithLinesType = {
  ...createBaseNode(8, 'Memory Node', 'memory'),
  memory: {
    id: 1,
    maxSize: 100,
    maxDate: null,
  },
};

export const callNode: NodeWithLinesType = {
  ...createBaseNode(9, 'Call Node', 'call'),
  call: {
    id: 1,
    name: 'otherFunction',
    args: 'input',
  },
};

export const allNodeTypes = [
  functionNode,
  conditionNode,
  apiNode,
  llmNode,
  timerNode,
  intervalNode,
  circleNode,
  memoryNode,
  callNode,
];

export function createLinearGraph(): NodeWithLinesType[] {
  const nodes = allNodeTypes.map((n, i) => ({ ...n, id: i + 1 }));

  // Backend semantics:
  // parentLines = outgoing edges (this node is the parent)
  // childLines  = incoming edges (this node is the child)
  for (let i = 0; i < nodes.length - 1; i++) {
    nodes[i].parentLines = [
      {
        id: i + 100,
        parent: nodes[i] as unknown as any,
        child: nodes[i + 1] as unknown as any,
      },
    ] as any;
    nodes[i + 1].childLines = [
      {
        id: i + 100,
        parent: nodes[i] as unknown as any,
        child: nodes[i + 1] as unknown as any,
      },
    ] as any;
  }

  return nodes;
}

export function createBranchGraph(): NodeWithLinesType[] {
  const start = { ...functionNode, id: 1, childLines: [] as any, parentLines: [] as any };
  const branch1 = { ...apiNode, id: 2, childLines: [] as any, parentLines: [] as any };
  const branch2 = { ...llmNode, id: 3, childLines: [] as any, parentLines: [] as any };
  const end = { ...memoryNode, id: 4, childLines: [] as any, parentLines: [] as any };

  // outgoing edges live in parentLines
  start.parentLines = [
    { id: 101, parent: start as any, child: branch1 as any },
    { id: 102, parent: start as any, child: branch2 as any },
  ] as any;
  // incoming edges live in childLines
  branch1.childLines = [{ id: 101, parent: start as any, child: branch1 as any }] as any;
  branch1.parentLines = [{ id: 103, parent: branch1 as any, child: end as any }] as any;
  branch2.childLines = [{ id: 102, parent: start as any, child: branch2 as any }] as any;
  branch2.parentLines = [{ id: 104, parent: branch2 as any, child: end as any }] as any;
  end.childLines = [
    { id: 103, parent: branch1 as any, child: end as any },
    { id: 104, parent: branch2 as any, child: end as any },
  ] as any;

  return [start, branch1, branch2, end];
}

export function createCompileRequest(nodes: NodeWithLinesType[]): CompileRequestType {
  return {
    model: mockModel,
    graph: mockGraph,
    nodes: nodes as any,
    dataTypes: mockDataTypes,
    nodeTypes: mockNodeTypes,
    protocolTypes: mockProtocolTypes,
  };
}
