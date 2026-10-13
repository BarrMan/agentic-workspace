import type { Task } from "../../../../types/index.ts";

/** A board status and its identity-based task selection. */
export class Lane {
	readonly status: string;
	readonly tasks: Task[];
	readonly selectedId: string | null;

	constructor(status: string, tasks: readonly Task[], selectedId?: string | null) {
		this.status = status;
		this.tasks = [...tasks];
		this.selectedId =
			selectedId && this.tasks.some((task) => task.id === selectedId) ? selectedId : (this.tasks[0]?.id ?? null);
	}

	get selected(): Task | undefined {
		return this.tasks.find((task) => task.id === this.selectedId);
	}

	get selectedIndex(): number {
		return this.selectedId ? this.tasks.findIndex((task) => task.id === this.selectedId) : -1;
	}
}
