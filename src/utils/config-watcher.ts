import { type FSWatcher, unwatchFile, watch, watchFile } from "node:fs";
import { basename, dirname } from "node:path";
import type { Core } from "../core/agentic-workspace.ts";
import type { FileSystem } from "../file-system/operations.ts";
import type { AgenticWorkspaceConfig } from "../types/index.ts";

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
const BOOLEAN_CONFIG_KEYS = new Set([
	"auto_open_browser",
	"hide_empty_columns",
	"remote_operations",
	"filesystem_only",
	"filesystemOnly",
	"bypass_git_hooks",
	"check_active_branches",
]);
const ARRAY_CONFIG_KEYS = new Set(["statuses", "labels", "types", "priorities"]);
const INTEGER_CONFIG_KEYS = new Set(["max_column_width", "default_port", "zero_padded_ids", "active_branch_days"]);
const RECOGNIZED_CONFIG_KEYS = new Set([
	"project_name",
	"default_assignee",
	"default_reporter",
	"default_status",
	...ARRAY_CONFIG_KEYS,
	"date_format",
	...INTEGER_CONFIG_KEYS,
	"default_editor",
	...BOOLEAN_CONFIG_KEYS,
	"onStatusChange",
	"on_status_change",
	"task_prefix",
	"agentic_workspace_directory",
	"agenticWorkspaceDirectory",
]);

function hasValidConfigValue(key: string, value: string): boolean {
	if (ARRAY_CONFIG_KEYS.has(key)) return value.startsWith("[") && value.endsWith("]");
	if (key === "project_name" || key === "date_format") return Boolean(value.replace(/['"]/g, "").trim());
	if (BOOLEAN_CONFIG_KEYS.has(key)) return /^(?:true|false)$/i.test(value);
	if (INTEGER_CONFIG_KEYS.has(key)) return hasValidIntegerConfigValue(key, value);
	return key !== "task_prefix" || /^[a-zA-Z]+$/.test(value.replace(/['"]/g, ""));
}

function hasValidIntegerConfigValue(key: string, value: string): boolean {
	const number = Number(value);
	if (!/^\d+$/.test(value) || !Number.isSafeInteger(number)) return false;
	if (key === "max_column_width") return number >= 1;
	return key !== "default_port" || (number >= 1 && number <= 65_535);
}

function hasValidExplicitValues(content: string): boolean {
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const colonIndex = line.indexOf(":");
		if (colonIndex === -1) {
			const key = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\b/)?.[1];
			if (key && RECOGNIZED_CONFIG_KEYS.has(key)) return false;
			continue;
		}
		const key = line.slice(0, colonIndex).trim();
		const value = line.slice(colonIndex + 1).trim();
		if (!RECOGNIZED_CONFIG_KEYS.has(key)) continue;
		// default_assignee is not in ARRAY_CONFIG_KEYS because it also accepts scalars and block
		// sequences; the config parser rejects every value it cannot hold, malformed or wrong-typed,
		// before this check runs, so the last good config stays cached without a rule repeated here.
		if (!hasValidConfigValue(key, value)) return false;
	}
	return true;
}

function isUsableConfig(config: AgenticWorkspaceConfig | null, content: string): config is AgenticWorkspaceConfig {
	return Boolean(
		config?.projectName.trim() &&
			Array.isArray(config.statuses) &&
			Array.isArray(config.labels) &&
			config.dateFormat.trim() &&
			hasValidExplicitValues(content),
	);
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
	if (!isUsableConfig(config, content)) {
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
	return watchConfigFile(core.filesystem, callbacks);
}
