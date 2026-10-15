import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import "./agents.ts";
import { piExtensionSource } from "./pi.ts";

async function extensionFixture() {
	const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-pi-readiness-"));
	const modulePath = join(directory, "extension.mjs");
	await Bun.write(modulePath, piExtensionSource(join(directory, "activity"), directory));
	const extension = await import(`${pathToFileURL(modulePath).href}?${Date.now()}`);
	const handlers = new Map<string, (event: unknown, context: unknown) => void>();
	extension.default({
		on: (name: string, handler: (event: unknown, context: unknown) => void) => handlers.set(name, handler),
	});
	const context = (id: string) => ({ sessionManager: { getSessionId: () => id } });
	return {
		directory,
		handlers,
		context,
		fire(name: string, event: unknown, ctx: unknown) {
			handlers.get(name)?.(event, ctx);
		},
		cleanup: () => rm(directory, { recursive: true, force: true }),
	};
}

describe("Pi launch readiness emitter", () => {
	it("does not allow a prompt event to stand in for session initialization", async () => {
		const fixture = await extensionFixture();
		try {
			fixture.fire("before_agent_start", { prompt: "bootstrap" }, fixture.context("observed-session"));
			expect(await Bun.file(join(fixture.directory, "prompt-accepted")).text()).toBe("observed-session");
			expect(await Bun.file(join(fixture.directory, "initialized")).exists()).toBe(false);
		} finally {
			await fixture.cleanup();
		}
	});

	it("records provider-observed metadata, never the configured identity", async () => {
		const fixture = await extensionFixture();
		try {
			fixture.fire("session_start", {}, fixture.context("actual-provider-id"));
			fixture.fire("before_agent_start", { prompt: "bootstrap" }, fixture.context("actual-provider-id"));
			expect(await readFile(join(fixture.directory, "initialized"), "utf8")).toBe("actual-provider-id");
			expect(await readFile(join(fixture.directory, "prompt-accepted"), "utf8")).toBe("actual-provider-id");
		} finally {
			await fixture.cleanup();
		}
	});

	it("accepts a resume session_start without a prompt or other lifecycle event", async () => {
		const fixture = await extensionFixture();
		try {
			for (const event of ["tool_call", "turn_end", "agent_end"])
				fixture.fire(event, {}, fixture.context("saved-native-id"));
			expect(await Bun.file(join(fixture.directory, "initialized")).exists()).toBe(false);
			fixture.fire("session_start", {}, fixture.context("saved-native-id"));
			expect(await readFile(join(fixture.directory, "initialized"), "utf8")).toBe("saved-native-id");
			expect(await Bun.file(join(fixture.directory, "prompt-accepted")).exists()).toBe(false);
		} finally {
			await fixture.cleanup();
		}
	});

	it("does not treat custom-message events as the bootstrap user prompt", async () => {
		const fixture = await extensionFixture();
		try {
			fixture.fire("session_start", {}, fixture.context("observed-session"));
			fixture.fire("custom_message", { content: "not a user prompt" }, fixture.context("observed-session"));
			expect(await Bun.file(join(fixture.directory, "prompt-accepted")).exists()).toBe(false);
			fixture.fire(
				"before_agent_start",
				{ customType: "custom", content: "not a user prompt" },
				fixture.context("observed-session"),
			);
			expect(await Bun.file(join(fixture.directory, "prompt-accepted")).exists()).toBe(false);
		} finally {
			await fixture.cleanup();
		}
	});
});
