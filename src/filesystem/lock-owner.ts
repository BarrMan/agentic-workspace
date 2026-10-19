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

		try {
			const result = await operation();
			await release?.().catch((error: unknown) => {
				throw toError(error);
			});
			return result;
		} catch (error) {
			if (release) await release().catch(() => undefined);
			throw error;
		}
	}
}
