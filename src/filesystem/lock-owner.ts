import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import lockfile from "proper-lockfile";

export interface LockAttemptSettings {
	staleMs: number;
	retries: number;
	retryDelayMs: number;
}

/** Owns lockfile acquisition and release so every caller keeps the same cleanup semantics. */
export class LockOwner {
	async withTarget<T>(
		targetPath: string,
		lockDir: string,
		settings: LockAttemptSettings,
		toError: (error: unknown) => Error,
		operation: () => Promise<T>,
	): Promise<T> {
		await mkdir(dirname(lockDir), { recursive: true });
		let release: (() => Promise<void>) | undefined;
		try {
			release = await lockfile.lock(targetPath, {
				lockfilePath: lockDir,
				realpath: true,
				stale: Math.max(settings.staleMs, 2_000),
				retries: {
					retries: settings.retries,
					factor: 1,
					minTimeout: settings.retryDelayMs,
					maxTimeout: settings.retryDelayMs,
					randomize: false,
				},
			});
		} catch (error) {
			throw toError(error);
		}

		let result: T | undefined;
		let operationError: unknown;
		let operationFailed = false;
		try {
			result = await operation();
		} catch (error) {
			operationFailed = true;
			operationError = error;
		}
		let releaseError: unknown;
		try {
			await release?.();
		} catch (error) {
			releaseError = toError(error);
		}
		if (releaseError !== undefined) {
			if (operationFailed)
				throw new AggregateError([operationError, releaseError], "Operation and lock release failed.");
			throw releaseError;
		}
		if (operationFailed) throw operationError;
		return result as T;
	}
}
