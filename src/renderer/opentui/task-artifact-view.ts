import { BoxRenderable, type CliRenderer, TextAttributes, TextRenderable } from "@opentui/core";
import type { ArtifactStatus } from "../../model/session/types.ts";
import type { TaskArtifactEntry } from "../../storage/task-artifact-repository.ts";

export interface TaskArtifactViewApi {
	list(taskId: string): Promise<TaskArtifactEntry[]>;
	read(taskId: string, path: string): Promise<{ bytes: Uint8Array; status: ArtifactStatus }>;
	approveCurrentVersion(taskId: string, path: string, reviewedHash: string): Promise<ArtifactStatus>;
	revokeApproval(taskId: string, path: string): Promise<ArtifactStatus>;
	subscribeArtifactChanges?(taskId: string, callback: () => void): () => void;
}

export interface TaskArtifactViewOptions {
	renderer: CliRenderer;
	parent: BoxRenderable;
	taskId: string;
	api: TaskArtifactViewApi;
	declaredPaths?: readonly string[];
	onError?: (message: string) => void;
}

/** Render artifact state and a read-only review. Async results are bound to task + selected path. */
export class TaskArtifactView {
	readonly root: BoxRenderable;
	private readonly listText: TextRenderable;
	private readonly detailText: TextRenderable;
	private readonly footer: TextRenderable;
	private readonly options: TaskArtifactViewOptions;
	private taskId: string;
	private declaredPaths: readonly string[];
	private entries: TaskArtifactEntry[] = [];
	private selectedPath?: string;
	private reviewedHash?: string;
	private request = 0;
	private readonly labels = new Map<string, { type: "text" | "binary"; size: number }>();
	private unsubscribeArtifactChanges?: () => void;
	private active = true;
	private disposed = false;

	constructor(options: TaskArtifactViewOptions) {
		this.options = options;
		this.taskId = options.taskId;
		this.declaredPaths = options.declaredPaths ?? [];
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
			content:
				"Artifact review · Approve current version · Revoke approval · use named actions; Enter/Tab remain available to workspace",
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
	async setTask(taskId: string, declaredPaths: readonly string[] = []): Promise<void> {
		const taskChanged = taskId !== this.taskId;
		this.declaredPaths = declaredPaths;
		if (!taskChanged) return this.refresh();
		this.unsubscribeArtifactChanges?.();
		this.unsubscribeArtifactChanges = undefined;
		this.taskId = taskId;
		this.selectedPath = undefined;
		this.reviewedHash = undefined;
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
			const entries = await this.options.api.list(taskId);
			if (request !== this.request || taskId !== this.taskId || path !== this.selectedPath || !this.active) return;
			const byPath = new Map(entries.map((entry) => [entry.path, entry]));
			for (const path of this.declaredPaths) {
				if (!byPath.has(path)) byPath.set(path, { path, state: "missing", size: 0, type: "text" });
			}
			this.entries = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
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
			const entries = await this.options.api.list(taskId);
			if (request !== this.request || taskId !== this.taskId || path !== this.selectedPath || !this.active) return;
			const byPath = new Map(entries.map((entry) => [entry.path, entry]));
			for (const declaredPath of this.declaredPaths) {
				if (!byPath.has(declaredPath))
					byPath.set(declaredPath, { path: declaredPath, state: "missing", size: 0, type: "text" });
			}
			this.entries = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
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

	async select(path: string): Promise<void> {
		if (!this.active || this.disposed || !this.entries.some((entry) => entry.path === path)) return;
		this.selectedPath = path;
		this.reviewedHash = undefined;
		this.renderList();
		await this.loadSelected(this.taskId, path, ++this.request);
	}

	/** User-facing named action; only approves the exact text bytes currently displayed. */
	async approveCurrentVersion(): Promise<void> {
		const taskId = this.taskId;
		const path = this.selectedPath;
		const reviewedHash = this.reviewedHash;
		if (!path || !reviewedHash) return;
		const request = ++this.request;
		try {
			await this.options.api.approveCurrentVersion(taskId, path, reviewedHash);
			if (request !== this.request || taskId !== this.taskId || path !== this.selectedPath) return;
			await this.refresh();
		} catch (error) {
			if (request !== this.request || taskId !== this.taskId || path !== this.selectedPath) return;
			const message = error instanceof Error ? error.message : String(error);
			if (message.toLowerCase().includes("changed since it was reviewed")) {
				this.footer.content =
					"Artifact changed since review; refreshed current version. Approve current version · Revoke approval";
				await this.refresh();
				return;
			}
			this.showError(error);
		}
	}

	/** User-facing named action that revokes approval without editing artifact bytes. */
	async revokeApproval(): Promise<void> {
		const taskId = this.taskId;
		const path = this.selectedPath;
		if (!path) return;
		const request = ++this.request;
		try {
			await this.options.api.revokeApproval(taskId, path);
			if (request === this.request && taskId === this.taskId && path === this.selectedPath) await this.refresh();
		} catch (error) {
			if (request === this.request && taskId === this.taskId && path === this.selectedPath) this.showError(error);
		}
	}

	private async loadSelected(taskId: string, path: string | undefined, request: number): Promise<void> {
		this.reviewedHash = undefined;
		if (!path) {
			this.detailText.content = "No artifacts";
			return;
		}
		const entry = this.entries.find((item) => item.path === path);
		if (!entry || entry.state === "missing") {
			this.reviewedHash = undefined;
			this.detailText.content = `${path}\n\nMissing · declared artifact has not been created`;
			return;
		}
		try {
			const result = await this.options.api.read(taskId, path);
			if (request !== this.request || taskId !== this.taskId || path !== this.selectedPath) return;
			const text = entry.type === "text" ? this.decodeText(result.bytes) : undefined;
			const type = text === undefined ? "binary" : "text/Markdown";
			this.labels.set(path, { type: text === undefined ? "binary" : "text", size: result.bytes.byteLength });
			// A review hash is valid only for bytes that were actually rendered above.
			this.reviewedHash = text === undefined ? undefined : result.status.sha256;
			this.detailText.content =
				text === undefined
					? `${path}\n${type} · ${result.bytes.byteLength} bytes\n\nBinary content is not decoded for review.`
					: `${path}\n${this.statusLabel(result.status)} · ${type} · ${result.bytes.byteLength} bytes\n\n${text}`;
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
					const meta = entry.state === "missing" ? "Missing" : entry.state === "approved" ? "Approved" : "Draft";
					return `${selected}${entry.path} · ${meta}`;
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

	private statusLabel(status: ArtifactStatus): string {
		return status.state === "approved" ? "Approved" : status.state === "missing" ? "Missing" : "Draft";
	}

	private showError(error: unknown): void {
		const message = error instanceof Error ? error.message : String(error);
		this.detailText.content = `Artifact review error\n\n${message}`;
		this.options.onError?.(message);
	}
}
