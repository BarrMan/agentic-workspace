import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as opentui from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { createOpenTuiHost } from "../renderer/opentui/host.ts";

describe("OpenTUI host cleanup", () => {
	let setup: TestRendererSetup | undefined;
	const restore: Array<() => void> = [];

	afterEach(() => {
		for (const cleanup of restore.splice(0).reverse()) cleanup();
		setup?.renderer.destroy();
		setup = undefined;
	});

	async function rendererFixture() {
		setup = await createTestRenderer({ width: 80, height: 24 });
		const create = spyOn(opentui, "createCliRenderer").mockResolvedValue(setup.renderer);
		const destroy = spyOn(setup.renderer, "destroy");
		restore.push(
			() => create.mockRestore(),
			() => destroy.mockRestore(),
		);
		return { renderer: setup.renderer, destroy };
	}

	test("destroys the renderer when root construction fails", async () => {
		const { destroy } = await rendererFixture();
		const failure = new Error("root construction failed");
		// Bun can spy on constructors, but its mock types only accept call signatures.
		const constructors = opentui as unknown as {
			BoxRenderable: (...args: ConstructorParameters<typeof opentui.BoxRenderable>) => opentui.BoxRenderable;
		};
		const construct = spyOn(constructors, "BoxRenderable").mockImplementation(() => {
			throw failure;
		});
		restore.push(() => construct.mockRestore());

		await expect(createOpenTuiHost()).rejects.toBe(failure);
		expect(destroy).toHaveBeenCalledTimes(1);
	});

	test("destroys the renderer when attaching the root and disposing it both fail", async () => {
		const { renderer, destroy } = await rendererFixture();
		const failure = new Error("root attachment failed");
		const add = spyOn(renderer.root, "add").mockImplementation(() => {
			throw failure;
		});
		const dispose = spyOn(opentui.BoxRenderable.prototype, "destroyRecursively").mockImplementation(() => {
			dispose.mockRestore();
			throw new Error("root disposal failed");
		});
		restore.push(
			() => add.mockRestore(),
			() => dispose.mockRestore(),
		);

		await expect(createOpenTuiHost()).rejects.toBe(failure);
		expect(destroy).toHaveBeenCalledTimes(1);
	});

	test("destroys the renderer even when retained-root disposal fails", async () => {
		const { destroy } = await rendererFixture();
		const host = await createOpenTuiHost();
		const failure = new Error("root disposal failed");
		const dispose = spyOn(host.root, "destroyRecursively").mockImplementation(() => {
			dispose.mockRestore();
			throw failure;
		});
		restore.push(() => dispose.mockRestore());

		expect(() => host.destroy()).toThrow(failure);
		expect(destroy).toHaveBeenCalledTimes(1);
		host.destroy();
		expect(destroy).toHaveBeenCalledTimes(1);
	});

	test("renderer-driven teardown does not re-enter host destruction", async () => {
		const { renderer, destroy } = await rendererFixture();
		const host = await createOpenTuiHost();
		renderer.once("destroy", () => host.destroy());

		renderer.destroy();
		host.destroy();
		expect(destroy).toHaveBeenCalledTimes(1);
	});
});
