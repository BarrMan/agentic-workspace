import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PiAgent, piExtensionSource } from "./pi.ts";

const id = "019342ab-1234-7def-8901-abcdef012345";
const source = "11111111-2222-4333-8444-555555555555";

async function fixture(header?: string) {
	const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-pi-capture-"));
	const target = join(directory, "session_id");
	const transcript = join(directory, `2026-10-20T00-00-00-000Z_${id}.jsonl`);
	if (header !== undefined) await writeFile(transcript, header);
	const oldTarget = process.env.AOE_SESSION_ID_FILE;
	const oldSource = process.env.AOE_SESSION_SOURCE;
	process.env.AOE_SESSION_ID_FILE = target;
	process.env.AOE_SESSION_SOURCE = source;
	const modulePath = join(directory, "extension.mjs");
	await writeFile(modulePath, piExtensionSource(join(directory, "status"), directory));
	const extension = await import(`${pathToFileURL(modulePath).href}?${Date.now()}`);
	const handlers = new Map<string, (event: unknown, context: any) => void>();
	extension.default({
		on: (name: string, handler: (event: unknown, context: any) => void) => handlers.set(name, handler),
	});
	return {
		directory,
		target,
		transcript,
		fire(sessionId = id) {
			handlers.get("session_start")?.(
				{},
				{ sessionManager: { getSessionId: () => sessionId, getSessionFile: () => transcript } },
			);
		},
		async cleanup() {
			if (oldTarget === undefined) delete process.env.AOE_SESSION_ID_FILE;
			else process.env.AOE_SESSION_ID_FILE = oldTarget;
			if (oldSource === undefined) delete process.env.AOE_SESSION_SOURCE;
			else process.env.AOE_SESSION_SOURCE = oldSource;
			await rm(directory, { recursive: true, force: true });
		},
	};
}

