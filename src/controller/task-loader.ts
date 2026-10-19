import type { TaskIdentityIndex } from "../model/task/task-identity-index.ts";
import type { AgenticWorkspaceConfig, Task } from "../model/types.ts";

/** One immutable task read shared by persistent query and repair operations. */
export interface TaskCorpusSnapshot {
	tasks: Task[];
	activeTasks: Task[];
	completedTasks: Task[];
	identityIndex?: TaskIdentityIndex;
	config?: AgenticWorkspaceConfig | null;
}
