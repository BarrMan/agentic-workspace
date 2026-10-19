import { type FSWatcher, unwatchFile, watch, watchFile } from "node:fs";
import { basename, dirname } from "node:path";
import type { Core } from "../../controller/agentic-workspace.ts";
import type { AgenticWorkspaceConfig } from "../../model/types.ts";
import type { FileSystem } from "../file-system.ts";

export interface ConfigWatcherCallbacks {
	onConfigChanged?: (config: AgenticWorkspaceConfig | null) => void | Promise<void>;
	onConfigInvalid?: () => void | Promise<void>;
}

interface ConfigWatcherHandle {
	stop(): void;
}

const CONFIG_SETTLE_DELAY_MS = 50;
const CONFIG_STABILITY_DELAY_MS = 25;
const CONFIG_READ_ATTEMPTS = 8;
const CONFIG_POLL_INTERVAL_MS = 500;
function isUsableConfig(config: AgenticWorkspaceConfig | null): config is AgenticWorkspaceConfig {
	return Boolean(config?.projectName.trim());
}

async function delay(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readStableConfig(path: string, isCurrent: () => boolean): Promise<string | null> {
	const firstContent = await Bun.file(path).text();
	await delay(CONFIG_STABILITY_DELAY_MS);
	if (!isCurrent()) return null;
	const secondContent = await Bun.file(path).text();
	return firstContent === secondContent ? secondContent : null;
}

async function publishStableConfig(
	filesystem: FileSystem,
	callbacks: ConfigWatcherCallbacks,
	configPath: string,
	content: string,
	isCurrent: () => boolean,
): Promise<boolean> {
	let config: AgenticWorkspaceConfig | null;
	try {
		config = filesystem.parseConfig(content);
	} catch {
		await callbacks.onConfigInvalid?.();
		return false;
	}
	if (!isUsableConfig(config)) {
		await callbacks.onConfigInvalid?.();
		return false;
	}
	if (!isCurrent() || !filesystem.publishConfig(config, configPath, content)) return false;
	while (isCurrent()) {
		try {
			await callbacks.onConfigChanged?.(config);
			return true;
		} catch {
			await delay(CONFIG_STABILITY_DELAY_MS);
		}
	}
	return false;
}

export function watchConfigFile(filesystem: FileSystem, callbacks: ConfigWatcherCallbacks): ConfigWatcherHandle {
	const configPath = filesystem.configFilePath;
	const configDirectory = dirname(configPath);
	const configFilename = basename(configPath);
	let watcher: FSWatcher | null = null;
	let generation = 0;
	let stopped = false;
	let processing = false;
	let pending = false;
	let lastPublishedContent = filesystem.getCachedConfigContent(configPath);

	const notifyAfterStableRead = async (eventGeneration: number): Promise<void> => {
		for (let attempt = 0; attempt < CONFIG_READ_ATTEMPTS; attempt++) {
			await delay(attempt === 0 ? CONFIG_SETTLE_DELAY_MS : CONFIG_STABILITY_DELAY_MS);
			const isCurrent = () => !stopped && eventGeneration === generation;
			if (!isCurrent()) return;

			try {
				const secondContent = await readStableConfig(configPath, isCurrent);
				if (secondContent === null) continue;
				if (secondContent === lastPublishedContent) {
					return;
				}

				if (!isCurrent()) return;
				if (await publishStableConfig(filesystem, callbacks, configPath, secondContent, isCurrent)) {
					lastPublishedContent = secondContent;
					return;
				}
			} catch {
				// Atomic writes can temporarily remove or lock the watched path on Windows, and the
				// parser rejects values it cannot read; either way the last good config stays cached.
			}
		}
	};
	const drainStableReads = async (): Promise<void> => {
		if (processing) return;
		processing = true;
		try {
			do {
				pending = false;
				await notifyAfterStableRead(generation);
			} while (!stopped && pending);
		} finally {
			processing = false;
			if (!stopped && pending) {
				void drainStableReads().catch(() => {});
			}
		}
	};
	const scheduleStableRead = () => {
		generation += 1;
		pending = true;
		void drainStableReads().catch(() => {});
	};
	const pollListener = () => scheduleStableRead();
	const pollWatcher = watchFile(configPath, { interval: CONFIG_POLL_INTERVAL_MS }, pollListener);
	pollWatcher.unref();

	const stop = () => {
		stopped = true;
		generation += 1;
		unwatchFile(configPath, pollListener);
		if (watcher) {
			try {
				watcher.close();
			} catch {
				// Ignore
			}
			watcher = null;
		}
	};

	try {
		watcher = watch(configDirectory, (eventType, filename) => {
			if (eventType !== "change" && eventType !== "rename") {
				return;
			}
			const changedFilename = filename;
			if (eventType !== "rename" && changedFilename && basename(changedFilename) !== configFilename) {
				return;
			}
			scheduleStableRead();
		});
		watcher.on("error", (error) => {
			if (process.env.DEBUG) {
				console.warn("Config watcher error", error);
			}
		});
	} catch {}

	scheduleStableRead();

	return { stop };
}

export function watchConfig(core: Core, callbacks: ConfigWatcherCallbacks): ConfigWatcherHandle {
	return core.watchConfig(callbacks);
}
