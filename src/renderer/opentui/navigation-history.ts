import type { SharedWorkspaceState } from "./workspace/state.ts";

export type WorkspaceNavigationSnapshot = {
	view: "workspace" | "board";
	selectedTaskId?: string;
	activeStatus?: string;
	filters: SharedWorkspaceState["filters"];
};

/** Session-local navigation history. Restoring an entry never creates another entry. */
export class WorkspaceNavigationHistory {
	readonly #limit: number;
	#entries: Array<{ snapshot: WorkspaceNavigationSnapshot; signature: string }> = [];
	#index = -1;

	constructor(limit = 100) {
		if (!Number.isInteger(limit) || limit < 2) throw new Error("Navigation history needs at least two entries.");
		this.#limit = limit;
	}

	record(snapshot: WorkspaceNavigationSnapshot): void {
		const signature = JSON.stringify([
			snapshot.view,
			snapshot.selectedTaskId,
			snapshot.activeStatus,
			snapshot.filters.search,
			snapshot.filters.status,
			snapshot.filters.taskTypes,
			snapshot.filters.projects,
			snapshot.filters.priority,
			snapshot.filters.labels,
			snapshot.filters.milestone,
		]);
		if (this.#entries[this.#index]?.signature === signature) return;
		this.#entries.splice(this.#index + 1);
		this.#entries.push({ snapshot: structuredClone(snapshot), signature });
		if (this.#entries.length > this.#limit) this.#entries.shift();
		this.#index = this.#entries.length - 1;
	}

	back(): WorkspaceNavigationSnapshot | undefined {
		if (this.#index <= 0) return undefined;
		return structuredClone(this.#entries[--this.#index]?.snapshot);
	}

	forward(): WorkspaceNavigationSnapshot | undefined {
		if (this.#index >= this.#entries.length - 1) return undefined;
		return structuredClone(this.#entries[++this.#index]?.snapshot);
	}
}
