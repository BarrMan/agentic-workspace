import { forceKill, type ProcessInfo, processList, procGet, terminate, terminateTree } from "@3leaps/sysprims";

export type ProcessRow = Pick<ProcessInfo, "pid" | "ppid" | "name" | "state" | "start_time_unix_ms">;
export type OwnedProcess = {
	readonly pid: number;
	readonly comm: string;
	readonly started: string;
	readonly parent?: { readonly pid: number; readonly started: string };
};

export type OwnedTerminationOptions = {
	readonly root: OwnedProcess;
	readonly captured: readonly OwnedProcess[];
	readonly checkpoint: (owned: readonly OwnedProcess[]) => void | Promise<void>;
	readonly deadlineMs?: number;
	readonly graceMs?: number;
	readonly observe?: (timeoutMs?: number) => readonly ProcessRow[] | undefined;
	readonly signal?: (pid: number, signal: "SIGTERM" | "SIGKILL") => void;
};
export class ProcessTree {
	private static readonly delayMs = 25;

	private static started(row: ProcessRow): string {
		return String(row.start_time_unix_ms ?? "");
	}

	private static live(row: ProcessRow): boolean {
		return row.state !== "zombie";
	}

	private static sameOwnedIdentity(row: ProcessRow | undefined, owner: OwnedProcess): boolean {
		return (
			!!row &&
			ProcessTree.live(row) &&
			row.pid === owner.pid &&
			row.name === owner.comm &&
			ProcessTree.started(row) === owner.started
		);
	}

	private static identity(process: OwnedProcess): string {
		return `${process.pid}:${process.started}`;
	}

	static readProcessTable(): readonly ProcessRow[] | undefined {
		try {
			return processList().processes;
		} catch {
			return undefined;
		}
	}

	static captureOwnedDescendants(
		root: OwnedProcess,
		previous: readonly OwnedProcess[] = [],
		observe: () => readonly ProcessRow[] | undefined = ProcessTree.readProcessTable,
	): readonly OwnedProcess[] | undefined {
		const table = observe();
		if (!table) return undefined;
		const byPid = new Map(table.map((row) => [row.pid, row]));
		const owned = new Map<number, OwnedProcess>();
		for (const old of previous) {
			if (ProcessTree.sameOwnedIdentity(byPid.get(old.pid), old)) owned.set(old.pid, old);
		}
		const rootVerified = ProcessTree.sameOwnedIdentity(byPid.get(root.pid), root);
		if (!rootVerified && !previous.length) return undefined;
		const roots = new Set<number>([...(rootVerified ? [root.pid] : []), ...owned.keys()]);
		for (const row of table) {
			if (!ProcessTree.live(row) || row.pid === root.pid || owned.has(row.pid)) continue;
			let cursor: ProcessRow | undefined = row;
			const seen = new Set<number>();
			while (cursor && !roots.has(cursor.pid) && !seen.has(cursor.pid)) {
				seen.add(cursor.pid);
				cursor = byPid.get(cursor.ppid);
			}
			if (cursor && roots.has(cursor.pid)) {
				const parent = byPid.get(row.ppid);
				owned.set(row.pid, {
					pid: row.pid,
					comm: row.name,
					started: ProcessTree.started(row),
					parent: parent && { pid: parent.pid, started: ProcessTree.started(parent) },
				});
			}
		}
		return [...owned.values()];
	}

	static async terminateOwnedDescendants(
		options: OwnedTerminationOptions,
	): Promise<"terminated" | "survivor" | "unknown"> {
		const observe = options.observe ?? ProcessTree.readProcessTable;
		const signal = options.signal ?? ((pid, sig) => (sig === "SIGTERM" ? terminate(pid) : forceKill(pid)));
		const deadline = Date.now() + (options.deadlineMs ?? 2_000);
		let owned = [...options.captured];
		let established = owned.length > 0;
		const termAt = new Map<number, number>();
		while (Date.now() < deadline) {
			const rows = observe(Math.max(1, Math.min(2_000, deadline - Date.now())));
			if (!rows) return "unknown";
			if (
				ProcessTree.sameOwnedIdentity(
					rows.find((r) => r.pid === options.root.pid),
					options.root,
				)
			)
				established = true;
			const acquired = ProcessTree.captureOwnedDescendants(options.root, owned, () => rows);
			if (!acquired) return established && owned.length === 0 ? "terminated" : "unknown";
			const prior = new Set(owned.map((p) => ProcessTree.identity(p)));
			if (acquired.some((p) => !prior.has(ProcessTree.identity(p)))) await options.checkpoint(acquired);
			owned = [...acquired];
			for (const p of owned) {
				const current = observe(Math.max(1, Math.min(2_000, deadline - Date.now())));
				if (!current) return "unknown";
				if (
					!ProcessTree.sameOwnedIdentity(
						current.find((r) => r.pid === p.pid),
						p,
					)
				)
					continue;
				const first = termAt.get(p.pid);
				if (first === undefined) {
					try {
						signal(p.pid, "SIGTERM");
					} catch {}
					termAt.set(p.pid, Date.now());
				} else if (Date.now() - first >= (options.graceMs ?? 1_000)) {
					try {
						signal(p.pid, "SIGKILL");
					} catch {}
				}
			}
			const remaining = observe(Math.max(1, Math.min(2_000, deadline - Date.now())));
			if (!remaining) return "unknown";
			const fresh = ProcessTree.captureOwnedDescendants(options.root, owned, () => remaining);
			if (!fresh) return "unknown";
			owned = [...fresh];
			if (
				!owned.some((p) =>
					ProcessTree.sameOwnedIdentity(
						remaining.find((r) => r.pid === p.pid),
						p,
					),
				)
			)
				return "terminated";
			await Bun.sleep(Math.min(ProcessTree.delayMs, Math.max(0, deadline - Date.now())));
		}
		return "survivor";
	}
}

export type ProcessTreeOutcome = "absent" | "terminated" | "killed" | "survivor";
export function processIdentity(pid: number | undefined): OwnedProcess | undefined {
	if (!pid || pid <= 1) return undefined;
	const row = ProcessTree.readProcessTable()?.find((process) => process.pid === pid && process.state !== "zombie");
	return row ? { pid, comm: row.name, started: String(row.start_time_unix_ms ?? "") } : undefined;
}

export async function terminateProcessTree(
	pid: number | undefined,
	graceMs = 1_000,
	expected?: OwnedProcess,
): Promise<ProcessTreeOutcome> {
	if (!pid || pid <= 1) return "absent";
	try {
		if (expected) {
			const current = processIdentity(pid);
			if (!current || current.comm !== expected.comm || current.started !== expected.started) return "absent";
		}
		const result = terminateTree(pid, { grace_timeout_ms: graceMs, kill_timeout_ms: graceMs });
		return result.exited ? (result.escalated ? "killed" : "terminated") : result.timed_out ? "survivor" : "absent";
	} catch {
		try {
			procGet(pid);
			return "survivor";
		} catch {
			return "absent";
		}
	}
}
export const isMissingTmuxTarget = (output: string): boolean =>
	/no server running|can't find pane|\(no such file or directory\)|\(connection refused\)/i.test(output);
