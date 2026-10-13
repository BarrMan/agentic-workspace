import { afterEach, describe, expect, it } from "bun:test";
import { createSessionServer } from "../agent-workspace/session-process.ts";

describe("createSessionServer socket isolation", () => {
	const original = process.env.BACKLOG_TMUX_SOCKET;

	afterEach(() => {
		if (original === undefined) delete process.env.BACKLOG_TMUX_SOCKET;
		else process.env.BACKLOG_TMUX_SOCKET = original;
	});

	it("defaults to the developer's default socket when no override is set", () => {
		delete process.env.BACKLOG_TMUX_SOCKET;
		expect(createSessionServer().socketName).toBe("default");
	});

	it("honours BACKLOG_TMUX_SOCKET so tests never address the default socket", () => {
		process.env.BACKLOG_TMUX_SOCKET = "backlog-test-guard-1234abcd";
		expect(createSessionServer().socketName).toBe("backlog-test-guard-1234abcd");
	});
});
