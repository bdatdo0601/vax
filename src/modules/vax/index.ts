import { map, some, union, clone, filter, every, isEqual } from "lodash";

type Edge = [string, string, string, string];

type EdgeObject = {
  in: string;
  outputNodeId: string;
  out: string;
};

type NodeEdgesObject = {
  [inputNodeId: string]: EdgeObject[];
};

type NodesObject = {
  [inputNodeId: string]: Node;
};

type INode = {
  id: string;
  edges: NodesObject;
  x?: number;
  y?: number;
  out?: string;
};

class Node {
  id: string;
  edges: NodesObject;
  x?: number;
  y?: number;
  out?: string;

  constructor({ id, edges, x, y, out }: INode) {
    this.id = id;
    this.edges = edges;
    this.x = x;
    this.y = y;
    this.out = out;
  }
}

type Comment = {
  comment: string[];
};

type RawGraph = {
  nodes: Node[];
  edges: Edge[];
  comments: Comment[];
};

type Graph = {
  nodes: Node[];
  edges: Edge[];
  comments: Comment[];
};

type Schema = {};

type vaxOptions = {
  schema: Schema;
};

class VAX {
  private rawOptions: vaxOptions;
  private graph!: Graph;
  private nodesObject!: NodesObject;
  private nodeEdgesObject!: NodeEdgesObject;

  constructor(options: vaxOptions) {
    this.rawOptions = options;
    this.loadGraph({ nodes: [], edges: [], comments: [] });
  }

  /**
   * Select a set of nodeo
   * @param filterNodesIds provided ID
   */
  getNodesByIds(filterNodesIds: string[]): Node[] {
    return map(filterNodesIds, (nodeId) => this.nodesObject[nodeId]);
  }

  /**
   * Load a raw graph in the instnace
   * @param graph raw graph provided by user
   */
  loadGraph(graph: RawGraph): Graph {
    if (isEqual(this.graph, graph)) {
      return this.graph;
    }
    this.graph = graph as Graph;
    this.nodesObject = (this.graph.nodes || []).reduce<NodesObject>(
      (acc, currentNode) => ({ ...acc, [currentNode.id]: currentNode }),
      {}
    );
    this.nodeEdgesObject = (this.graph.edges || []).reduce<NodeEdgesObject>(
      (acc, [inputNodeId, inputName, outputNodeId, outputName]) => ({
        ...acc,
        [inputNodeId]: [
          ...(acc[inputNodeId] || []),
          { in: inputName, outputNodeId, out: outputName },
        ],
      }),
      {}
    );
    return this.graph;
  }

  saveGraph(filterNodeIds?: string[]): RawGraph {
    const nodesToPickle = filterNodeIds
      ? this.getNodesByIds(filterNodeIds)
      : this.graph.nodes;

    return { nodes: [], edges: [], comments: [] };
  }

  findRootNodes(graph: Graph): Node[] {
    this.loadGraph(graph);
    return filter(this.graph.nodes, (node) =>
      every(this.graph.edges, ([inputNodeId]) => inputNodeId !== node.id)
    );
  }

  inlineUserFunctionsInGraph(graph: Graph): Graph {
    return { nodes: [], edges: [], comments: [] };
  }

  private composeTree(node: Node, rawParentsIds: string[], out?: string): Node {
    const parentsIds = rawParentsIds;
    if (some(parentsIds, (pid) => pid === node.id)) {
      throw new Error(
        `Node ${node.id} is already present in graph parents: ${parentsIds.join(
          ", "
        )}`
      );
    }

    // set new parent Ids
    const newParentsIds = union(parentsIds, [node.id]);

    // collect links
    const rawNodeEdges: EdgeObject[] = this.nodeEdgesObject[node.id] || [];
    const nodeEdges = rawNodeEdges.reduce<NodesObject>(
      (acc, edgeData) => ({
        ...acc,
        [edgeData.in]: this.composeTree(
          this.nodesObject[edgeData.outputNodeId],
          newParentsIds,
          edgeData.out
        ),
      }),
      {}
    );

    const newNode = clone(node);

    newNode.edges = nodeEdges;
    newNode.out = out;

    return newNode;
  }

  composeTreeFromGraph(graph: Graph, rootNodeId: string): Node {
    this.loadGraph(graph);
    return this.composeTree(this.nodesObject[rootNodeId], []);
  }

  composeTrees(): Node[] {
    return map(this.findRootNodes(this.graph), (rootNode) =>
      this.composeTreeFromGraph(this.graph, rootNode.id)
    );
  }

  composeTreesInlined(): Node[] {
    const inlinedGraph = this.inlineUserFunctionsInGraph(this.saveGraph());
    return map(this.findRootNodes(inlinedGraph), (rootNode) =>
      this.composeTreeFromGraph(inlinedGraph, rootNode.id)
    );
  }
}

export default VAX;
