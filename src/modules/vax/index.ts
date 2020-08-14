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

enum EdgeFilter {
  INPUT = "input",
  OUTPUT = "output",
}

interface INode {
  id: string;
  a: any;
  t: any;
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
  a: any;
  t: any;
  c: string; // component
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

  constructor({ id, edges, x, y, out, c, a, t }: INode, prefix?: string) {
    this.id = `${prefix || ""}${id}`;
    this.a = a;
    this.t = t;
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
      a: this.a,
      t: this.t,
    };
  }

  clone(prefix?: string): Node {
    return new Node(this.rawNode, prefix);
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
  actions: string[];

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

  constructor(
    rawEdge: RawEdge,
    prefix?: string,
    inputNode?: Node,
    outputNode?: Node
  ) {
    const [inputNodeId, inputName, outputNodeId, outputName] = rawEdge;
    this.inputNodeId = inputNodeId;
    this.outputNodeId = outputNodeId;
    this.inputName = `${prefix || ""}${inputName}`;
    this.outputName = `${prefix || ""}${outputName}`;
    this.inputNode = inputNode;
    this.outputNode = outputNode;
    this.actions = [];
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

  clone(prefix?: string): Edge {
    return new Edge(this.rawEdge, prefix);
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

  constructor(rawGraph: RawGraph, prefix?: string) {
    this.nodes = rawGraph.nodes.map((rawNode) => new Node(rawNode, prefix));
    this.edges = rawGraph.edges.map((rawEdge) => new Edge(rawEdge, prefix));
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

  getEdges(node: Node, edgeFilterBy?: EdgeFilter): Edge[] {
    return this.edges.filter((edge) => {
      switch (edgeFilterBy) {
        case EdgeFilter.INPUT:
          return edge.inputNodeId === node.id;
        case EdgeFilter.OUTPUT:
          return edge.outputNodeId === node.id;
        default:
          return edge.inputNodeId === node.id || edge.outputNodeId === node.id;
      }
    });
  }

  /**
   * Get all root nodes in graph
   */
  getRootNodes(): Node[] {
    return filter(this.nodes, (node) =>
      every(this.edges, ({ inputNodeId }) => inputNodeId !== node.id)
    );
  }

  addNodes(nodes: Node[]): void {
    this.nodes = [...this.nodes, ...nodes];
  }

  addEdges(edges: Edge[]): void {
    this.edges = [...this.edges, ...edges];
  }

  deleteNodes(filterFn: (node: Node, index: number) => boolean): void {
    this.nodes = this.nodes.filter((node, index) => !filterFn(node, index));
  }

  deleteEdges(filterFn: (edge: Edge, index: number) => boolean): void {
    this.edges = this.edges.filter((edge, index) => !filterFn(edge, index));
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

  clone(prefix?: string): Graph {
    return new Graph(this.rawGraph, prefix);
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
  private counter: number;

  constructor(options: vaxOptions) {
    const { schema } = options;
    this.counter = 0;
    this.schema = schema;
    this.userFunctionStorage = new Map<string, () => {}>();
    this.loadGraph({ nodes: [], edges: [], comments: [] });
  }

  generateNextID() {
    return this.counter++;
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
    // TODO: Implementation
    return this.graph.rawGraph;
  }

  saveFilteredGraph(filterNodeIds: string[]): RawGraph {
    // TODO: Implementation
    return this.graph.rawGraph;
  }

  private evaluateUserFunctionNode(node: Node, graph: Graph): void {
    const userFunction = this.userFunctionStorage.get(node.c);
    const prefix = `uf_${this.generateNextID()}_`;
    const cloneGraphWithPrefix = graph.clone(prefix);

    // update edges
    const edgeWithNodeAsInput = graph.getEdges(node, EdgeFilter.INPUT);

    edgeWithNodeAsInput.forEach((edge) => {
      const { inputName } = edge;
      const userFunctionInputNodeWithPrefix = cloneGraphWithPrefix.nodes.find(
        (n) => n.c === "UF_Input" && n.a.Name === inputName
      );
      if (userFunctionInputNodeWithPrefix) {
        cloneGraphWithPrefix
          .getEdges(userFunctionInputNodeWithPrefix, EdgeFilter.INPUT)
          .forEach((userFunctionEdge) => {
            edge.inputName = userFunctionEdge.inputName;
            edge.inputNodeId = userFunctionEdge.inputNodeId;
            userFunctionEdge.actions.push("toDelete");
          });
      }
    });

    const edgeWithNodeAsOutput = graph.getEdges(node, EdgeFilter.OUTPUT);

    edgeWithNodeAsOutput.forEach((edge) => {
      const { outputName } = edge;
      const userFunctionOutputNodeWithPrefix = cloneGraphWithPrefix.nodes.find(
        (n) => n.c === "UF_Output" && n.a.Name === outputName
      );
      if (userFunctionOutputNodeWithPrefix) {
        cloneGraphWithPrefix
          .getEdges(userFunctionOutputNodeWithPrefix, EdgeFilter.OUTPUT)
          .forEach((userFunctionEdge) => {
            edge.outputName = userFunctionEdge.outputName;
            edge.outputNodeId = userFunctionEdge.outputNodeId;
            userFunctionEdge.actions.push("toDelete");
          });
      }
    });

    // delete system nodes
    const systemNodesIds = cloneGraphWithPrefix.nodes
      .filter((userFunctionNode) => userFunctionNode.c.substr(0, 3) === "UF_")
      .map((userFunctionNode) => userFunctionNode.id);

    cloneGraphWithPrefix.deleteNodes(
      (userFunctionNode) => userFunctionNode.c.substr(0, 3) === "UF_"
    );
    cloneGraphWithPrefix.deleteEdges(
      (userFunctionEdge) =>
        userFunctionEdge.actions.includes("toDelete") ||
        includes(systemNodesIds, userFunctionEdge.outputNodeId) ||
        includes(systemNodesIds, userFunctionEdge.inputNodeId)
    );

    graph.deleteEdges((edge) => edge.actions.includes("toDelete"));
    graph.deleteNodes((n) => n.id === node.id);

    graph.addNodes(cloneGraphWithPrefix.nodes);
    graph.addEdges(cloneGraphWithPrefix.edges);
  }

  inlineUserFunctionsInGraph(
    graph: Graph = this.graph,
    rawUserFunctionsIds?: string[]
  ): Graph {
    const userFunctionsIds = [
      ...(rawUserFunctionsIds || []),
      ...(rawUserFunctionsIds
        ? []
        : Object.entries(this.schema.components)
            .filter(([, component]) => component.isUserFunction)
            .map(([name]) => name)),
    ];
    const userFunctionsNodes = graph.nodes.filter((n) =>
      includes(userFunctionsIds, n.c)
    );

    // if no user functions spotted
    if (userFunctionsNodes.length <= 0) {
      return this.graph;
    }

    userFunctionsNodes.forEach((node) =>
      this.evaluateUserFunctionNode(node, graph)
    );

    // check if we've introduced new user functions by inlining
    const updatedUserFunctionNodes = graph.nodes.filter((n) =>
      includes(userFunctionsIds, n.c)
    );

    if (!updatedUserFunctionNodes.length) {
      // no user functions spotted, we're cool
      return graph;
    } else {
      // repeat until we have no user functions left
      return this.inlineUserFunctionsInGraph(graph, userFunctionsIds);
    }
  }

  composeTreesInlined(): Node[] {
    const inlinedGraph = this.inlineUserFunctionsInGraph();
    return map(inlinedGraph.getRootNodes(), (rootNode) =>
      inlinedGraph.composeTreeWithRootNode(rootNode.id)
    );
  }
}

export default VAX;
