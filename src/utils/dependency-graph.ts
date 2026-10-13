import type { Task } from "../types/index.ts";
import { canonicalTaskId } from "./task-id.ts";
import { createTaskRecordIndex, type TaskRecordIndex } from "./task-record-index.ts";
import { compareTaskIds } from "./task-sorting.ts";

/** Which way a traversal walks the dependency edges away from the selected task. */
export type DependencyDirection = "dependencies" | "dependents";

/** How an identity named by the graph resolved inside the visible corpus. */
export type DependencyNodeState =
	/** Exactly one visible record claims the identity. */
	| "resolved"
	/** More than one record claims the identity, so no record may be chosen. */
	| "ambiguous"
	/** No visible record claims the identity. */
	| "missing";

export interface DependencyGraphNode {
	/** The record's own ID spelling when resolved, otherwise the reference as it was recorded. */
	id: string;
	title: string | null;
	status: string | null;
	state: DependencyNodeState;
	/** The record is in the completed corpus or holds the terminal status. Never true when unresolved. */
	completed: boolean;
	/** Hops along dependency edges from the root: 0 root, 1 direct, higher transitive, null unreachable. */
	dependencyDepth: number | null;
	/** Hops against dependency edges from the root: 0 root, 1 direct, higher transitive, null unreachable. */
	dependentDepth: number | null;
}

/** A directed edge. `from` declares the dependency, `to` is depended on, so `to` blocks `from`. */
export interface DependencyGraphEdge {
	from: string;
	to: string;
}

/**
 * The dependency context around one selected task: everything it transitively depends on and
 * everything that transitively depends on it, resolved once against a single visible corpus.
 */
export interface DependencyGraph {
	rootId: string;
	/** Every reached identity exactly once, root first, then ordered by task ID. */
	nodes: DependencyGraphNode[];
	/** Every reached edge exactly once, ordered by `from` then `to`. */
	edges: DependencyGraphEdge[];
}

type GraphEntry = { key: string; node: DependencyGraphNode };
type GraphTraversalState = { key: string; depth: number };

export interface DependencyGraphContext {
	readonly index: TaskRecordIndex;
	readonly dependencies: ReadonlyMap<string, readonly { key: string; reference: string }[]>;
	readonly dependents: ReadonlyMap<string, readonly { key: string; reference: string }[]>;
}

export type DependencyGraphOptions = {
	tasks: Task[];
	completedTasks?: Task[];
	statuses?: readonly string[];
	ambiguousIds?: ReadonlySet<string>;
	index?: TaskRecordIndex;
};

/** Prepare canonical relationship indexes once for a task corpus. */
export function createDependencyGraphContext(options: DependencyGraphOptions): DependencyGraphContext {
	const index = options.index ?? createTaskRecordIndex(options);
	const dependencies = new Map<string, Array<{ key: string; reference: string }>>();
	const dependents = new Map<string, Array<{ key: string; reference: string }>>();
	for (const record of index.records) {
		const fromKey = canonicalTaskId(record.task.id);
		const declared = (record.task.dependencies ?? []).map((reference) => ({
			key: canonicalTaskId(reference),
			reference,
		}));
		dependencies.set(fromKey, declared);
		for (const dependency of declared) {
			const existing = dependents.get(dependency.key);
			if (existing) existing.push({ key: fromKey, reference: record.task.id });
			else dependents.set(dependency.key, [{ key: fromKey, reference: record.task.id }]);
		}
	}
	for (const entries of dependents.values()) entries.sort((a, b) => compareTaskIds(a.key, b.key));
	return { index, dependencies, dependents };
}

/** The hop distance from the root in one direction, or null when the node is not reachable that way. */
export function depthInDirection(node: DependencyGraphNode, direction: DependencyDirection): number | null {
	return direction === "dependencies" ? node.dependencyDepth : node.dependentDepth;
}

