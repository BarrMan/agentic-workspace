import { describe, expect, it } from "bun:test";
import { createHeartbeatCoalescer, tryWriteVtInput, writeAllSync } from "./vt-channel.ts";

describe("VT pipe synchronous writes", () => {
	it("stops after eight consecutive EAGAIN results", () => {
		let attempts = 0;
		const written = writeAllSync(1, Buffer.from("input"), () => {
			attempts++;
			throw Object.assign(new Error("temporarily unavailable"), { code: "EAGAIN" });
		});

		expect(written).toBe(false);
		expect(attempts).toBe(8);
	});

	it("keeps writing synchronously after a partial write", () => {
		const offsets: number[] = [];
		const written = writeAllSync(1, Buffer.from("input"), (_fd, _data, offset, length) => {
			offsets.push(offset);
			return Math.min(2, length);
		});

		expect(written).toBe(true);
		expect(offsets).toEqual([0, 2, 4]);
	});
});

describe("VT input socket admission", () => {
	it("bounds writes and treats write(false) as accepted, not replayable", () => {
		let writableLength = 0;
		let writes = 0;
		let settleWrite: ((error?: Error | null) => void) | undefined;
		let pendingBytes = 0;
		const deliveryErrors: Error[] = [];
		const socket = {
			writable: true,
			get writableLength() {
				return writableLength;
			},
			write(bytes: Uint8Array, callback?: (error?: Error | null) => void) {
				writes++;
				writableLength += bytes.length;
				settleWrite = callback;
				return false;
			},
		} as unknown as Parameters<typeof tryWriteVtInput>[0];
		const bytes = new Uint8Array(32 * 1024);

		const accepted = (input: Uint8Array) =>
			tryWriteVtInput(
				socket,
				input,
				() => (pendingBytes += input.length),
				(error) => {
					pendingBytes -= input.length;
					if (error) deliveryErrors.push(error);
				},
				() => (pendingBytes -= input.length),
			);
		expect(accepted(bytes)).toBe(true);
		const firstSettle = settleWrite;
		expect(accepted(bytes)).toBe(true);
		expect(tryWriteVtInput(socket, new Uint8Array([1]))).toBe("overloaded");
		expect(writes).toBe(2);
		firstSettle?.(new Error("socket closed before drain"));
		expect(pendingBytes).toBe(bytes.length);
		expect(deliveryErrors[0]?.message).toContain("before drain");
	});

	it("coalesces slow heartbeat ticks to one pending dispatch without recursion", async () => {
		let release!: () => void;
		let active = 0;
		let maxActive = 0;
		const stamps: number[] = [];
		const first = new Promise<void>((resolve) => (release = resolve));
		const heartbeat = createHeartbeatCoalescer(async () => {
			active++;
			maxActive = Math.max(maxActive, active);
			stamps.push(Date.now());
			if (stamps.length === 1) await first;
			active--;
		});
		heartbeat.tick();
		await Promise.resolve();
		for (let index = 0; index < 100; index++) heartbeat.tick();
		expect(stamps).toHaveLength(1);
		release();
		await heartbeat.pending();
		expect(stamps).toHaveLength(2);
		expect(maxActive).toBe(1);
		heartbeat.stop();
		heartbeat.tick();
		expect(stamps).toHaveLength(2);
		let releaseStopped!: () => void;
		const stoppedDispatch = new Promise<void>((resolve) => (releaseStopped = resolve));
		let afterStopCalls = 0;
		const stopping = createHeartbeatCoalescer(async () => {
			afterStopCalls++;
			await stoppedDispatch;
		});
		stopping.tick();
		await Promise.resolve();
		stopping.tick();
		stopping.stop();
		releaseStopped();
		await stopping.pending();
		expect(afterStopCalls).toBe(1);
	});
});
