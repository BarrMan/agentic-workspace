import { afterEach, describe, expect, test } from "bun:test";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { TaskArtifactEntry } from "../../storage/task-artifact-repository.ts";
import { TaskArtifactView, type TaskArtifactViewApi } from "./task-artifact-view.ts";

const bytes = (value: string) => new TextEncoder().encode(value);

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

describe("task artifact view", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	async function mount(api: TaskArtifactViewApi, taskId = "BACK-1") {
		const setup = await createTestRenderer({ width: 100, height: 32, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const view = new TaskArtifactView({ renderer: setup.renderer, parent, api, taskId });
		await setup.flush();
		return { setup, view };
	}

	function api(entries: TaskArtifactEntry[], contents: Record<string, Uint8Array>): TaskArtifactViewApi {
		return {
			list: async () => entries,
			read: async (_taskId, path) => contents[path]!,
			write: async () => {},
		};
	}

	test("lists and displays arbitrary generic files without approval indicators or phantom entries", async () => {
		const { setup, view } = await mount(
			api(
				[
					{ path: "custom/anything.md", size: 8, type: "text" },
					{ path: "image.bin", size: 3, type: "binary" },
				],
				{ "custom/anything.md": bytes("arbitrary"), "image.bin": new Uint8Array([0xff, 0xfe, 0]) },
			),
		);
		await view.refresh();
		const frame = setup.captureCharFrame();
		expect(frame).toContain("custom/anything.md");
		expect(frame).toContain("arbitrary");
		expect(frame).not.toContain("Approved");
		expect(frame).not.toContain("Draft");
		expect(frame).not.toContain("Missing");
		await view.select("image.bin");
		await setup.flush();
		expect(setup.captureCharFrame()).toContain("Binary content is not decoded");
		expect(setup.captureCharFrame()).toContain("3 bytes");
	});

	test("navigates actual files and discards late results from previous task or selection", async () => {
		const lateList = deferred<TaskArtifactEntry[]>();
		const lateRead = deferred<Uint8Array>();
		const entries: TaskArtifactEntry[] = [
			{ path: "one.md", size: 3, type: "text" },
			{ path: "two.md", size: 3, type: "text" },
		];
		const testApi: TaskArtifactViewApi = {
			list: async (taskId) => (taskId === "BACK-2" ? lateList.promise : entries),
			read: async (taskId, path) =>
				taskId === "BACK-1" && path === "one.md" ? lateRead.promise : bytes(`${taskId} ${path}`),
			write: async () => {},
		};
		const { setup, view } = await mount(testApi);
		const pending = view.select("one.md");
		await view.select("two.md");
		lateRead.resolve(bytes("stale selection"));
		await pending;
		const taskChange = view.setTask("BACK-2");
		await view.setTask("BACK-3");
		lateList.resolve([{ path: "stale.md", size: 5, type: "text" }]);
		await taskChange;
		await setup.flush();
		expect(view.selected).toBe("one.md");
		expect(setup.captureCharFrame()).toContain("BACK-3 one.md");
		expect(setup.captureCharFrame()).not.toContain("stale selection");
		expect(setup.captureCharFrame()).not.toContain("stale.md");
	});

	test("navigation list failure leaves selection unchanged and reports an error", async () => {
		let lists = 0;
		const testApi: TaskArtifactViewApi = {
			list: async () => {
				if (++lists > 1) throw new Error("list failed");
				return [
					{ path: "one.md", size: 3, type: "text" },
					{ path: "two.md", size: 3, type: "text" },
				];
			},
			read: async (_taskId, path) => bytes(path),
			write: async () => {},
		};
		const { setup, view } = await mount(testApi);
		const selected = view.selected;
		await view.navigate(1);
		await setup.flush();
		expect(view.selected).toBe(selected);
		expect(setup.captureCharFrame()).toContain("list failed");
	});

	test("disposal during pending navigation neither throws nor changes selection", async () => {
		const late = deferred<TaskArtifactEntry[]>();
		let lists = 0;
		const testApi: TaskArtifactViewApi = {
			list: async () => (++lists > 1 ? late.promise : [{ path: "one.md", size: 3, type: "text" }]),
			read: async (_taskId, path) => bytes(path),
			write: async () => {},
		};
		const { view } = await mount(testApi);
		const selected = view.selected;
		const pending = view.navigate(1);
		view.dispose();
		late.resolve([{ path: "late.md", size: 4, type: "text" }]);
		await expect(pending).resolves.toBeUndefined();
		expect(view.selected).toBe(selected);
	});
});
