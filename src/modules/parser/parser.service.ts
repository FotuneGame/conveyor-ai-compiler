import { Injectable } from '@nestjs/common';
import type { CompileRequestType } from '../compiler/types';
import type { NodeWithLinesType, ParseErrorType, ParseResultType } from './types';

@Injectable()
export class ParserService {
  parse(data: CompileRequestType): ParseResultType {
    const nodes = data.nodes as Array<NodeWithLinesType>;
    const errors: Array<ParseErrorType> = [];

    if (!nodes || nodes.length === 0) {
      errors.push({ message: 'No nodes provided' });
      return { success: false, errors, nodes: [] };
    }

    const ids = new Set<number>();
    for (const node of nodes) {
      if (ids.has(node.id)) {
        errors.push({ message: `Duplicate node id: ${node.id}`, nodeId: node.id });
      }
      ids.add(node.id);
    }

    for (const node of nodes) {
      const childLines = node.childLines || [];
      const parentLines = node.parentLines || [];

      for (const line of childLines) {
        if (!ids.has(line.child.id)) {
          errors.push({ message: `Invalid child reference in line ${line.id}`, nodeId: node.id });
        }
      }

      for (const line of parentLines) {
        if (!ids.has(line.parent.id)) {
          errors.push({ message: `Invalid parent reference in line ${line.id}`, nodeId: node.id });
        }
      }
    }

    const startNodes = nodes.filter((n) => !n.parentLines || n.parentLines.length === 0);
    if (startNodes.length === 0) {
      errors.push({ message: 'No start node found (node without parents)' });
    }
    if (startNodes.length > 1) {
      errors.push({ message: `Multiple start nodes found: ${startNodes.map((n) => n.id).join(', ')}` });
    }

    const cycle = this.detectCycle(nodes);
    if (cycle) {
      errors.push({ message: `Cycle detected in graph: ${cycle.join(' -> ')}` });
    }

    if (startNodes.length === 1 && !cycle) {
      const reachable = this.findReachable(nodes, startNodes[0].id);
      const unreachable = nodes.filter((n) => !reachable.has(n.id));
      for (const node of unreachable) {
        errors.push({ message: `Unreachable node: ${node.id}`, nodeId: node.id });
      }
    }

    return {
      success: errors.length === 0,
      errors,
      nodes,
      startNode: startNodes[0],
    };
  }

  private detectCycle(nodes: Array<NodeWithLinesType>): Array<number> | null {
    const adj = new Map<number, Array<number>>();
    for (const node of nodes) {
      adj.set(node.id, (node.childLines || []).map((l) => l.child.id));
    }

    const visited = new Set<number>();

    for (const node of nodes) {
      if (visited.has(node.id)) continue;

      const stack: Array<{ id: number; iter: number; path: Array<number> }> = [
        { id: node.id, iter: 0, path: [node.id] },
      ];
      const recStack = new Set<number>();

      while (stack.length > 0) {
        const top = stack[stack.length - 1];

        if (top.iter === 0) {
          visited.add(top.id);
          recStack.add(top.id);
        }

        const children = adj.get(top.id) || [];

        if (top.iter < children.length) {
          const childId = children[top.iter++];

          if (!visited.has(childId)) {
            stack.push({ id: childId, iter: 0, path: [...top.path, childId] });
          } else if (recStack.has(childId)) {
            const idx = top.path.indexOf(childId);
            return top.path.slice(idx).concat(childId);
          }
        } else {
          recStack.delete(top.id);
          stack.pop();
        }
      }
    }

    return null;
  }

  private findReachable(nodes: Array<NodeWithLinesType>, startId: number): Set<number> {
    const reachable = new Set<number>();
    const stack = [startId];

    while (stack.length > 0) {
      const id = stack.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);

      const node = nodes.find((n) => n.id === id);
      if (node) {
        for (const line of node.childLines || []) {
          stack.push(line.child.id);
        }
      }
    }

    return reachable;
  }
}
