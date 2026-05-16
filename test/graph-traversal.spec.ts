import { GraphTraversalService } from '../src/modules/graph-traversal/graph-traversal.service';
import { ParserService } from '../src/modules/parser/parser.service';
import {
  createLinearGraph,
  createBranchGraph,
  createCompileRequest,
} from './codegen-test-data';

describe('GraphTraversalService', () => {
  let traversal: GraphTraversalService;
  let parser: ParserService;

  beforeEach(() => {
    traversal = new GraphTraversalService();
    parser = new ParserService();
  });

  it('should build linear graph order', () => {
    const nodes = createLinearGraph();
    const request = createCompileRequest(nodes);
    const parseResult = parser.parse(request);
    const graph = traversal.buildGraph(parseResult.nodes);

    expect(graph.startNodeId).toBe(1);
    expect(graph.order).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('should build branch graph order', () => {
    const nodes = createBranchGraph();
    const request = createCompileRequest(nodes);
    const parseResult = parser.parse(request);
    const graph = traversal.buildGraph(parseResult.nodes);

    expect(graph.startNodeId).toBe(1);
    expect(graph.order[0]).toBe(1);
    expect(graph.order[graph.order.length - 1]).toBe(4);
  });
});