/** The reached nodes in one direction, excluding the root, in graph order. */
export function nodesInDirection(graph: DependencyGraph, direction: DependencyDirection): DependencyGraphNode[] {
	return graph.nodes.filter((node) => {
		const depth = depthInDirection(node, direction);
		return depth !== null && depth > 0;
	});
}

/**
 * Resolve the complete dependency context around one task, on demand.
 *
 * The caller supplies the corpus, which is what keeps graph resolution inside the same visibility
 * the surface already uses for task detail: the CLI and TUI pass the current checkout plus the
 * completed records, the browser passes its configured cross-branch corpus. Archived records are
 * not part of any of those corpora, so an archived ID resolves as missing instead of being
 * resurrected after archiving released its identity.
 *
 * Both traversals are breadth-first over canonical identities, so every reached identity becomes
 * exactly one node carrying its shortest distance from the root, and chains, branches, diamonds,
 * and cycles all terminate without duplicating a node or repeating a subtree. Identities that no
 * visible record claims, and identities that more than one record claims, become explicit
 * unresolved nodes: they are reported, never guessed at, and never traversed through, so a
 * relationship behind one is never presented as resolved.
 */
export function buildDependencyGraph(
	root: Task,
	options: DependencyGraphOptions | DependencyGraphContext,
): DependencyGraph {
	const context = "index" in options && "dependencies" in options ? options : createDependencyGraphContext(options);
	const { index } = context;
	const rootKey = canonicalTaskId(root.id);
	const entries = new Map<string, GraphEntry>();
	const edges = new Map<string, { fromKey: string; toKey: string }>();

	const rootRecord = index.lookup(rootKey);
	entries.set(rootKey, {
		key: rootKey,
		node: {
			id: root.id,
			title: root.title,
			status: root.status,
			state: "resolved",
			completed: index.isFinished(
				rootRecord !== undefined && rootRecord !== "ambiguous" ? rootRecord : { task: root, completedRecord: false },
			),
			dependencyDepth: 0,
			dependentDepth: 0,
		},
	});

	const ensureEntry = (key: string, reference: string): GraphEntry => {
		const existing = entries.get(key);
		if (existing) return existing;

		const record = index.lookup(key);
		const base = { dependencyDepth: null, dependentDepth: null, completed: false } as const;
		let node: DependencyGraphNode;
		if (record === undefined) {
			node = { id: reference.trim() || key, title: null, status: null, state: "missing", ...base };
		} else if (record === "ambiguous") {
			node = { id: key, title: null, status: null, state: "ambiguous", ...base };
		} else {
			node = {
				id: record.task.id,
				title: record.task.title,
				status: record.task.status,
				state: "resolved",
				completed: index.isFinished(record),
				dependencyDepth: null,
				dependentDepth: null,
			};
		}
		const entry: GraphEntry = { key, node };
		entries.set(key, entry);
		return entry;
	};

	const addEdge = (fromKey: string, toKey: string) => {
		edges.set(`${fromKey} -> ${toKey}`, { fromKey, toKey });
	};

	// The declared dependencies of an identity. The root is answered from the caller's record so the
	// graph still resolves for a task that is not part of the supplied corpus.
	const dependenciesOf = (key: string): string[] => {
		if (key === rootKey) return root.dependencies ?? [];
		return context.dependencies.get(key)?.map((dependency) => dependency.reference) ?? [];
	};

	const traverse = (
		direction: DependencyDirection,
		neighbours: (key: string) => ReadonlyArray<{ key: string; reference: string }>,
	) => {
		const queue: GraphTraversalState[] = [{ key: rootKey, depth: 0 }];
		for (let cursor = 0; cursor < queue.length; cursor++) {
			const current = queue[cursor];
			if (!current) break;
			const entry = entries.get(current.key);
			// Unresolved identities are never walked through: their edges cannot be attributed.
			if (entry?.node.state !== "resolved") continue;

			for (const neighbour of neighbours(current.key)) {
				addTraversalNeighbour(direction, current, neighbour, queue, ensureEntry, addEdge);
			}
		}
	};

	traverse("dependencies", (key) =>
		dependenciesOf(key).map((reference) => ({ key: canonicalTaskId(reference), reference })),
	);
	traverse("dependents", (key) => context.dependents.get(key) ?? []);

	const rootEntry = entries.get(rootKey);
	const ordered = [...entries.values()]
		.filter((entry) => entry.key !== rootKey)
		.sort((a, b) => compareTaskIds(a.node.id, b.node.id));
	const orderedEntries = rootEntry ? [rootEntry, ...ordered] : ordered;
	const idByKey = new Map(orderedEntries.map((entry) => [entry.key, entry.node.id]));

	return {
		rootId: root.id,
		nodes: orderedEntries.map((entry) => entry.node),
		edges: [...edges.values()]
			.map((edge) => ({ from: idByKey.get(edge.fromKey) ?? edge.fromKey, to: idByKey.get(edge.toKey) ?? edge.toKey }))
			.sort((a, b) => compareTaskIds(a.from, b.from) || compareTaskIds(a.to, b.to)),
	};
}

