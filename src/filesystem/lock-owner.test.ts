import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import { LockOwner } from "./lock-owner.ts";

describe("LockOwner", () => {
	const directories: string[] = [];

	afterEach(async () => {
		await Promise.all(
			directories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })),
		);
	});

	it("reports release failure after success and alongside the operation failure", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-lock-owner-"));
		directories.push(root);
		const target = join(root, "target");
		await writeFile(target, "");
		const owner = new LockOwner();
		const originalLock = lockfile.lock;
		try {
			lockfile.lock = (async (...args: Parameters<typeof lockfile.lock>) => {
				const release = await originalLock(...args);
				return async () => {
					await release();
					throw new Error("release failed");
				};
			}) as typeof lockfile.lock;
			const toError = (error: unknown) => new Error(String(error));
			await expect(
				owner.withTarget(
					target,
					join(root, "lock"),
					{ staleMs: 2_000, retries: 0, retryDelayMs: 0 },
					toError,
					async () => "done",
				),
			).rejects.toThrow("release failed");

			const operationError = new Error("operation failed");
			const failure = await owner
				.withTarget(target, join(root, "lock"), { staleMs: 2_000, retries: 0, retryDelayMs: 0 }, toError, async () => {
					throw operationError;
				})
				.catch((error: unknown) => error);
			expect(failure).toBeInstanceOf(AggregateError);
			expect((failure as AggregateError).errors).toEqual([operationError, expect.any(Error)]);
		} finally {
			lockfile.lock = originalLock;
		}
	});
});
