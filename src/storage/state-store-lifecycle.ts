import type { StateStoreWatcher } from "./watchers/state-store-watcher.ts";

/** Shared watcher, subscriber, and shutdown lifecycle for JSON-backed state stores. */
export class StateStoreLifecycle<T> {
	readonly listeners = new Set<(value: T) => void>();
	stateWatcher?: StateStoreWatcher;
	closed = false;

	subscribe(listener: (value: T) => void): () => void {
		if (this.closed) return () => undefined;
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.stateWatcher?.close();
		this.stateWatcher = undefined;
		this.listeners.clear();
	}
}
