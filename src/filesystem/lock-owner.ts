import lockfile from "proper-lockfile";

export interface LockAttemptSettings {
	staleMs: number;
	retries: number;
	retryDelayMs: number;
}

export async function withLockRelease<T>(release: () => Promise<void>, operation: () => Promise<T>): Promise<T> {
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
		await release();
	} catch (error) {
		releaseError = error;
	}
	if (releaseError !== undefined) {
		if (operationFailed) throw new AggregateError([operationError, releaseError], "Operation and lock release failed.");
		throw releaseError;
	}
	if (operationFailed) throw operationError;
	return result as T;
}

/** Owns lockfile acquisition and release so every caller keeps the same cleanup semantics. */
export class LockOwner {
	async acquireTarget(
		targetPath: string,
		lockDir: string,
		settings: LockAttemptSettings,
		toError: (error: unknown) => Error,
	): Promise<() => Promise<void>> {
		try {
			const release = await lockfile.lock(targetPath, {
				lockfilePath: lockDir,
				realpath: false,
				stale: Math.max(settings.staleMs, 2_000),
				retries: {
					// node-retry precomputes retries; unbounded waiting must use forever.
					retries: settings.retries === Number.POSITIVE_INFINITY ? 0 : settings.retries,
					forever: settings.retries === Number.POSITIVE_INFINITY,
					factor: 1,
					minTimeout: settings.retryDelayMs,
					maxTimeout: settings.retryDelayMs,
					randomize: false,
				},
			});
			return async () => {
				try {
					await release();
				} catch (error) {
					throw toError(error);
				}
			};
		} catch (error) {
			throw toError(error);
		}
	}

	async withTarget<T>(
		targetPath: string,
		lockDir: string,
		settings: LockAttemptSettings,
		toError: (error: unknown) => Error,
		operation: () => Promise<T>,
	): Promise<T> {
		const release = await this.acquireTarget(targetPath, lockDir, settings, toError);
		return await withLockRelease(release, operation);
	}
}
