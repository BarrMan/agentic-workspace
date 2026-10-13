import { afterEach, describe, expect, it } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { createExistingAgentHost } from "../existing-agent-host.ts";
import { createTmuxExec } from "./exec.ts";
import { createHeartbeatCoalescer } from "./vt-channel.ts";

describe("tmux executor admission cancellation", () => {
	const directories: string[] = [];
	const env: Array<[string, string | undefined]> = [];
	afterEach(async () => {
		for (const [key, value] of env.splice(0)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
	});

	it("removes an aborted capture-slot waiter before the freed slot can spawn it", async () => {
		const directory = await mkdtemp(join(tmpdir(), "backlog-exec-admission-"));
		directories.push(directory);
		const logPath = join(directory, "calls.log");
		const releasePath = join(directory, "release");
		const shim = join(directory, "tmux");
		await writeFile(
			shim,
			`#!/bin/sh\nprintf '%s\\n' "$*" >> "$BACKLOG_EXEC_TEST_LOG"\nwhile [ ! -f "$BACKLOG_EXEC_TEST_RELEASE" ]; do /bin/sleep 0.01; done\n`,
		);
		await chmod(shim, 0o755);
		for (const key of ["PATH", "BACKLOG_EXEC_TEST_LOG", "BACKLOG_EXEC_TEST_RELEASE"]) env.push([key, process.env[key]]);
		process.env.PATH = `${directory}${delimiter}${process.env.PATH ?? ""}`;
		process.env.BACKLOG_EXEC_TEST_LOG = logPath;
		process.env.BACKLOG_EXEC_TEST_RELEASE = releasePath;
		const calls: string[] = [];
		const exec = createTmuxExec({
			socketName: "isolated-admission-test",
			timeoutMs: 20_000,
			onCommand: (argv) => calls.push(argv.join(" ")),
		});
		const active = Array.from({ length: 32 }, (_, index) => exec.run(["hold", String(index)]));
		try {
			const deadline = Date.now() + 5_000;
			while (Date.now() < deadline) {
				try {
					if ((await readFile(logPath, "utf8")).trim().split("\n").length === 32) break;
				} catch {}
				await Bun.sleep(10);
			}
			expect((await readFile(logPath, "utf8")).trim().split("\n")).toHaveLength(32);

			const queued = ["send-keys", "display-message", "resize-window"].map((command) => {
				const controller = new AbortController();
				const operation = exec.run([command, "must-not-spawn"], { signal: controller.signal });
				const outcome = operation.then(
					() => undefined,
					(error) => (error instanceof Error ? error.message : String(error)),
				);
				return { command, controller, outcome };
			});
			await Bun.sleep(10);
			for (const item of queued) item.controller.abort(new Error(`${item.command} disposed while queued`));
			for (const item of queued) expect(await item.outcome).toContain(`${item.command} disposed while queued`);
		} finally {
			await writeFile(releasePath, "release");
			await Promise.allSettled(active);
		}
		const spawned = (await readFile(logPath, "utf8")).trim().split("\n");
		expect(spawned).toHaveLength(32);
		expect(spawned.some((line) => line.includes("must-not-spawn"))).toBe(false);
		expect(calls).toHaveLength(32);
	});

	it("kills an already-dispatched command on abort and reports its outcome as uncertain without replay", async () => {
		const directory = await mkdtemp(join(tmpdir(), "backlog-exec-spawn-abort-"));
		directories.push(directory);
		const logPath = join(directory, "calls.log");
		const releasePath = join(directory, "release");
		const shim = join(directory, "tmux");
		await writeFile(
			shim,
			`#!/bin/sh\nprintf '%s\\n' "$*" >> "$BACKLOG_EXEC_TEST_LOG"\nwhile [ ! -f "$BACKLOG_EXEC_TEST_RELEASE" ]; do :; done\n`,
		);
		await chmod(shim, 0o755);
		for (const key of ["PATH", "BACKLOG_EXEC_TEST_LOG", "BACKLOG_EXEC_TEST_RELEASE"]) env.push([key, process.env[key]]);
		process.env.PATH = `${directory}${delimiter}${process.env.PATH ?? ""}`;
		process.env.BACKLOG_EXEC_TEST_LOG = logPath;
		process.env.BACKLOG_EXEC_TEST_RELEASE = releasePath;
		const controller = new AbortController();
		const exec = createTmuxExec({ socketName: "isolated-spawn-abort", timeoutMs: 20_000 });
		const operation = exec.run(["already-dispatched"], { signal: controller.signal });
		try {
			const deadline = Date.now() + 5_000;
			while (Date.now() < deadline) {
				try {
					if ((await readFile(logPath, "utf8")).includes("already-dispatched")) break;
				} catch {}
				await Bun.sleep(10);
			}
			expect((await readFile(logPath, "utf8")).trim().split("\n")).toHaveLength(1);
			controller.abort(new Error("cancel dispatched command"));
			const result = await operation;
			expect(result.stderr).toContain("command cancelled after dispatch; outcome is uncertain");
			expect((await readFile(logPath, "utf8")).trim().split("\n")).toHaveLength(1);
		} finally {
			controller.abort(new Error("ensure fake tmux child is stopped"));
			await writeFile(releasePath, "release");
			await operation.catch(() => undefined);
		}
	});

	it("waits for an already-dispatched input write before stopping the host", async () => {
		const directory = await mkdtemp(join(tmpdir(), "backlog-exec-input-drain-"));
		directories.push(directory);
		const outputPath = join(directory, "output.log");
		await writeFile(outputPath, "");
		let finishWrite!: () => void;
		let writeStarted!: () => void;
		const started = new Promise<void>((resolve) => (writeStarted = resolve));
		const exec = {
			run: async (argv: readonly string[]) => {
				if (argv[0] === "display-message") return { exitCode: 0, stdout: "0", stderr: "", durationMs: 0 };
				if (argv[0] === "capture-pane") return { exitCode: 0, stdout: "", stderr: "", durationMs: 0 };
				if (argv[0] === "send-keys") {
					writeStarted();
					await new Promise<void>((resolve) => (finishWrite = resolve));
				}
				return { exitCode: 0, stdout: "", stderr: "", durationMs: 0 };
			},
		};
		const host = createExistingAgentHost({ exec, paneId: "%1", outputPath, onOutput: () => {}, onError: () => {} });
		await host.start();
		host.sendBytes(new Uint8Array([0x61]));
		await started;
		const stopping = host.stop();
		finishWrite();
		await expect(stopping).resolves.toBeUndefined();
	});

	it("reports failure when an already-dispatched input write cannot finish within the shutdown bound", async () => {
		const directory = await mkdtemp(join(tmpdir(), "backlog-exec-input-stall-"));
		directories.push(directory);
		const outputPath = join(directory, "output.log");
		await writeFile(outputPath, "");
		let writeStarted!: () => void;
		const started = new Promise<void>((resolve) => (writeStarted = resolve));
		const exec = {
			run: async (argv: readonly string[]) => {
				if (argv[0] === "display-message") return { exitCode: 0, stdout: "0", stderr: "", durationMs: 0 };
				if (argv[0] === "send-keys") {
					writeStarted();
					return await new Promise<never>(() => {});
				}
				return { exitCode: 0, stdout: "", stderr: "", durationMs: 0 };
			},
		};
		const host = createExistingAgentHost({ exec, paneId: "%1", outputPath, onOutput: () => {}, onError: () => {} });
		await host.start();
		host.sendBytes(new Uint8Array([0x61]));
		await started;
		await expect(host.stop()).rejects.toThrow("Could not fully stop existing agent transport");
	});

	it("cancels queued production input, heartbeat, and resize before any freed slot can spawn them", async () => {
		const directory = await mkdtemp(join(tmpdir(), "backlog-exec-transport-cancel-"));
		directories.push(directory);
		const logPath = join(directory, "calls.log");
		const releasePath = join(directory, "release");
		const shim = join(directory, "tmux");
		const outputPath = join(directory, "output.log");
		await writeFile(outputPath, "");
		await writeFile(
			shim,
			`#!/bin/sh\nprintf '%s\\n' "$*" >> "$BACKLOG_EXEC_TEST_LOG"\ncase "$*" in *hold*) while [ ! -f "$BACKLOG_EXEC_TEST_RELEASE" ]; do /bin/sleep 0.01; done;; *display-message*) printf '0';; esac\n`,
		);
		await chmod(shim, 0o755);
		for (const key of ["PATH", "BACKLOG_EXEC_TEST_LOG", "BACKLOG_EXEC_TEST_RELEASE"]) env.push([key, process.env[key]]);
		process.env.PATH = `${directory}${delimiter}${process.env.PATH ?? ""}`;
		process.env.BACKLOG_EXEC_TEST_LOG = logPath;
		process.env.BACKLOG_EXEC_TEST_RELEASE = releasePath;
		const executed: string[] = [];
		const exec = createTmuxExec({
			socketName: "isolated-transport-cancel",
			timeoutMs: 20_000,
			onCommand: (argv) => executed.push(argv.join(" ")),
		});
		const host = createExistingAgentHost({
			exec,
			paneId: "%1",
			outputPath,
			onOutput: () => {},
			onError: () => {},
		});
		let active: Promise<unknown>[] = [];
		try {
			await host.start();
			active = Array.from({ length: 32 }, (_, index) => exec.run(["hold", String(index)]));
			const deadline = Date.now() + 5_000;
			while (Date.now() < deadline) {
				try {
					if (
						(await readFile(logPath, "utf8"))
							.trim()
							.split("\n")
							.filter((line) => line.includes(" hold ")).length === 32
					)
						break;
				} catch {}
				await Bun.sleep(10);
			}
			expect(
				(await readFile(logPath, "utf8"))
					.trim()
					.split("\n")
					.filter((line) => line.includes(" hold ")),
			).toHaveLength(32);
			const heartbeat = createHeartbeatCoalescer(async (signal) => {
				try {
					await exec.run(["display-message", "-p", "#{pane_dead} #{window_activity}"], { signal });
				} catch {}
			});
			heartbeat.tick();
			host.sendBytes(new Uint8Array([0x61]));
			const resize = host.resize(91, 27).then(
				() => undefined,
				(error) => error,
			);
			await Bun.sleep(10);
			heartbeat.stop();
			await expect(host.stop()).resolves.toBeUndefined();
			await heartbeat.pending();
			await resize;
		} finally {
			await writeFile(releasePath, "release");
			await Promise.allSettled(active);
			await host.stop().catch(() => {});
		}
		const spawned = (await readFile(logPath, "utf8")).trim().split("\n");
		expect(spawned.filter((line) => line.includes("send-keys"))).toHaveLength(0);
		expect(spawned.filter((line) => line.includes("window_activity"))).toHaveLength(0);
		expect(spawned.filter((line) => line.includes("resize-window"))).toHaveLength(0);
		expect(executed.some((argv) => argv.includes("send-keys"))).toBe(false);
		expect(executed.some((argv) => argv.includes("window_activity"))).toBe(false);
		expect(executed.some((argv) => argv.includes("resize-window"))).toBe(false);
	});
});
