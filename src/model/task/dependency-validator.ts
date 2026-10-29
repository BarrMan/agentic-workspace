import type { Task } from "../types.ts";
import { buildDependencyGraph, findCycleThroughRoot } from "./dependency-graph.ts";

/**
 * Validate dependencies against the project corpus and report defects already stored in it.
 *
 * The corpus spans working-copy tasks, completed, and archived records: Done is the normal
 * end state of a predecessor, so a task whose target moved to completed/ or the archive must keep a
 * valid, editable dependency list. Only validation resolves these targets; readiness and graph
 * semantics are unchanged.
 *
 * Inputs are matched by exact task ID against the corpus supplied by Controller.
 */
export class DependencyValidator {
	constructor(private readonly tasks: readonly Task[]) {}

	/**
	 * Validate that all dependencies exist in the working copy.
	 *
	 * When `target` names the task being created or edited, a dependency resolving to the target
	 * itself is rejected, and a dependency that would close a cycle through the
	 * existing graph is rejected with the cycle path. An unresolved input is also checked against the
	 * target before being reported as missing: creation validates against an identity allocated
	 * moments ago, which no corpus record claims, so a dangling reference to
	 * exactly that ID would become a self-dependency the moment the record is written under it.
	 */
	validate(dependencies: string[], target?: Task): { valid: string[]; invalid: string[] } {
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
					tasks: this.tasks.filter((task) => task.id !== target.id),
					completedTasks: [],
				},
			);
			const cycle = findCycleThroughRoot(graph);
			if (cycle) throw new Error(`These dependencies would create a cycle: ${cycle.join(" -> ")}`);
		}
		return { valid, invalid };
	}

	private validateInput(dependency: string, target: Task | undefined, valid: string[], invalid: string[]): void {
		if (target && dependency === target.id) throwSelfDependency(target, dependency);
		if (!this.tasks.some((candidate) => candidate.id === dependency)) {
			invalid.push(dependency);
			return;
		}
		if (!valid.includes(dependency)) valid.push(dependency);
	}
}

function throwSelfDependency(target: Task, dependency: string): never {
	throw new Error(`Task ${target.id} cannot depend on itself ("${dependency.trim()}" names this task).`);
}
