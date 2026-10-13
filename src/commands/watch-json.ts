import { type FSWatcher, readdirSync, statSync, watch } from "node:fs";
import { join } from "node:path";
import type { Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";

// The process that started this one: the parent, and also the launcher's parent when the npm launcher is the parent.
// Captured when the CLI loads, before parsing and project lookup, so a starter that exits during setup still counts.
const parent = process.ppid;
const [launcher, launcherParent] = (process.env.BACKLOG_LAUNCHER ?? "").split(":").map(Number);
const starters = launcher === parent ? [parent, launcherParent] : [parent];

/** POSIX reparents orphans; Windows does not, so the PIDs are probed as well. */
function starterExited(): boolean {
	return process.ppid !== parent || !starters.every(isRunning);
}

/** Only a process that no longer exists counts as ended; unknown PIDs and other errors never end the watch. */
function isRunning(pid: number | undefined): boolean {
	if (!pid || pid < 1) return true;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== "ESRCH";
	}
}

/**
 * Sizes and change times of what the read loads: the given files, and the entries of the given
 * directories one level deep, following symlinks like the loaders. This stat pass is far cheaper
 * than a full read and repairs missed notifications. The ctime also moves when a copy keeps the mtime.
 */
export function filesSignature(inputs: string[]): string {
	const describe = (path: string, name: string) => {
		try {
			const stats = statSync(path);
			return `${name}\0${stats.size}\0${stats.mtimeMs}\0${stats.ctimeMs}`;
		} catch {
			// Missing, dangling or looping entries count by name only.
			return name;
		}
	};
	return inputs
		.flatMap((input) => {
			try {
				return [
					input,
					...readdirSync(input)
						.sort()
						.map((name) => describe(join(input, name), name)),
				];
			} catch {
				// A file, or a directory that does not exist yet.
				return [describe(input, input)];
			}
		})
		.join("\n");
}

/** Stream the canonical read's bytes. Notifications are hints; a periodic stat pass repairs missed events. */
export async function watchJson(
	directories: string[],
	inputs: string[],
	read: () => Promise<string | undefined>,
	output: Writable = process.stdout,
): Promise<void> {
	let wake: (() => void) | undefined;
	const control = createWatchControl(output, () => wake?.());
	const { signal } = control;
	const watchers: FSWatcher[] = [];
	let seen: string | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;
	const state = { pending: true };
	const refresh = () => {
		state.pending = true;
		wake?.();
	};
	const onInterrupt = () => {
		process.exitCode = 130;
		control.stop();
	};
	const onTerminate = () => {
		process.exitCode = 143;
		control.stop();
	};

	process.on("SIGINT", onInterrupt);
	process.on("SIGTERM", onTerminate);
	output.on("error", control.onOutputError);
	output.on("close", control.stop);
	try {
		watchDirectories(directories, watchers, refresh, control.fail);
		timer = startWatchTimer(inputs, () => seen, refresh, onTerminate);
		await runWatchLoop({
			inputs,
			read,
			output,
			signal,
			control,
			state,
			setSeen: (value) => (seen = value),
			setWake: (resolve) => (wake = resolve),
		});
	} catch (error) {
		rethrowUnlessCancelled(error, signal);
	} finally {
		cleanupWatch({ timer, watchers, output, control, onInterrupt, onTerminate });
	}
	throwWatchFailure(control.failure);
}

type WatchLoopOptions = {
	inputs: string[];
	read: () => Promise<string | undefined>;
	output: Writable;
	signal: AbortSignal;
	control: ReturnType<typeof createWatchControl>;
	state: { pending: boolean };
	setSeen: (value: string) => void;
	setWake: (resolve: (() => void) | undefined) => void;
};

async function runWatchLoop(options: WatchLoopOptions): Promise<void> {
	let previous: string | undefined;
	while (!options.signal.aborted) {
		const snapshot = await readWatchSnapshot(options, previous);
		if (!snapshot) return;
		previous = snapshot;
		if (options.signal.aborted) return;
		if (!options.state.pending) await waitForRefresh(options.setWake);
		options.setWake(undefined);
		await delay(50, undefined, { signal: options.signal });
	}
}

async function readWatchSnapshot(
	{ inputs, read, output, signal, control, state, setSeen }: WatchLoopOptions,
	previous: string | undefined,
): Promise<string | null> {
	state.pending = false;
	const seen = filesSignature(inputs);
	setSeen(seen);
	const value = await read();
	if (value === undefined || signal.aborted) return null;
	if (value !== previous) await writeWatchValue(output, signal, value, control);
	if (filesSignature(inputs) !== seen) state.pending = true;
	return value;
}

function rethrowUnlessCancelled(error: unknown, signal: AbortSignal): void {
	if (!signal.aborted) throw error;
}

function throwWatchFailure(failure: Error | undefined): void {
	if (failure) throw failure;
}

function cleanupWatch({
	timer,
	watchers,
	output,
	control,
	onInterrupt,
	onTerminate,
}: {
	timer: ReturnType<typeof setInterval> | undefined;
	watchers: FSWatcher[];
	output: Writable;
	control: ReturnType<typeof createWatchControl>;
	onInterrupt: () => void;
	onTerminate: () => void;
}): void {
	if (timer) clearInterval(timer);
	for (const watcher of watchers) watcher.close();
	process.off("SIGINT", onInterrupt);
	process.off("SIGTERM", onTerminate);
	output.off("close", control.stop);
	if (output.destroyed && !output.closed) output.once("close", () => output.off("error", control.onOutputError));
	else output.off("error", control.onOutputError);
}

function createWatchControl(output: Writable, releaseWait: () => void) {
	const controller = new AbortController();
	let failure: Error | undefined;
	const stop = () => {
		if (controller.signal.aborted) return;
		controller.abort();
		if (output.writableLength && !output.destroyed) output.destroy();
		releaseWait();
	};
	const fail = (error: Error) => {
		failure = error;
		stop();
	};
	const onOutputError = (error: NodeJS.ErrnoException) => (error.code === "EPIPE" ? stop() : fail(error));
	return {
		signal: controller.signal,
		stop,
		fail,
		onOutputError,
		get failure() {
			return failure;
		},
	};
}

function watchDirectories(
	directories: string[],
	watchers: FSWatcher[],
	refresh: () => void,
	fail: (error: Error) => void,
): void {
	for (const directory of new Set(directories)) {
		const watcher = watch(directory, { recursive: directory === directories[0] }, refresh);
		watcher.on("error", fail);
		watchers.push(watcher);
	}
}

function startWatchTimer(inputs: string[], seen: () => string | undefined, refresh: () => void, terminate: () => void) {
	return setInterval(() => {
		if (starterExited()) terminate();
		else if (filesSignature(inputs) !== seen()) refresh();
	}, 1000);
}

function waitForRefresh(setWake: (resolve: (() => void) | undefined) => void): Promise<void> {
	return new Promise(setWake);
}

async function writeWatchValue(
	output: Writable,
	signal: AbortSignal,
	value: string,
	control: ReturnType<typeof createWatchControl>,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const onAbort = () => resolve();
		signal.addEventListener("abort", onAbort, { once: true });
		output.write(value, (error) => {
			signal.removeEventListener("abort", onAbort);
			if (!error) return resolve();
			control.onOutputError(error);
			if (control.failure) reject(control.failure);
			else resolve();
		});
	});
}
