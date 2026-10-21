import { BoxRenderable, type CliRenderer, TextAttributes, TextRenderable } from "@opentui/core";
import type { TaskArtifactEntry } from "../../storage/task-artifact-repository.ts";

export interface TaskArtifactViewApi {
	list(taskId: string): Promise<TaskArtifactEntry[]>;
	read(taskId: string, path: string): Promise<Uint8Array>;
	write(taskId: string, path: string, bytes: Uint8Array): Promise<void>;
	subscribeArtifactChanges?(taskId: string, callback: () => void): () => void;
}

export interface TaskArtifactViewOptions {
	renderer: CliRenderer;
	parent: BoxRenderable;
	taskId: string;
	api: TaskArtifactViewApi;
	onError?: (message: string) => void;
}

/** Render generic task artifacts. Async results are bound to task + selected path. */
export class TaskArtifactView {
	readonly root: BoxRenderable;
	private readonly listText: TextRenderable;
	private readonly detailText: TextRenderable;
	private readonly footer: TextRenderable;
	private readonly options: TaskArtifactViewOptions;
	private taskId: string;
	private entries: TaskArtifactEntry[] = [];
	private selectedPath?: string;
	private request = 0;
	private unsubscribeArtifactChanges?: () => void;
	private active = true;
	private disposed = false;

	constructor(options: TaskArtifactViewOptions) {
		this.options = options;
		this.taskId = options.taskId;
		this.root = new BoxRenderable(options.renderer, { width: "100%", height: "100%", flexDirection: "column" });
		const content = new BoxRenderable(options.renderer, { width: "100%", flexGrow: 1, flexDirection: "row" });
		this.listText = new TextRenderable(options.renderer, {
			width: 30,
			height: "100%",
			wrapMode: "word",
			content: "",
			selectable: true,
		});
		this.detailText = new TextRenderable(options.renderer, {
			width: "100%",
			flexGrow: 1,
			flexBasis: 0,
			wrapMode: "word",
			content: "",
			selectable: true,
		});
		content.add(this.listText);
		content.add(this.detailText);
		this.footer = new TextRenderable(options.renderer, {
			width: "100%",
			height: 2,
			wrapMode: "word",
			attributes: TextAttributes.DIM,
			content: "Artifacts · use workspace navigation; Enter/Tab remain available to workspace",
		});
		this.root.add(content);
		this.root.add(this.footer);
		options.parent.add(this.root);
		this.subscribeToTask();
		void this.refresh();
	}

	get selected(): string | undefined {
		return this.selectedPath;
	}

	/** Change task identity and reload; pending results from the previous task are discarded. */
	async setTask(taskId: string): Promise<void> {
		const taskChanged = taskId !== this.taskId;
		if (!taskChanged) return this.refresh();
		this.unsubscribeArtifactChanges?.();
		this.unsubscribeArtifactChanges = undefined;
		this.taskId = taskId;
		this.selectedPath = undefined;
		if (this.active) this.subscribeToTask();
		await this.refresh();
	}

	/** Subscribe only while the artifact view is open. */
	setOpen(open: boolean): void {
		if (this.disposed || this.active === open) return;
		this.active = open;
		if (open) {
			this.subscribeToTask();
			void this.refresh();
		} else {
			this.request++;
			this.unsubscribeArtifactChanges?.();
			this.unsubscribeArtifactChanges = undefined;
		}
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.active = false;
		this.request++;
		this.unsubscribeArtifactChanges?.();
		this.unsubscribeArtifactChanges = undefined;
	}

	async refresh(): Promise<void> {
		if (!this.active || this.disposed) return;
		const taskId = this.taskId;
		const path = this.selectedPath;
		const request = ++this.request;
		try {
			if (!(await this.#loadEntries(taskId, path, request))) return;
			if (!this.entries.some((entry) => entry.path === this.selectedPath)) this.selectedPath = this.entries[0]?.path;
			this.renderList();
			await this.loadSelected(taskId, this.selectedPath, request);
		} catch (error) {
			if (request === this.request && taskId === this.taskId) this.showError(error);
		}
	}

	/** Move relative to the current selection; list ownership and stale-result checks stay here. */
	async navigate(delta: -1 | 1): Promise<void> {
		if (!this.active || this.disposed) return;
		const taskId = this.taskId;
		const path = this.selectedPath;
		const request = ++this.request;
		try {
			if (!(await this.#loadEntries(taskId, path, request))) return;
			this.renderList();
			const current = this.entries.findIndex((entry) => entry.path === path);
			const next = this.entries[Math.max(0, Math.min(this.entries.length - 1, (current < 0 ? 0 : current) + delta))];
			if (next) {
				this.selectedPath = next.path;
				this.renderList();
				await this.loadSelected(taskId, next.path, request);
			}
		} catch (error) {
			if (request === this.request && taskId === this.taskId && path === this.selectedPath && this.active)
				this.showError(error);
		}
	}

	async #loadEntries(taskId: string, path: string | undefined, request: number): Promise<boolean> {
		const entries = await this.options.api.list(taskId);
		if (request !== this.request || taskId !== this.taskId || path !== this.selectedPath || !this.active) return false;
		const byPath = new Map(entries.map((entry) => [entry.path, entry]));
		this.entries = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
		return true;
	}

	async select(path: string): Promise<void> {
		if (!this.active || this.disposed || !this.entries.some((entry) => entry.path === path)) return;
		this.selectedPath = path;
		this.renderList();
		await this.loadSelected(this.taskId, path, ++this.request);
	}

	private async loadSelected(taskId: string, path: string | undefined, request: number): Promise<void> {
		if (!path) {
			this.detailText.content = "No artifacts";
			return;
		}
		const entry = this.entries.find((item) => item.path === path);
		if (!entry) {
			this.detailText.content = "No artifacts";
			return;
		}
		try {
			const bytes = await this.options.api.read(taskId, path);
			if (request !== this.request || taskId !== this.taskId || path !== this.selectedPath) return;
			const text = entry.type === "text" ? this.decodeText(bytes) : undefined;
			const type = text === undefined ? "binary" : "text/Markdown";
			this.detailText.content =
				text === undefined
					? `${path}\n${type} · ${bytes.byteLength} bytes\n\nBinary content is not decoded.`
					: `${path}\n${type} · ${bytes.byteLength} bytes\n\n${text}`;
			this.renderList();
		} catch (error) {
			if (request === this.request && taskId === this.taskId && path === this.selectedPath) this.showError(error);
		}
	}

	private subscribeToTask(): void {
		if (this.disposed || !this.active || this.unsubscribeArtifactChanges || !this.options.api.subscribeArtifactChanges)
			return;
		const taskId = this.taskId;
		this.unsubscribeArtifactChanges = this.options.api.subscribeArtifactChanges(taskId, () => {
			if (this.disposed || !this.active || this.taskId !== taskId) return;
			void this.refresh();
		});
	}

	private renderList(): void {
		this.listText.content =
			this.entries
				.map((entry) => {
					const selected = entry.path === this.selectedPath ? "> " : "  ";
					return `${selected}${entry.path}`;
				})
				.join("\n") || "No artifacts";
	}

	private decodeText(bytes: Uint8Array): string | undefined {
		if (bytes.includes(0)) return undefined;
		try {
			return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		} catch {
			return undefined;
		}
	}

	private showError(error: unknown): void {
		const message = error instanceof Error ? error.message : String(error);
		this.detailText.content = `Artifact error\n\n${message}`;
		this.options.onError?.(message);
	}
}