function addTraversalNeighbour(
	direction: DependencyDirection,
	current: GraphTraversalState,
	neighbour: { key: string; reference: string },
	queue: GraphTraversalState[],
	ensureEntry: (key: string, reference: string) => GraphEntry,
	addEdge: (fromKey: string, toKey: string) => void,
): void {
	const next = ensureEntry(neighbour.key, neighbour.reference);
	if (direction === "dependencies") addEdge(current.key, neighbour.key);
	else addEdge(neighbour.key, current.key);
	if (depthInDirection(next.node, direction) !== null) return;
	if (direction === "dependencies") next.node.dependencyDepth = current.depth + 1;
	else next.node.dependentDepth = current.depth + 1;
	queue.push({ key: neighbour.key, depth: current.depth + 1 });
}

/**
 * The shortest dependency path that leaves the root and returns to it, as node IDs with the root at
 * both ends, or null when no dependency of the root leads back to it.
 *
 * This walks the edges the graph already resolved instead of traversing the corpus again, and it
 * follows the graph's own rule that unresolved identities are never walked through. The root's
 * stored self-edge is ignored here: a direct self-dependency is its own defect with its own
 * report, and it must not masquerade as a cycle closed by some other dependency.
 */
export function findCycleThroughRoot(graph: DependencyGraph): string[] | null {
	const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
	return findShortestRootCycle(graph.rootId, nodesById, dependencyAdjacency(graph.edges));
}

function dependencyAdjacency(edges: DependencyGraphEdge[]): Map<string, string[]> {
	const dependenciesById = new Map<string, string[]>();
	for (const edge of edges) {
		const existing = dependenciesById.get(edge.from);
		if (existing) existing.push(edge.to);
		else dependenciesById.set(edge.from, [edge.to]);
	}
	return dependenciesById;
}

function findShortestRootCycle(
	rootId: string,
	nodesById: ReadonlyMap<string, DependencyGraphNode>,
	dependenciesById: ReadonlyMap<string, string[]>,
): string[] | null {
	const parents = new Map<string, string>();
	const queue = [rootId];
	for (let cursor = 0; cursor < queue.length; cursor++) {
		const currentId = queue[cursor];
		if (currentId === undefined) break;
		if (nodesById.get(currentId)?.state !== "resolved") continue;
		for (const nextId of dependenciesById.get(currentId) ?? []) {
			const cycle = visitCycleEdge(currentId, nextId, rootId, parents, queue);
			if (cycle) return cycle;
		}
	}
	return null;
}

function visitCycleEdge(
	currentId: string,
	nextId: string,
	rootId: string,
	parents: Map<string, string>,
	queue: string[],
): string[] | null {
	if (nextId === rootId) return currentId === rootId ? null : cyclePath(currentId, rootId, parents);
	if (parents.has(nextId)) return null;
	parents.set(nextId, currentId);
	queue.push(nextId);
	return null;
}

