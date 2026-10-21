import { afterEach, describe, expect, it } from "bun:test";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExistingAgentHost } from "./existing-agent-host.ts";
import type { TmuxExec, TmuxResult } from "./tmux/types.ts";

describe("existing CLI agent host", () => {
	const directories: string[] = [];
	afterEach(async () => {
		await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
	});

	it("replays and follows existing raw output, sends ordered bytes, and detaches without killing the CLI session", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-existing-host-"));
		directories.push(directory);
		const outputPath = join(directory, "session.log");
		await writeFile(outputPath, "\u001b[2Jfirst conversation");
		const commands: Array<{ command: string; args: readonly string[] }> = [];
		const errors: Error[] = [];
		const exec: TmuxExec = {
			run: async (argv): Promise<TmuxResult> => {
				commands.push({ command: argv[0] ?? "", args: argv.slice(1) });
				return {
					exitCode: 0,
					stdout: argv[0] === "display-message" ? "0" : argv[0] === "capture-pane" ? "first conversation" : "",
					stderr: "",
					durationMs: 0,
				};
			},
		};
		let output = "";
		const host = createExistingAgentHost({
			exec,
			paneId: "%42",
			outputPath,
			onOutput: (bytes) => {
				output += new TextDecoder().decode(bytes);
			},
			onError: (error) => {
				errors.push(error);
			},
		});
		try {
			await host.start();
			expect(output).toContain("first conversation");
			// The fs.watch event, not the low-frequency backstop timer, must drive the follow.
			await appendFile(outputPath, "\nsecond message");
			const deadline = Date.now() + 5_000;
			while (!output.includes("second message")) {
				if (Date.now() >= deadline) throw new Error("Existing capture log did not publish appended output");
				await new Promise<void>((resolve) => setImmediate(resolve));
			}
			host.sendBytes(new Uint8Array([0x1b, 0x5b]));
			host.sendBytes(new Uint8Array([0x41]));
			await host.flushInput();
			expect(commands.filter((entry) => entry.command === "send-keys").flatMap((entry) => entry.args.slice(3))).toEqual(
				["1b", "5b", "41"],
			);
			await host.resize(91, 27);
			expect(commands).toContainEqual({ command: "resize-window", args: ["-t", "%42", "-x", "91", "-y", "27"] });
			expect(commands).toContainEqual({ command: "resize-pane", args: ["-t", "%42", "-x", "91", "-y", "27"] });
		} finally {
			await host.stop();
		}
		expect(errors).toEqual([]);
		expect(
			commands.every((entry) =>
				["display-message", "capture-pane", "send-keys", "resize-window", "resize-pane"].includes(entry.command),
			),
		).toBeTrue();
		const count = commands.length;
		host.sendBytes(new Uint8Array([0x42]));
		await host.flushInput();
		expect(commands).toHaveLength(count);
	});

	it("continues bounded recovered-host reads through UTF-8 and ANSI sequences, then stops notifications", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-existing-bounded-output-"));
		directories.push(directory);
		const outputPath = join(directory, "session.log");
		const payload = Buffer.alloc(160 * 1024, 0x61);
		Buffer.from("\u001b[38;5;123m", "utf8").copy(payload, 65_520);
		Buffer.from("🧪", "utf8").copy(payload, 65_534);
		await writeFile(outputPath, "");
		const parts: Uint8Array[] = [];
		const host = createExistingAgentHost({
			exec: {
				run: async (argv): Promise<TmuxResult> => ({
					exitCode: 0,
					stdout: argv[0] === "display-message" ? "0" : "",
					stderr: "",
					durationMs: 0,
				}),
			},
			paneId: "%43",
			outputPath,
			onOutput: (bytes) => parts.push(Uint8Array.from(bytes)),
			onError: (error) => {
				throw error;
			},
		});
		await host.start();
		await appendFile(outputPath, payload);
		const deadline = Date.now() + 5_000;
		while (Buffer.concat(parts).length < payload.length) {
			if (Date.now() >= deadline) throw new Error("Recovered host did not drain the output log");
			await new Promise<void>((resolve) => setImmediate(resolve));
		}
		const deliveredChunks = parts.length;
		expect(parts.every((part) => part.byteLength <= 64 * 1024)).toBe(true);
		expect(Buffer.concat(parts).subarray(Buffer.byteLength("\x1b[2J\x1b[H"))).toEqual(payload);
		await host.stop();
		await appendFile(outputPath, "late output");
		await new Promise<void>((resolve) => setTimeout(resolve, 20));
		expect(parts).toHaveLength(deliveredChunks);
	});

	it("coalesces existing-host resize pairs to the active and latest sizes", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-existing-resize-coalescing-"));
		directories.push(directory);
		const outputPath = join(directory, "session.log");
		await writeFile(outputPath, "");
		let release!: () => void;
		let blockFirstWindow = true;
		const firstWindow = new Promise<void>((resolve) => (release = resolve));
		const resizes: string[][] = [];
		const exec: TmuxExec = {
			run: async (argv): Promise<TmuxResult> => {
				if (argv[0] === "resize-window" || argv[0] === "resize-pane") resizes.push([...argv]);
				if (argv[0] === "resize-window" && blockFirstWindow) {
					blockFirstWindow = false;
					await firstWindow;
				}
				return { exitCode: 0, stdout: argv[0] === "display-message" ? "0" : "", stderr: "", durationMs: 0 };
			},
		};
		const host = createExistingAgentHost({
			exec,
			paneId: "%44",
			outputPath,
			onOutput: () => {},
			onError: (error) => {
				throw error;
			},
		});
		await host.start();
		const first = host.resize(81, 25);
		await Promise.resolve();
		const coalesced = [host.resize(82, 26), host.resize(83, 27), host.resize(84, 28)];
		release();
		await Promise.all([first, ...coalesced]);
		expect(resizes.map((argv) => argv[0])).toEqual(["resize-window", "resize-pane", "resize-window", "resize-pane"]);
		expect(resizes.map((argv) => argv.slice(-4))).toEqual([
			["-x", "81", "-y", "25"],
			["-x", "81", "-y", "25"],
			["-x", "84", "-y", "28"],
			["-x", "84", "-y", "28"],
		]);
		await host.stop();
		const stoppedCount = resizes.length;
		await host.resize(90, 30);
		expect(resizes).toHaveLength(stoppedCount);
	});

	it("fences a queued existing-host resize when stop wins an in-flight resize", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-existing-resize-stop-"));
		directories.push(directory);
		const outputPath = join(directory, "session.log");
		await writeFile(outputPath, "");
		let release!: () => void;
		const blocked = new Promise<void>((resolve) => (release = resolve));
		const resizes: string[][] = [];
		const host = createExistingAgentHost({
			exec: {
				run: async (argv): Promise<TmuxResult> => {
					if (argv[0] === "resize-window" || argv[0] === "resize-pane") resizes.push([...argv]);
					if (argv[0] === "resize-window") await blocked;
					return { exitCode: 0, stdout: argv[0] === "display-message" ? "0" : "", stderr: "", durationMs: 0 };
				},
			},
			paneId: "%45",
			outputPath,
			onOutput: () => {},
			onError: (error) => {
				throw error;
			},
		});
		await host.start();
		const active = host.resize(81, 25);
		await Promise.resolve();
		const queued = host.resize(90, 30);
		await host.stop();
		const stoppedCount = resizes.length;
		release();
		await expect(active).rejects.toThrow("stopped");
		await expect(queued).rejects.toThrow("stopped");
		await new Promise<void>((resolve) => setTimeout(resolve, 20));
		expect(resizes).toHaveLength(stoppedCount);
		expect(resizes.map((argv) => argv[0])).toEqual(["resize-window"]);
	});
});
