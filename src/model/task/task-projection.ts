import type { AgenticWorkspaceConfig, Task } from "../types.ts";
import type { DependencyGraph } from "./dependency-graph.ts";
import type { TaskReadiness } from "./readiness.ts";
import type { TaskIdentityIndex } from "./task-identity-index.ts";

/** Read-only derived task fields; never persisted on the task record. */
export type TaskListItem = Task & { isReady: boolean };
export type TaskDetail = Task & { dependencyGraph: DependencyGraph; readiness: TaskReadiness };

/** A single project corpus shared by relationship and readiness projections. */
export interface TaskCorpusSnapshot {
	tasks: Task[];
	activeTasks: Task[];
	completedTasks: Task[];
	identityIndex?: TaskIdentityIndex;
	config?: AgenticWorkspaceConfig | null;
}
