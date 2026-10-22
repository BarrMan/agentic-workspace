/**
 * Focused test for the absent-VT input path: a multi-chunk paste must coalesce into ONE tmux
 * invocation (chained with a literal `;`) instead of forking once per 512-byte chunk.
 */

import { describe, expect, it } from "bun:test";
import type { TmuxResult } from "../tmux/types.ts";
import { createInputWorker } from "./worker.ts";

const result = (): TmuxResult => ({ exitCode: 0, stdout: "", stderr: "", durationMs: 0 });

describe("input worker send-keys coalescing", () => {
	it("chains a multi-chunk paste into a single tmux invocation", async () => {
		const calls: string[][] = [];
		const exec = {
			run: async (argv: readonly string[]): Promise<TmuxResult> => {
				calls.push([...argv]);
				return result();
			},
		};
		const worker = createInputWorker(exec, { target: "t:^.0" });
		// 1024 bytes -> two 512-byte chunks, and no VT input channel.
		worker.send(new Uint8Array(1024).fill(0x61));
		await worker.flush();

		expect(calls.length).toBe(1);
		const argv = calls[0] ?? [];
		expect(argv.filter((arg) => arg === "send-keys").length).toBe(2);
		expect(argv.filter((arg) => arg === ";").length).toBe(1);
		expect(worker.stats().forks).toBe(1);
	});

	it("reports overload without replaying or retaining excess input", async () => {
		let release!: () => void;
		const blocked = new Promise<void>((resolve) => (release = resolve));
		const calls: string[][] = [];
		const errors: Error[] = [];
		const exec = {
			run: async (argv: readonly string[]): Promise<TmuxResult> => {
				calls.push([...argv]);
				await blocked;
				return result();
			},
		};
		const worker = createInputWorker(exec, { target: "t:^.0" });
		worker.onDispatch((_report, error) => {
			if (error) errors.push(error);
		});
		worker.send(new Uint8Array(32 * 1024).fill(0x61));
		await Promise.resolve();
		worker.send(new Uint8Array(40 * 1024).fill(0x62));
		expect(errors[0]?.message).toContain("overloaded");
		release();
		await worker.flush();
		expect(calls).toHaveLength(4);
		expect(calls.flat().filter((arg) => arg === "61")).toHaveLength(32 * 1024);
		expect(worker.stats().failed).toBe(1);
	});

	it("bounds disposal, reports uncertain delivery, and fences late input chunks", async () => {
		let release!: () => void;
		const blocked = new Promise<void>((resolve) => (release = resolve));
		const calls: string[][] = [];
		const errors: Error[] = [];
		const exec = {
			run: async (argv: readonly string[]): Promise<TmuxResult> => {
				calls.push([...argv]);
				await blocked;
				return result();
			},
		};
		const worker = createInputWorker(exec, { target: "t:^.0" });
		worker.onDispatch((_report, error) => {
			if (error) errors.push(error);
		});
		worker.send(new Uint8Array(32 * 1024).fill(0x61));
		await Promise.resolve();
		worker.send(new Uint8Array(1024).fill(0x62));
		const disposing = worker.dispose();
		await expect(disposing).rejects.toThrow("delivery is uncertain");
		await expect(worker.dispose()).rejects.toThrow("delivery is uncertain");
		expect(errors.some((error) => error.message.includes("canceled"))).toBe(true);
		expect(calls).toHaveLength(1);
		release();
		await Bun.sleep(10);
		expect(calls).toHaveLength(1);
	});

	it("does not replay VT overload through send-keys", async () => {
		const calls: string[][] = [];
		const errors: Error[] = [];
		const worker = createInputWorker(
			{ run: async (argv) => (calls.push([...argv]), result()) },
			{
				target: "t:^.0",
				vt: {
					inputMode: () => true,
					trySendInput: () => {
						throw new Error("VT input transport overloaded; input was not sent");
					},
				},
			},
		);
		worker.onDispatch((_report, error) => {
			if (error) errors.push(error);
		});
		worker.send(new Uint8Array([0x61]));
		await worker.flush();
		expect(calls).toHaveLength(0);
		expect(errors[0]?.message).toContain("overloaded");
		expect(worker.stats().socketFallbacks).toBe(0);
	});
});
