import { type FSWatcher, watch } from "node:fs";
import { basename, dirname } from "node:path";

const WATCH_COALESCE_MS = 10;

export type StateStoreWatcher = {
	scheduleRefresh(): void;
	close(): void;
};

/**
 * Watch the DIRECTORY, not the file: writes are rename-based, so a file watcher would be
 * replaced out from under itself and go deaf after the first write.
 */
export function startStateStoreWatcher(
	path: string,
	onRefresh: () => void,
	isClosed: () => boolean,
): StateStoreWatcher {
	let watcher: FSWatcher | undefined;
	let coalesce: ReturnType<typeof setTimeout> | undefined;
	const name = basename(path);
	try {
		watcher = watch(dirname(path), (_event, filename) => {
			if (filename && filename.toString() !== name) return;
			scheduleRefresh();
		});
		// A watcher error is a degradation, not a failure: recheck() still recovers.
		watcher.on("error", () => undefined);
		watcher.unref?.();
	} catch {
		watcher = undefined;
	}

	function scheduleRefresh(): void {
		if (isClosed() || coalesce) return;
		coalesce = setTimeout(() => {
			coalesce = undefined;
			onRefresh();
		}, WATCH_COALESCE_MS);
	}

	function close(): void {
		if (coalesce) {
			clearTimeout(coalesce);
			coalesce = undefined;
		}
		try {
			watcher?.close();
		} catch {
			// A watcher that refuses to close must not break teardown.
		}
		watcher = undefined;
	}

	return { scheduleRefresh, close };
}
