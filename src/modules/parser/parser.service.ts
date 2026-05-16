import { Injectable } from '@nestjs/common';
import type { CompileRequestType } from '../compiler/types';
import type { NodeWithLinesType, ParseErrorType, ParseResultType } from './types';

const NODE_TYPE_MAP: Record<string, string> = {
  function: 'function',
  condition: 'condition',
  api: 'api',
  llm: 'llm',
  timer: 'timer',
  interval: 'interval',
  circle: 'circle',
  memory: 'memory',
  call: 'call',
};

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
      const typeError = this.validateNodeType(node);
      if (typeError) {
        errors.push(typeError);
      }

      // Backend semantics:
      // parentLines = outgoing edges (this node is the parent)
      // childLines  = incoming edges (this node is the child)
      const outgoing = node.parentLines || [];
      const incoming = node.childLines || [];

      for (const line of outgoing) {
        if (!ids.has(line.child.id)) {
          errors.push({ message: `Invalid child reference in line ${line.id}`, nodeId: node.id });
        }
      }

      for (const line of incoming) {
        if (!ids.has(line.parent.id)) {
          errors.push({ message: `Invalid parent reference in line ${line.id}`, nodeId: node.id });
        }
      }
    }

    // Start node has no incoming edges (no childLines)
    const startNodes = nodes.filter((n) => !n.childLines || n.childLines.length === 0);
    if (startNodes.length === 0) {
      errors.push({ message: 'No start node found (node without incoming edges)' });
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

  private validateNodeType(node: NodeWithLinesType): ParseErrorType | null {
    const typeName = node.type?.name?.toLowerCase().trim();
    if (!typeName) {
      return { message: 'Node type name is empty', nodeId: node.id };
    }

    const requiredField = NODE_TYPE_MAP[typeName];
    if (!requiredField) {
      return null;
    }

    const fieldValue = (node as object)[requiredField];
    if (!fieldValue) {
      return {
        message: `Node type "${typeName}" requires "${requiredField}" data`,
        nodeId: node.id,
        field: requiredField,
      };
    }

    return null;
  }

  private detectCycle(nodes: Array<NodeWithLinesType>): Array<number> | null {
    const adj = new Map<number, Array<number>>();
    // outgoing edges are in parentLines (this node is parent)
    for (const node of nodes) {
      adj.set(node.id, (node.parentLines || []).map((l) => l.child.id));
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
        // follow outgoing edges (parentLines)
        for (const line of node.parentLines || []) {
          stack.push(line.child.id);
        }
      }
    }

    return reachable;
  }
}
