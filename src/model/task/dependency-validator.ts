import { AmbiguousIdError } from "../errors/entity-id.ts";
import { AmbiguousTaskIdError } from "../errors/task-id.ts";
import type { Task } from "../types.ts";
import { buildDependencyGraph, findCycleThroughRoot } from "./dependency-graph.ts";
import { taskIdsEqual } from "./task-id.ts";

/**
 * Validate dependencies against the project corpus and report defects already stored in it.
 *
 * The corpus spans working-copy tasks, completed, and archived records: Done is the normal
 * end state of a predecessor, so a task whose target moved to completed/ or the archive must keep a
 * valid, editable dependency list. Only validation resolves these targets; readiness and graph
 * semantics are unchanged.
 *
 * Inputs are matched by canonical task identity and fail closed on ambiguous records. Controller supplies
 * every local record, including duplicate claims, rather than a de-duplicated display projection.
 */
export class DependencyValidator {
	constructor(private readonly tasks: readonly Task[]) {}

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
	validate(dependencies: string[], target?: Task): { valid: string[]; invalid: string[] } {
		return this.validateAgainstCorpus(dependencies, target);
	}

	/** Validates replacement and additive edits against one loaded corpus. */
	validateUpdates(
		updates: { readonly replacement?: string[]; readonly additions?: string[] },
		target?: Task,
	): {
		replacement?: { valid: string[]; invalid: string[] };
		additions?: { valid: string[]; invalid: string[] };
	} {
		return {
			...(updates.replacement === undefined
				? {}
				: { replacement: this.validateAgainstCorpus(updates.replacement, target) }),
			...(updates.additions === undefined ? {} : { additions: this.validateAgainstCorpus(updates.additions, target) }),
		};
	}

	private validateAgainstCorpus(
		dependencies: string[],
		target: Task | undefined,
	): { valid: string[]; invalid: string[] } {
		const valid: string[] = [];
		const invalid: string[] = [];
		if (dependencies.length === 0) return { valid, invalid };

		for (const dependency of dependencies) {
			this.validateInput(dependency, target, valid, invalid);
		}
		// Every new cycle must run through the target, because the edges being added all leave it. The
		// graph is built once with the validated dependencies as the target's edges, so cycle detection
		// reuses the shared dependency-graph model instead of traversing the corpus a second time.
		if (target && valid.length > 0) {
			// The proposed list supersedes the target's stored one, so the stored record leaves the
			// corpus: its old outgoing edges would otherwise re-enter through the graph's reverse
			// traversal and let an existing cycle veto its own repair.
			const graph = buildDependencyGraph(
				{ ...target, dependencies: valid },
				{
					tasks: this.tasks.filter((task) => !taskIdsEqual(task.id, target.id)),
					completedTasks: [],
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

	private validateInput(dependency: string, target: Task | undefined, valid: string[], invalid: string[]): void {
		const resolved = resolveUniqueDependency(
			dependency,
			this.tasks.filter((candidate) => taskIdsEqual(dependency, candidate.id)),
		);
		if (resolved === null) {
			if (target && taskIdsEqual(dependency, target.id)) throwSelfDependency(target, dependency);
			invalid.push(dependency);
			return;
		}
		if (target && taskIdsEqual(resolved, target.id)) throwSelfDependency(target, dependency);
		if (!valid.some((existing) => taskIdsEqual(existing, resolved))) valid.push(resolved);
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