describe("Pi provider-owned identity capture", () => {
	it("launches, captures, and reattaches using the persisted native ID without capture env", async () => {
		const f = await fixture();
		try {
			const agent = new PiAgent();
			const launch = await agent.prepare({
				preset: { command: ["pi"], env: {}, prepare: "", bootstrap: "pi" } as any,
				cwd: "/tmp",
				bootstrapPath: "/tmp/bootstrap.md",
				directory: f.directory,
				skillRoot: join(f.directory, "skills"),
				skillPath: join(f.directory, "skills", "SKILL.md"),
				env: { AOE_SESSION_ID_FILE: f.target, AOE_SESSION_SOURCE: source },
				profile: {} as any,
				intent: { kind: "new" },
			});
			await writeFile(f.transcript, `{"type":"session","id":"${launch.identity?.id}","cwd":"/tmp"}\n`);
			const launchId = launch.identity?.id;
			if (!launchId) throw new Error("Pi launch did not establish its session identity.");
			f.fire(launchId);
			launch.env.AOE_SESSION_ID_FILE = f.target;
			launch.env.AOE_SESSION_SOURCE = source;
			const persisted = await agent.reconcileIdentity({
				intent: { kind: "new" },
				preset: {} as any,
				cwd: "/tmp",
				env: launch.env,
				launchDirectory: f.directory,
				preparedIdentity: launch.identity,
				signal: new AbortController().signal,
			});
			expect(persisted).toEqual({ id: launchId, basis: "provider-confirmed" });

			const observeEnvironment = {};
			const reattachCommand = agent.resumeCommand({
				preset: { command: ["pi"] } as any,
				nativeSessionId: persisted.id,
			});
			expect(reattachCommand).toContain(`'--session' '${persisted.id}'`);
			expect(observeEnvironment).not.toHaveProperty("AOE_SESSION_ID_FILE");
			expect(observeEnvironment).not.toHaveProperty("AOE_SESSION_SOURCE");
			await expect(
				agent.reconcileIdentity({
					intent: { kind: "resume", nativeSessionId: source },
					preset: {} as any,
					cwd: "/tmp",
					env: launch.env,
					launchDirectory: f.directory,
					preparedIdentity: launch.identity,
					signal: new AbortController().signal,
				}),
			).rejects.toThrow("different from the requested resume ID");
		} finally {
			await f.cleanup();
		}
	});

	it("requires a capture source when a fresh identity has not been established", async () => {
		const agent = new PiAgent();
		await expect(
			agent.reconcileIdentity({
				intent: { kind: "new" },
				preset: {} as any,
				cwd: "/tmp",
				env: {},
				launchDirectory: "/tmp",
				signal: new AbortController().signal,
			}),
		).rejects.toThrow("Pi session capture requires AOE_SESSION_ID_FILE");
		await expect(
			agent.reconcileIdentity({
				intent: { kind: "new" },
				preset: {} as any,
				cwd: "/tmp",
				env: { AOE_SESSION_ID_FILE: join(tmpdir(), "session_id") },
				launchDirectory: "/tmp",
				signal: new AbortController().signal,
			}),
		).rejects.toThrow("Pi session capture requires AOE_SESSION_SOURCE");
		await expect(
			agent.reconcileIdentity({
				intent: { kind: "new" },
				preset: {} as any,
				cwd: "/tmp",
				env: { AOE_SESSION_ID_FILE: join(tmpdir(), "session_id"), AOE_SESSION_SOURCE: "invalid" },
				launchDirectory: "/tmp",
				signal: new AbortController().signal,
			}),
		).rejects.toThrow("Pi session capture received an invalid AOE_SESSION_SOURCE");
	});

	it("publishes the session_start ID and transcript and validates the real JSONL header", async () => {
		const f = await fixture(`{"type":"session","id":"${id}","cwd":"/tmp"}\n`);
		try {
			f.fire();
			const agent = new PiAgent();
			const identity = await agent.reconcileIdentity({
				intent: { kind: "new" },
				preset: {} as any,
				cwd: "/tmp",
				env: { AOE_SESSION_ID_FILE: f.target, AOE_SESSION_SOURCE: source },
				launchDirectory: f.directory,
				preparedIdentity: { id, basis: "client-established" },
				signal: new AbortController().signal,
			});
			expect(identity).toEqual({ id, basis: "provider-confirmed" });
			expect(await readFile(join(f.directory, `session_path.${source}`), "utf8")).toBe(`${f.transcript}\n`);
			await expect(readFile(f.transcript, "utf8")).resolves.toContain(id);
		} finally {
			await f.cleanup();
		}
	});

	it("rejects malformed, mismatched, and invalidly absent transcripts", async () => {
		for (const [header, filenameId] of [
			["not json\n", id],
			[`{"type":"session","id":"${source}"}\n`, id],
			[undefined, source],
		] as const) {
			const f = await fixture(header);
			try {
				f.fire();
				const agent = new PiAgent();
				const call = agent.reconcileIdentity({
					intent: { kind: "new" },
					preset: {} as any,
					cwd: "/tmp",
					env: { AOE_SESSION_ID_FILE: f.target, AOE_SESSION_SOURCE: source },
					launchDirectory: f.directory,
					preparedIdentity: { id: filenameId, basis: "client-established" },
					signal: new AbortController().signal,
				});
				await expect(call).rejects.toThrow();
			} finally {
				await f.cleanup();
			}
		}
	});

	it("resumes by session ID, not transcript path, and never removes provider transcripts", async () => {
		const f = await fixture(`{"type":"session","id":"${id}"}\n`);
		try {
			f.fire();
			const agent = new PiAgent();
			expect(
				agent.launchCommand({
					preset: { command: ["pi"] } as any,
					bootstrapPath: "/tmp/bootstrap",
					nativeSessionId: id,
				}),
			).toContain(`--session-id '${id}'`);
			const command = agent.resumeCommand({ preset: { command: ["pi"] } as any, nativeSessionId: id });
			expect(command).toContain(`'--session' '${id}'`);
			expect(command).not.toContain(f.transcript);
			await agent.reconcileIdentity({
				intent: { kind: "resume", nativeSessionId: id },
				preset: {} as any,
				cwd: "/tmp",
				env: { AOE_SESSION_ID_FILE: f.target, AOE_SESSION_SOURCE: source },
				launchDirectory: f.directory,
				signal: new AbortController().signal,
			});
			expect(await readFile(f.transcript, "utf8")).toContain(id);
		} finally {
			await f.cleanup();
		}
	});
});
