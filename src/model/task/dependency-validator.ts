import { AmbiguousIdError } from "../errors/entity-id.ts";
import { AmbiguousTaskIdError } from "../errors/task-id.ts";
import type { Task } from "../types.ts";
import { buildDependencyGraph, findCycleThroughRoot } from "./dependency-graph.ts";
import { taskIdsEqual } from "./task-id.ts";

/** The records dependency validation resolves dependencies against. */
export interface DependencyStore {
	listTasks(): Promise<Task[]>;
	listCompletedTasks(): Promise<Task[]>;
	listArchivedTasks(): Promise<Task[]>;
	loadTask(taskId: string): Promise<Task | null>;
}

interface DependencyCorpus {
	tasks: Task[];
	completed: Task[];
	archived: Task[];
}

/**
 * Validate dependencies against the project corpus and report defects already stored in it.
 *
 * The corpus spans working-copy tasks, completed, and archived records: Done is the normal
 * end state of a predecessor, so a task whose target moved to completed/ or the archive must keep a
 * valid, editable dependency list. Only validation resolves these targets; readiness and graph
 * semantics are unchanged.
 *
 * Inputs are matched by task identity, so bare numeric IDs resolve under any configured prefix, and
 * identity fails closed exactly as it does for the task a command targets. That takes two checks,
 * mirroring the identity index itself: the corpus answers whether the input names more than one
 * identity, and the working-copy lookup answers whether that identity is claimed by more than one
 * file - which the corpus cannot, because it keeps one entry per ID.
 *
 * Resolution stays local for the same reason task reads do: a dependency validated against another
 * branch would name a task no task command can show, and reaching for branches here would put a
 * remote fetch inside the task lock.
 */
export class DependencyValidator {
	constructor(private readonly store: DependencyStore) {}

	/**
	 * Validate that all dependencies exist in the working copy.
	 *
	 * When `target` names the task being created or edited, a dependency resolving to the target
	 * itself is rejected in any spelling, and a dependency that would close a cycle through the
	 * existing graph is rejected with the cycle path. An unresolved input is also checked against the
	 * target before being reported as missing: creation validates against an identity allocated
	 * moments ago, which no corpus record claims, so a dangling reference to
	 * exactly that ID would become a self-dependency the moment the record is written under it.
	 */
	async validate(dependencies: string[], target?: Task): Promise<{ valid: string[]; invalid: string[] }> {
		const corpus = await this.loadCorpus();
		return await this.validateAgainstCorpus(dependencies, target, corpus);
	}

	/** Validates replacement and additive edits against one loaded corpus. */
	async validateUpdates(
		updates: { readonly replacement?: string[]; readonly additions?: string[] },
		target?: Task,
	): Promise<{
		replacement?: { valid: string[]; invalid: string[] };
		additions?: { valid: string[]; invalid: string[] };
	}> {
		const corpus = await this.loadCorpus();
		return {
			...(updates.replacement === undefined
				? {}
				: { replacement: await this.validateAgainstCorpus(updates.replacement, target, corpus) }),
			...(updates.additions === undefined
				? {}
				: { additions: await this.validateAgainstCorpus(updates.additions, target, corpus) }),
		};
	}

	private async validateAgainstCorpus(
		dependencies: string[],
		target: Task | undefined,
		corpus: DependencyCorpus,
	): Promise<{ valid: string[]; invalid: string[] }> {
		const valid: string[] = [];
		const invalid: string[] = [];
		if (dependencies.length === 0) return { valid, invalid };

		const known = [...corpus.tasks, ...corpus.completed, ...corpus.archived];
		for (const dependency of dependencies) {
			await this.validateInput(dependency, known, target, valid, invalid);
		}
		// Every new cycle must run through the target, because the edges being added all leave it. The
		// graph is built once with the validated dependencies as the target's edges, so cycle detection
		// reuses the shared dependency-graph model instead of traversing the corpus a second time.
		if (target && valid.length > 0) {
			// The proposed list supersedes the target's stored one, so the stored record leaves the
			// corpus: its old outgoing edges would otherwise re-enter through the graph's reverse
			// traversal and let an existing cycle veto its own repair.
			const graphCorpus = dependencyGraphCorpus(corpus);
			const graph = buildDependencyGraph(
				{ ...target, dependencies: valid },
				{
					tasks: graphCorpus.tasks.filter((task) => !taskIdsEqual(task.id, target.id)),
					completedTasks: graphCorpus.completedTasks.filter((task) => !taskIdsEqual(task.id, target.id)),
				},
			);
			const cycle = findCycleThroughRoot(graph);
			if (cycle) throw new Error(`These dependencies would create a cycle: ${cycle.join(" -> ")}`);
			// The graph never walks through an ambiguous identity, so a return path behind one cannot
			// be seen. Whatever it hides stays unverifiable, so the mutation fails closed on it.
			const ambiguous = graph.nodes.find((node) => node.state === "ambiguous" && node.dependencyDepth !== null);
			if (ambiguous) {
				throw new Error(
					`Cannot verify the dependencies stay acyclic: more than one record claims ${ambiguous.id}. Remove the conflicting files, then retry.`,
				);
			}
		}
		return { valid, invalid };
	}

	private async validateInput(
		dependency: string,
		known: Task[],
		target: Task | undefined,
		valid: string[],
		invalid: string[],
	): Promise<void> {
		const resolved = resolveUniqueDependency(
			dependency,
			known.filter((candidate) => taskIdsEqual(dependency, candidate.id)),
		);
		if (resolved === null) {
			if (target && taskIdsEqual(dependency, target.id)) throwSelfDependency(target, dependency);
			invalid.push(dependency);
			return;
		}
		if (target && taskIdsEqual(resolved, target.id)) throwSelfDependency(target, dependency);
		await this.store.loadTask(resolved);
		if (!valid.some((existing) => taskIdsEqual(existing, resolved))) valid.push(resolved);
	}

	private async loadCorpus(): Promise<DependencyCorpus> {
		const [tasks, completed, archived] = await Promise.all([
			this.store.listTasks(),
			this.store.listCompletedTasks(),
			this.store.listArchivedTasks(),
		]);
		return { tasks, completed, archived };
	}
}

function resolveUniqueDependency(dependency: string, matches: Task[]): string | null {
	const [first, ...rest] = matches;
	if (!first) return null;
	if (rest.length === 0) return first.id;

	const candidates = matches.map((match) => match.filePath ?? match.id);
	const [canonicalId, ...otherIdentities] = [...new Set(matches.map((match) => match.id))];
	if (canonicalId && otherIdentities.length === 0) throw new AmbiguousTaskIdError(canonicalId, candidates);
	throw new AmbiguousIdError(
		"Dependency",
		dependency,
		candidates,
		`Use a full task ID instead of ${dependency.trim()} to choose one.`,
	);
}

function throwSelfDependency(target: Task, dependency: string): never {
	throw new Error(`Task ${target.id} cannot depend on itself ("${dependency.trim()}" names this task).`);
}

function dependencyGraphCorpus(corpus: DependencyCorpus): { tasks: Task[]; completedTasks: Task[] } {
	return { tasks: [...corpus.tasks, ...corpus.archived], completedTasks: corpus.completed };
}
