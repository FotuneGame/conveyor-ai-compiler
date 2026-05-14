import { Injectable } from '@nestjs/common';
import type { NodeWithLinesType } from '../parser/types';
import type { GraphType, GraphNodeType } from './types';

@Injectable()
export class GraphTraversalService {
  buildGraph(nodes: Array<NodeWithLinesType>): GraphType {
    const map = new Map<number, GraphNodeType>();

    for (const node of nodes) {
      map.set(node.id, {
        id: node.id,
        node,
        children: (node.childLines || []).map((l) => l.child.id),
        parents: (node.parentLines || []).map((l) => l.parent.id),
        depth: 0,
      });
    }

    const startNode = nodes.find((n) => !n.parentLines || n.parentLines.length === 0);
    const startNodeId = startNode?.id ?? nodes[0]?.id ?? 0;

    const queue: Array<{ id: number; depth: number }> = [{ id: startNodeId, depth: 0 }];
    const visited = new Set<number>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);

      const graphNode = map.get(current.id);
      if (graphNode) {
        graphNode.depth = current.depth;
        for (const childId of graphNode.children) {
          queue.push({ id: childId, depth: current.depth + 1 });
        }
      }
    }

    const order = this.topologicalSort(map, startNodeId);

    return { nodes: map, startNodeId, order };
  }

  private topologicalSort(graph: Map<number, GraphNodeType>, startNodeId: number): Array<number> {
    const inDegree = new Map<number, number>();

    for (const [id, node] of graph) {
      inDegree.set(id, node.parents.length);
    }

    const queue: Array<number> = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const result: Array<number> = [];

    while (queue.length > 0) {
      const id = queue.shift()!;
      result.push(id);

      const node = graph.get(id);
      if (node) {
        for (const childId of node.children) {
          const newDegree = (inDegree.get(childId) || 0) - 1;
          inDegree.set(childId, newDegree);
          if (newDegree === 0) {
            queue.push(childId);
          }
        }
      }
    }

    return result;
  }
}
