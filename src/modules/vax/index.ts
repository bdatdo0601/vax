import {
  map,
  some,
  union,
  clone,
  filter,
  every,
  isEqual,
  includes,
} from "lodash";

interface INode {
  id: string;
  edges: NodesObject;
  c: string;
  x?: number;
  y?: number;
  out?: string;
}

type NodesObject = {
  [inputNodeId: string]: Node;
};

class Node implements INode {
  id: string;
  c: string;
  edges: NodesObject;
  x?: number;
  y?: number;
  out?: string;

  static getNodesObject(nodes: Node[]): NodesObject {
    return nodes.reduce<NodesObject>(
      (acc, currentNode) => ({ ...acc, [currentNode.id]: currentNode }),
      {}
    );
  }

  constructor({ id, edges, x, y, out, c }: INode) {
    this.id = id;
    this.edges = edges;
    this.x = x;
    this.y = y;
    this.out = out;
    this.c = c;
  }

  get rawNode(): INode {
    return {
      id: this.id,
      edges: this.edges,
      x: this.x,
      y: this.y,
      out: this.out,
      c: this.c,
    };
  }
}

type RawEdge = [string, string, string, string];

type EdgeObject = {
  in: string;
  outputNodeId: string;
  out: string;
};

type NodeEdgesObject = {
  [inputNodeId: string]: EdgeObject[];
};

class Edge {
  inputNodeId: string;
  inputNode?: Node;
  inputName: string;
  outputNodeId: string;
  outputNode?: Node;
  outputName: string;

  static getNodeEdgesObject(edges: Edge[]): NodeEdgesObject {
    return edges.reduce<NodeEdgesObject>(
      (acc, { inputNodeId, inputName, outputNodeId, outputName }) => ({
        ...acc,
        [inputNodeId]: [
          ...(acc[inputNodeId] || []),
          { in: inputName, outputNodeId, out: outputName },
        ],
      }),
      {}
    );
  }

  constructor(rawEdge: RawEdge, inputNode?: Node, outputNode?: Node) {
    const [inputNodeId, inputName, outputNodeId, outputName] = rawEdge;
    this.inputNodeId = inputNodeId;
    this.outputNodeId = outputNodeId;
    this.inputName = inputName;
    this.outputName = outputName;
    this.inputNode = inputNode;
    this.outputNode = outputNode;
  }

  toEdgeObject(): EdgeObject {
    return {
      in: this.inputName,
      outputNodeId: this.outputNodeId,
      out: this.outputName,
    };
  }

  get rawEdge(): RawEdge {
    return [
      this.inputNodeId,
      this.inputName,
      this.outputNodeId,
      this.outputName,
    ];
  }
}

interface IComment {
  comment: string[];
}

class Comment implements IComment {
  comment: string[];

  constructor({ comment }: IComment) {
    this.comment = comment;
  }

  get rawComment(): IComment {
    return { comment: this.comment };
  }
}

type RawGraph = {
  nodes: INode[];
  edges: RawEdge[];
  comments: IComment[];
};

class Graph {
  nodes: Node[];
  edges: Edge[];
  comments: Comment[];
  nodesObject: NodesObject;
  nodeEdgesObject: NodeEdgesObject;

  constructor(rawGraph: RawGraph) {
    this.nodes = rawGraph.nodes.map((rawNode) => new Node(rawNode));
    this.edges = rawGraph.edges.map((rawEdge) => new Edge(rawEdge));
    this.comments = rawGraph.comments.map(
      (rawComments) => new Comment(rawComments)
    );
    this.nodesObject = Node.getNodesObject(this.nodes);
    this.nodeEdgesObject = Edge.getNodeEdgesObject(this.edges);
  }

  get rawGraph(): RawGraph {
    return {
      nodes: this.nodes.map((n) => n.rawNode),
      edges: this.edges.map((e) => e.rawEdge),
      comments: this.comments.map((c) => c.rawComment),
    };
  }

  /**
   * Select a set of node
   * @param filterNodesIds provided ID
   */
  getNodesByIds(filterNodesIds: string[]): Node[] {
    return map(filterNodesIds, (nodeId) => this.nodesObject[nodeId]);
  }

  /**
   * Get all root nodes in graph
   */
  getRootNodes(): Node[] {
    return filter(this.nodes, (node) =>
      every(this.edges, ({ inputNodeId }) => inputNodeId !== node.id)
    );
  }

  /**
   * Compare if two graph are identical
   */
  equals(graph: Graph) {
    return isEqual(graph.rawGraph, this.rawGraph);
  }

  /**
   * Compare if this graph and raw graph are identical
   */
  equalsRaw(rawGraph: RawGraph) {
    return isEqual(rawGraph, this.rawGraph);
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

  composeTreeWithRootNode(rootNodeId: string): Node {
    return this.composeTree(this.nodesObject[rootNodeId], []);
  }

  composeTrees(): Node[] {
    return map(this.getRootNodes(), (rootNode) =>
      this.composeTreeWithRootNode(rootNode.id)
    );
  }

  composeTreesInlined(): Node[] {
    const inlinedGraph = this.inlineUserFunctionsInGraph(this.saveGraph());
    return map(this.findRootNodes(inlinedGraph), (rootNode) =>
      this.composeTreeFromGraph(inlinedGraph, rootNode.id)
    );
  }
}

type SchemaComponent = {
  isUserFunction: boolean;
};

type Schema = {
  components: {
    [name: string]: SchemaComponent;
  };
};

type vaxOptions = {
  schema: Schema;
};

class VAX {
  private graph!: Graph;
  private schema: Schema;
  private userFunctionStorage: Map<string, () => {}>;

  constructor(options: vaxOptions) {
    const { schema } = options;
    this.schema = schema;
    this.userFunctionStorage = new Map<string, () => {}>();
    this.loadGraph({ nodes: [], edges: [], comments: [] });
  }

  /**
   * Load a raw graph in the instnace
   * @param graph raw graph provided by user
   */
  loadGraph(graph: RawGraph): Graph {
    if (this.graph.equalsRaw(graph)) {
      return this.graph;
    }
    return new Graph(graph);
  }

  saveGraph(filterNodeIds?: string[]): RawGraph {
    return this.graph.rawGraph;
  }

  saveFilteredGraph(filterNodeIds: string[]): RawGraph {
    // TODO: Implementation
    return this.graph.rawGraph;
  }

  inlineUserFunctionsInGraph(rawUserFunctionsIds?: string[]): Graph {
    const userFunctionsIds = [
      ...(rawUserFunctionsIds || []),
      ...(rawUserFunctionsIds
        ? []
        : Object.entries(this.schema.components)
            .filter(([, component]) => component.isUserFunction)
            .map(([name]) => name)),
    ];
    const userFunctionsNodes = this.graph.nodes.filter((n) =>
      includes(userFunctionsIds, n.c)
    );

    if (userFunctionsNodes.length <= 0) {
      return this.graph;
    }

    // TODO: not implemented
    return graph || this.graph;
  }
}

export default VAX;
