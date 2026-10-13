/**
 * Unit guard for the session-scoped ownership primitives.
 *
 * The shared default server is what makes this module dangerous: a `kill-server` here would destroy
 * every unrelated session on the developer's machine. These tests drive a scripted `TmuxRunner` so
 * the exact argv is observable, and the final case asserts that no argv any test produced ever
 * contained `kill-server` — the property the primitives exist to guarantee.
 */

import { describe, expect, it } from "bun:test";
import { assertOwnedSessionName, hasOwnedSession, killOwnedSession, type TmuxRunner } from "./session-control.ts";
import type { TmuxResult } from "./types.ts";

const NAME = "backlog-back-8-deadbeef";

const result = (overrides: Partial<TmuxResult> = {}): TmuxResult => ({
	exitCode: 0,
	stdout: "",
	stderr: "",
	durationMs: 0,
	...overrides,
});

/** Every argv any scripted runner in this file observed; asserted at the end to never contain kill-server. */
const allArgv: string[][] = [];

/** A runner that answers each call with the next scripted result and records every argv it sees. */
function scriptedRunner(results: TmuxResult[]) {
	let index = 0;
	const calls: string[][] = [];
	const run: TmuxRunner = async (argv) => {
		calls.push([...argv]);
		allArgv.push([...argv]);
		const next = results[index++];
		if (!next) throw new Error(`unscripted tmux call: ${argv.join(" ")}`);
		return next;
	};
	return { run, calls };
}

/** A runner that must never be reached; a call is recorded so a zero-argv assertion can report it. */
function forbiddenRunner() {
	const calls: string[][] = [];
	const run: TmuxRunner = async (argv) => {
		calls.push([...argv]);
		allArgv.push([...argv]);
		throw new Error(`runner must not be called: ${argv.join(" ")}`);
	};
	return { run, calls };
}

describe("session-control refuses foreign names before any tmux command", () => {
	for (const name of ["default", "ink-proto-1-1"]) {
		it(`assertOwnedSessionName rejects ${JSON.stringify(name)}`, () => {
			expect(() => assertOwnedSessionName(name)).toThrow(/refusing to address tmux session/);
		});

		it(`hasOwnedSession rejects ${JSON.stringify(name)} without issuing argv`, async () => {
			const { run, calls } = forbiddenRunner();
			await expect(hasOwnedSession(name, run)).rejects.toThrow(/refusing to address tmux session/);
			expect(calls).toEqual([]);
		});

		it(`killOwnedSession rejects ${JSON.stringify(name)} without issuing argv`, async () => {
			const { run, calls } = forbiddenRunner();
			await expect(killOwnedSession(name, run)).rejects.toThrow(/refusing to address tmux session/);
			expect(calls).toEqual([]);
		});
	}
});

describe("hasOwnedSession", () => {
	it("reports a session present from a zero exit and probes only has-session", async () => {
		const { run, calls } = scriptedRunner([result({ exitCode: 0, stdout: `${NAME}: 1 windows (created now)` })]);
		await expect(hasOwnedSession(NAME, run)).resolves.toBe(true);
		expect(calls).toEqual([["has-session", "-t", NAME]]);
	});

	it("reports a session absent from a non-zero exit", async () => {
		const { run, calls } = scriptedRunner([result({ exitCode: 1, stderr: `can't find session: ${NAME}` })]);
		await expect(hasOwnedSession(NAME, run)).resolves.toBe(false);
		expect(calls).toEqual([["has-session", "-t", NAME]]);
	});
});

describe("killOwnedSession", () => {
	it("kills exactly the named session then proves absence with can't find session", async () => {
		const { run, calls } = scriptedRunner([
			result({ exitCode: 0 }),
			result({ exitCode: 1, stderr: `can't find session: ${NAME}` }),
		]);
		await expect(killOwnedSession(NAME, run)).resolves.toBeUndefined();
		expect(calls).toEqual([
			["kill-session", "-t", NAME],
			["has-session", "-t", NAME],
		]);
	});

	it("accepts no server running as proof of absence", async () => {
		const { run, calls } = scriptedRunner([
			result({ exitCode: 0 }),
			result({ exitCode: 1, stderr: "no server running on /tmp/tmux-501/backlog-test-host-deadbeef" }),
		]);
		await expect(killOwnedSession(NAME, run)).resolves.toBeUndefined();
		expect(calls).toEqual([
			["kill-session", "-t", NAME],
			["has-session", "-t", NAME],
		]);
	});

	it("throws still running when the probe exits zero after the kill", async () => {
		const { run, calls } = scriptedRunner([result({ exitCode: 0 }), result({ exitCode: 0 })]);
		await expect(killOwnedSession(NAME, run)).rejects.toThrow(/still running/);
		expect(calls).toEqual([
			["kill-session", "-t", NAME],
			["has-session", "-t", NAME],
		]);
	});

	it("throws could not prove when the probe is inconclusive", async () => {
		const { run, calls } = scriptedRunner([
			result({ exitCode: 0 }),
			result({ exitCode: 1, stderr: "permission denied" }),
		]);
		await expect(killOwnedSession(NAME, run)).rejects.toThrow(/could not prove/);
		expect(calls).toEqual([
			["kill-session", "-t", NAME],
			["has-session", "-t", NAME],
		]);
	});
});

describe("destructive scope", () => {
	it("never records kill-server in any argv observed across this file", () => {
		expect(allArgv.length).toBeGreaterThan(0);
		const offenders = allArgv.filter((argv) => argv.includes("kill-server"));
		expect(offenders).toEqual([]);
	});
});
