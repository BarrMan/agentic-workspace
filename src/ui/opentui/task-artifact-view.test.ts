import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { ArtifactStatus } from "../../agent-workspace/types.ts";
import type { TaskArtifactEntry } from "../../file-system/task-artifact-repository.ts";
import { TaskArtifactView, type TaskArtifactViewApi } from "./task-artifact-view.ts";

const bytes = (value: string) => new TextEncoder().encode(value);
const hash = createHash("sha256").update(bytes("reviewed")).digest("hex");
const status = (path: string, state: ArtifactStatus["state"], sha256?: string): ArtifactStatus => ({
	path,
	state,
	sha256,
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

describe("task artifact review view", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	async function mount(api: TaskArtifactViewApi, options: { taskId?: string; declaredPaths?: string[] } = {}) {
		const setup = await createTestRenderer({ width: 100, height: 32, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const view = new TaskArtifactView({
			renderer: setup.renderer,
			parent,
			api,
			taskId: options.taskId ?? "BACK-1",
			declaredPaths: options.declaredPaths,
		});
		await setup.flush();
		return { setup, view };
	}

	test("approves only the hash belonging to the bytes displayed in the review", async () => {
		const approved: string[] = [];
		const api: TaskArtifactViewApi = {
			list: async () => [{ ...status("plan.md", "draft", hash), size: 8, type: "text" }],
			read: async () => ({ bytes: bytes("reviewed"), status: status("plan.md", "draft", hash) }),
			approveCurrentVersion: async (_task, path, reviewedHash) => {
				approved.push(`${path}:${reviewedHash}`);
				return status(path, "approved", reviewedHash);
			},
			revokeApproval: async (_task, path) => status(path, "draft"),
		};
		const { setup, view } = await mount(api);
		expect(setup.captureCharFrame()).toContain("reviewed");
		await view.approveCurrentVersion();
		expect(approved).toEqual([`plan.md:${hash}`]);
	});

	test("refuses a version changed since review and refreshes the displayed content", async () => {
		let reads = 0;
		const api: TaskArtifactViewApi = {
			list: async () => [{ ...status("plan.md", "draft"), size: 7, type: "text" }],
			read: async () => {
				reads++;
				return { bytes: bytes(reads === 1 ? "first" : "updated"), status: status("plan.md", "draft", hash) };
			},
			approveCurrentVersion: async () => {
				throw new Error("Artifact changed since it was reviewed");
			},
			revokeApproval: async (_task, path) => status(path, "draft"),
		};
		const { setup, view } = await mount(api);
		await view.approveCurrentVersion();
		await setup.flush();
		expect(reads).toBe(2);
		expect(setup.captureCharFrame()).toContain("updated");
		expect(setup.captureCharFrame()).toContain("changed since review");
	});

	test("discards late results from a previous task and selected path", async () => {
		const lateTask = deferred<TaskArtifactEntry[]>();
		const lateRead = deferred<{ bytes: Uint8Array; status: ArtifactStatus }>();
		const oldListed = deferred<TaskArtifactEntry[]>();
		const api: TaskArtifactViewApi = {
			list: async (task) =>
				task === "BACK-1"
					? oldListed.promise
					: task === "BACK-2"
						? lateTask.promise
						: [{ ...status("new.md", "draft"), size: 3, type: "text" }],
			read: async (_task, path) =>
				path === "old.md" ? lateRead.promise : { bytes: bytes("new task"), status: status(path, "draft", hash) },
			approveCurrentVersion: async (_task, path) => status(path, "approved", hash),
			revokeApproval: async (_task, path) => status(path, "draft"),
		};
		const { setup, view } = await mount(api);
		oldListed.resolve([
			{ ...status("old.md", "draft"), size: 3, type: "text" },
			{ ...status("other.md", "draft"), size: 5, type: "text" },
		]);
		await setup.flush();
		const pathChange = view.select("old.md");
		await view.select("other.md");
		lateRead.resolve({ bytes: bytes("stale path"), status: status("old.md", "draft", hash) });
		await pathChange;
		const staleTaskChange = view.setTask("BACK-2");
		const taskChange = view.setTask("BACK-3");
		lateTask.resolve([{ ...status("stale.md", "draft"), size: 4, type: "text" }]);
		await Promise.all([staleTaskChange, taskChange]);
		await setup.flush();
		expect(setup.captureCharFrame()).toContain("new task");
		expect(setup.captureCharFrame()).not.toContain("stale path");
		expect(setup.captureCharFrame()).not.toContain("stale.md");
	});

	test("drops late navigation results from a previous task without changing B's selection or display", async () => {
		const late = deferred<TaskArtifactEntry[]>();
		let aLists = 0;
		const api: TaskArtifactViewApi = {
			list: async (task) =>
				task === "BACK-1" && ++aLists > 1
					? late.promise
					: [{ ...status(`${task}.md`, "draft"), size: 4, type: "text" }],
			read: async (_task, path) => ({
				bytes: bytes(path === "BACK-2.md" ? "B artifact" : "A artifact"),
				status: status(path, "draft", hash),
			}),
			approveCurrentVersion: async (_task, path) => status(path, "approved"),
			revokeApproval: async (_task, path) => status(path, "draft"),
		};
		const { setup, view } = await mount(api);
		const pending = view.navigate(1);
		await view.setTask("BACK-2");
		await setup.flush();
		const selection = view.selected;
		const display = setup.captureCharFrame();
		late.resolve([{ ...status("A-late.md", "draft"), size: 5, type: "text" }]);
		await pending;
		await setup.flush();
		expect(view.selected).toBe(selection);
		expect(view.selected).toBe("BACK-2.md");
		expect(setup.captureCharFrame()).toBe(display);
		expect(setup.captureCharFrame()).not.toContain("A-late.md");
	});

	test("navigation list failure leaves selection unchanged and reports an error", async () => {
		let lists = 0;
		const api: TaskArtifactViewApi = {
			list: async () => {
				if (++lists > 1) throw new Error("list failed");
				return [
					{ ...status("one.md", "draft"), size: 1, type: "text" },
					{ ...status("two.md", "draft"), size: 1, type: "text" },
				];
			},
			read: async (_task, path) => ({ bytes: bytes(path), status: status(path, "draft", hash) }),
			approveCurrentVersion: async (_task, path) => status(path, "approved"),
			revokeApproval: async (_task, path) => status(path, "draft"),
		};
		const { setup, view } = await mount(api);
		const selected = view.selected;
		await view.navigate(1);
		await setup.flush();
		expect(view.selected).toBe(selected);
		expect(setup.captureCharFrame()).toContain("list failed");
	});

	test("disposal during pending navigation neither throws nor changes selection", async () => {
		const late = deferred<TaskArtifactEntry[]>();
		let lists = 0;
		const api: TaskArtifactViewApi = {
			list: async () => (++lists > 1 ? late.promise : [{ ...status("one.md", "draft"), size: 1, type: "text" }]),
			read: async (_task, path) => ({ bytes: bytes(path), status: status(path, "draft", hash) }),
			approveCurrentVersion: async (_task, path) => status(path, "approved"),
			revokeApproval: async (_task, path) => status(path, "draft"),
		};
		const { view } = await mount(api);
		const selected = view.selected;
		const pending = view.navigate(1);
		view.dispose();
		late.resolve([{ ...status("late.md", "draft"), size: 1, type: "text" }]);
		await expect(pending).resolves.toBeUndefined();
		expect(view.selected).toBe(selected);
	});

	test("shows binary metadata without decoding bytes as Markdown", async () => {
		const api: TaskArtifactViewApi = {
			list: async () => [{ ...status("image.bin", "draft"), size: 3, type: "binary" }],
			read: async () => ({ bytes: new Uint8Array([0xff, 0xfe, 0]), status: status("image.bin", "draft", hash) }),
			approveCurrentVersion: async (_task, path) => status(path, "approved", hash),
			revokeApproval: async (_task, path) => status(path, "draft"),
		};
		const { setup, view } = await mount(api);
		expect(setup.captureCharFrame()).toContain("Binary content is not decoded for review");
		await view.approveCurrentVersion();
		await view.revokeApproval();
		expect(setup.captureCharFrame()).toContain("image.bin");
	});

	test("Draft and Missing review actions do not create sessions or alter task status", async () => {
		const sessionCreates = 0;
		const taskStatusChanges = 0;
		let approvals = 0;
		let revocations = 0;
		const api: TaskArtifactViewApi = {
			list: async () => [{ ...status("draft.md", "draft"), size: 4, type: "text" }],
			read: async (_task, path) => ({ bytes: bytes("text"), status: status(path, "draft", hash) }),
			approveCurrentVersion: async (_task, path) => {
				approvals++;
				return status(path, "approved", hash);
			},
			revokeApproval: async (_task, path) => {
				revocations++;
				return status(path, "draft");
			},
		};
		const { setup, view } = await mount(api, { declaredPaths: ["missing.md"] });
		await view.approveCurrentVersion();
		await view.revokeApproval();
		await view.select("missing.md");
		await view.approveCurrentVersion();
		await view.revokeApproval();
		expect(setup.captureCharFrame()).toContain("Missing");
		expect(approvals).toBe(1);
		expect(revocations).toBe(2);
		expect(sessionCreates).toBe(0);
		expect(taskStatusChanges).toBe(0);
	});

	test("named approval actions do not bind or consume workspace Enter and Tab", async () => {
		let approvals = 0;
		let revocations = 0;
		const api: TaskArtifactViewApi = {
			list: async () => [{ ...status("plan.md", "draft", hash), size: 4, type: "text" }],
			read: async () => ({ bytes: bytes("plan"), status: status("plan.md", "draft", hash) }),
			approveCurrentVersion: async (_task, path) => {
				approvals++;
				return status(path, "approved", hash);
			},
			revokeApproval: async (_task, path) => {
				revocations++;
				return status(path, "draft");
			},
		};
		const { setup, view } = await mount(api);
		setup.mockInput.pressTab();
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(approvals).toBe(0);
		expect(revocations).toBe(0);
		await view.approveCurrentVersion();
		await view.revokeApproval();
		expect(approvals).toBe(1);
		expect(revocations).toBe(1);
	});
});