function cyclePath(currentId: string, rootId: string, parents: ReadonlyMap<string, string>): string[] {
	const reversed = [currentId];
	let cursor: string | undefined = currentId;
	while (cursor !== undefined && cursor !== rootId) {
		cursor = parents.get(cursor);
		if (cursor !== undefined) reversed.push(cursor);
	}
	return [...reversed.reverse(), rootId];
}

export interface DependencyTreeNode {
	node: DependencyGraphNode;
	children: DependencyTreeNode[];
	/**
	 * Set when this occurrence is deliberately not expanded: `"cycle"` when it points back at an
	 * ancestor of this branch, `"repeat"` when the same node was already expanded elsewhere.
	 */
	repeat: "cycle" | "repeat" | null;
}

/**
 * Arrange one direction of the graph as a tree for display.
 *
 * Every node is expanded at most once across the whole tree, so a diamond or a cycle costs one
 * extra line instead of a duplicated subtree and the output stays linear in nodes plus edges.
 */
export function buildDependencyTree(graph: DependencyGraph, direction: DependencyDirection): DependencyTreeNode[] {
	const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
	const children = treeChildren(graph.edges, direction);

	const expanded = new Set<string>([graph.rootId]);
	const branch = new Set<string>([graph.rootId]);

	// Depth-first with an explicit stack, so a pathological dependency chain cannot exhaust the call
	// stack. Each frame expands one node's children into that node's `children` array.
	const roots: DependencyTreeNode[] = [];
	const stack: Array<{ id: string; childIds: string[]; position: number; into: DependencyTreeNode[] }> = [
		{ id: graph.rootId, childIds: children.get(graph.rootId) ?? [], position: 0, into: roots },
	];
	while (stack.length > 0) {
		const frame = stack[stack.length - 1];
		const childId = frame?.childIds[frame.position];
		if (!frame || childId === undefined) {
			stack.pop();
			if (frame) branch.delete(frame.id);
			continue;
		}
		frame.position += 1;
		appendTreeChild(frame, childId, nodesById, children, expanded, branch, stack);
	}
	return roots;
}

function treeChildren(edges: DependencyGraphEdge[], direction: DependencyDirection): Map<string, string[]> {
	const children = new Map<string, string[]>();
	for (const edge of edges) {
		const parent = direction === "dependencies" ? edge.from : edge.to;
		const child = direction === "dependencies" ? edge.to : edge.from;
		const existing = children.get(parent);
		if (existing) existing.push(child);
		else children.set(parent, [child]);
	}
	for (const list of children.values()) list.sort(compareTaskIds);
	return children;
}

function appendTreeChild(
	frame: { id: string; childIds: string[]; position: number; into: DependencyTreeNode[] },
	childId: string,
	nodesById: ReadonlyMap<string, DependencyGraphNode>,
	children: ReadonlyMap<string, string[]>,
	expanded: Set<string>,
	branch: Set<string>,
	stack: Array<{ id: string; childIds: string[]; position: number; into: DependencyTreeNode[] }>,
): void {
	const node = nodesById.get(childId);
	if (!node) return;
	if (branch.has(childId)) return void frame.into.push({ node, children: [], repeat: "cycle" });
	if (expanded.has(childId)) return void frame.into.push({ node, children: [], repeat: "repeat" });
	expanded.add(childId);
	if (node.state !== "resolved") return void frame.into.push({ node, children: [], repeat: null });
	branch.add(childId);
	const treeNode: DependencyTreeNode = { node, children: [], repeat: null };
	frame.into.push(treeNode);
	stack.push({ id: childId, childIds: children.get(childId) ?? [], position: 0, into: treeNode.children });
}

/**
 * One line naming the records that lost a stored reference when a task ID was vacated by
 * archiving or demoting. Every surface says it in the same words, and says nothing when the
 * operation changed no other record.
 */
export function formatDependencyCleanupMessage(
	vacatedTaskId: string,
	cleanedTaskIds: readonly string[],
): string | null {
	if (cleanedTaskIds.length === 0) return null;
	return `Removed references to ${vacatedTaskId} from ${cleanedTaskIds.join(", ")}`;
}
