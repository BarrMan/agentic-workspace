/**
 * Appended to a task not-found message produced by a working-copy lookup.
 *
 * Task lookups deliberately stay local, so a miss is not proof the ID is unused. The hint is a
 * fixed sentence rather than a branch scan, because scanning branches is the cost local lookups
 * exist to avoid.
 */
export const LOCAL_TASK_LOOKUP_HINT =
	"Task lookups read only the local working copy; use 'agentic-workspace board' to see tasks from other branches.";
