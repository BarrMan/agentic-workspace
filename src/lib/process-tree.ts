/**
 * Terminate the process tree behind a tmux pane this process owns.
 *
 * tmux forks a server that outlives the CLI that created it, and it makes each pane's command its
 * own session and process-group leader — so `-panePid` addresses exactly that pane's tree and
 * nothing else on the machine. tmux itself only ever sends SIGHUP when a pane or its server dies,
 * which is why a descendant that ignores HUP (or a shell that defers its trap while it waits on
 * such a descendant) outlives both `kill-pane` and `kill-server`. Escalating to SIGKILL on the
 * group is the only way to guarantee the tree is gone before a caller reports the session stopped.
 */

import { spawnSync } from "node:child_process";

export type OwnedProcess = {
	readonly pid: number;
	readonly started: string;
	readonly uid: number;
	readonly parent?: { readonly pid: number; readonly started: string };
};

export type ProcessRow = OwnedProcess & { readonly ppid: number; readonly pgid: number; readonly stat: string };

const LSTART =
	/^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4}$/;
const normalizeStarted = (started: string): string => started.trim().replace(/\s+/g, " ");

/** Parse a complete `ps` table; one bad row invalidates the observation rather than hiding processes. */
export const parseProcessTable = (output: string): readonly ProcessRow[] | undefined => {
	if (!output.trim()) return undefined;
	const rows: ProcessRow[] = [];
	const seen = new Set<number>();
	for (const line of output.split(/\r?\n/)) {
		if (!line.trim()) continue;
		const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line);
		if (!match) return undefined;
		const [pid, ppid, pgid, uid] = match.slice(1, 5).map(Number);
		const stat = match[5];
		const rawStarted = match[6]?.trim();
		const started = rawStarted ? normalizeStarted(rawStarted) : undefined;
		if (
			![pid, ppid, pgid, uid].every(Number.isSafeInteger) ||
			pid! <= 0 ||
			ppid! < 0 ||
			pgid! < 0 ||
			uid! < -2 ||
			!stat ||
			!started ||
			!LSTART.test(started) ||
			seen.has(pid!)
		)
			return undefined;
		seen.add(pid!);
		rows.push({ pid: pid!, ppid: ppid!, pgid: pgid!, uid: uid!, stat, started });
	}
	return rows.length ? rows : undefined;
};

export const readProcessTable = (timeoutMs = 2_000): readonly ProcessRow[] | undefined => {
	const result = spawnSync("ps", ["-axo", "pid=,ppid=,pgid=,uid=,stat=,lstart="], {
		encoding: "utf8",
		timeout: Math.max(1, Math.min(2_000, timeoutMs)),
		env: { ...process.env, LC_ALL: "C" },
	});
	return result.status === 0 && !result.error && !result.stderr?.trim()
		? parseProcessTable(result.stdout ?? "")
		: undefined;
};

const live = (row: ProcessRow): boolean => !row.stat.startsWith("Z");
const sameOwnedIdentity = (row: ProcessRow | undefined, owner: OwnedProcess): boolean =>
	!!row && live(row) && normalizeStarted(row.started) === normalizeStarted(owner.started);

/** Capture live descendants with a fully observed ancestry to the exact live pane root. */
export const captureOwnedDescendants = (
	root: OwnedProcess,
	previous: readonly OwnedProcess[] = [],
	observe: () => readonly ProcessRow[] | undefined = readProcessTable,
): readonly OwnedProcess[] | undefined => {
	const table = observe();
	if (!table) return undefined;
	const byPid = new Map(table.map((row) => [row.pid, row]));
	const rootRow = byPid.get(root.pid);
	const owned = new Map<number, OwnedProcess>();
	for (const old of previous) {
		const row = byPid.get(old.pid);
		if (sameOwnedIdentity(row, old)) owned.set(old.pid, old);
	}
	const rootVerified = sameOwnedIdentity(rootRow, root);
	if (!rootVerified && !previous.length) return undefined;
	const ancestryRoots = new Map<number, string>();
	if (rootVerified) ancestryRoots.set(root.pid, normalizeStarted(root.started));
	for (const owner of owned.values()) ancestryRoots.set(owner.pid, normalizeStarted(owner.started));
	for (const row of table) {
		if (!live(row) || row.pid === root.pid || owned.has(row.pid)) continue;
		let cursor: ProcessRow | undefined = row;
		const chain = new Set<number>();
		while (cursor && !chain.has(cursor.pid) && ancestryRoots.get(cursor.pid) !== normalizeStarted(cursor.started)) {
			chain.add(cursor.pid);
			const parent = byPid.get(cursor.ppid);
			if (!parent || !live(parent)) {
				cursor = undefined;
				break;
			}
			cursor = parent;
		}
		if (cursor && ancestryRoots.get(cursor.pid) === normalizeStarted(cursor.started)) {
			const parent = byPid.get(row.ppid);
			owned.set(row.pid, {
				pid: row.pid,
				started: row.started,
				uid: row.uid,
				parent: parent && { pid: parent.pid, started: parent.started },
			});
		}
	}
	return [...owned.values()];
};

export type OwnedTerminationOptions = {
	readonly root: OwnedProcess;
	readonly captured: readonly OwnedProcess[];
	/** A timed-out callback may still persist later; callers must fence its writes by ledger generation. */
	readonly checkpoint: (owned: readonly OwnedProcess[]) => void | Promise<void>;
	readonly deadlineMs?: number;
	readonly graceMs?: number;
	readonly observe?: (timeoutMs?: number) => readonly ProcessRow[] | undefined;
	readonly signal?: (pid: number, signal: "SIGTERM" | "SIGKILL") => void;
};

/** Terminate only captured identities, refreshing descendants and checkpointing additions before signaling. */
export const terminateOwnedDescendants = async (
	options: OwnedTerminationOptions,
): Promise<"terminated" | "survivor" | "unknown"> => {
	const observe = options.observe ?? readProcessTable;
	const signal = options.signal ?? ((pid, sig) => process.kill(pid, sig));
	const startedAt = Date.now();
	const deadline = startedAt + Math.max(0, options.deadlineMs ?? 2_000);
	let owned = [...options.captured];
	let ownershipEstablished = options.captured.length > 0;
	const termDeliveredAt = new Map<string, number>();
	const killSignaled = new Set<string>();
	const identityKey = (p: OwnedProcess) => `${p.pid}:${normalizeStarted(p.started)}`;
	const probe = (): readonly ProcessRow[] | undefined => {
		const remaining = deadline - Date.now();
		if (remaining <= 0) return undefined;
		const rows = observe(Math.min(2_000, remaining));
		return Date.now() < deadline ? rows : undefined;
	};
	const checkpoint = async (rows: readonly OwnedProcess[]): Promise<boolean> => {
		const remaining = deadline - Date.now();
		if (remaining <= 0) return false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const outcome = await Promise.race([
				Promise.resolve()
					.then(() => options.checkpoint(rows))
					.then(() => true),
				new Promise<false>((resolve) => {
					timer = setTimeout(() => resolve(false), remaining);
				}),
			]);
			return outcome && Date.now() < deadline;
		} finally {
			if (timer) clearTimeout(timer);
		}
	};
	while (Date.now() < deadline) {
		const listing = probe();
		if (!listing) return "unknown";
		if (
			sameOwnedIdentity(
				listing.find((row) => row.pid === options.root.pid),
				options.root,
			)
		)
			ownershipEstablished = true;
		const acquired = captureOwnedDescendants(options.root, owned, () => listing);
		if (!acquired) return ownershipEstablished && owned.length === 0 ? "terminated" : "unknown";
		const prior = new Set(owned.map(identityKey));
		const additions = acquired.filter((p) => !prior.has(identityKey(p)));
		if (additions.length) {
			if (!(await checkpoint(acquired))) return "unknown";
			owned = [...acquired];
		} else owned = [...acquired];
		let restart = false;
		for (const p of owned) {
			if (Date.now() >= deadline) return "unknown";
			const key = identityKey(p);
			const termAt = termDeliveredAt.get(key);
			const killDue = termAt !== undefined && Date.now() - termAt >= Math.max(0, options.graceMs ?? TERM_GRACE_MS);
			if (killSignaled.has(key) || (termAt !== undefined && !killDue)) continue;
			const fresh = probe();
			if (!fresh) return "unknown";
			const freshOwned = captureOwnedDescendants(options.root, owned, () => fresh);
			if (!freshOwned) return "unknown";
			const freshKeys = new Set(owned.map(identityKey));
			if (freshOwned.some((candidate) => !freshKeys.has(identityKey(candidate)))) {
				if (!(await checkpoint(freshOwned))) return "unknown";
				owned = [...freshOwned];
				restart = true;
				break;
			}
			const row = fresh.find((candidate) => candidate.pid === p.pid);
			if (!sameOwnedIdentity(row, p) || row?.uid !== p.uid) continue;
			if (Date.now() >= deadline) return "unknown";
			// The positive PID's start-time and UID are checked in the immediately preceding synchronous probe.
			try {
				if (termAt === undefined) {
					signal(p.pid, "SIGTERM");
					termDeliveredAt.set(key, Date.now());
				} else {
					signal(p.pid, "SIGKILL");
					killSignaled.add(key);
				}
			} catch {
				/* A failed delivery remains outstanding and is revalidated before another attempt. */
			}
		}
		if (restart) continue;
		const settled = probe();
		if (!settled) return "unknown";
		if (
			sameOwnedIdentity(
				settled.find((row) => row.pid === options.root.pid),
				options.root,
			)
		)
			ownershipEstablished = true;
		const refreshed = captureOwnedDescendants(options.root, owned, () => settled);
		if (!refreshed) return ownershipEstablished && owned.length === 0 ? "terminated" : "unknown";
		const refreshedPrior = new Set(owned.map(identityKey));
		const refreshedAdditions = refreshed.filter((p) => !refreshedPrior.has(identityKey(p)));
		if (refreshedAdditions.length) {
			if (!(await checkpoint(refreshed))) return "unknown";
		}
		owned = [...refreshed];
		const byPid = new Map(settled.map((p) => [p.pid, p]));
		if (!owned.some((p) => sameOwnedIdentity(byPid.get(p.pid), p))) return "terminated";
		if (Date.now() >= deadline) return "survivor";
		await Bun.sleep(Math.min(POLL_MS, Math.max(0, deadline - Date.now())));
	}
	return "survivor";
};

/**
 * How long a pane tree may take to honour SIGTERM before it is killed outright.
 *
 * A real provider flushes durable conversation state on SIGTERM, so this is a stop grace, not a
 * timing knob: killing sooner risks a truncated conversation that exact resume cannot reopen.
 */
const TERM_GRACE_MS = 1_000;
const POLL_MS = 25;

export type ProcessTreeOutcome = "absent" | "terminated" | "killed" | "survivor";

export type ProcessTreeProbeOptions = {
	readonly observe?: (timeoutMs?: number) => readonly ProcessRow[] | undefined;
	readonly signalGroup?: (pgid: number, signal: NodeJS.Signals | 0) => void;
};

/**
 * `ok` — the signal was delivered. `absent` — nothing left to signal. `denied` — something is there
 * but this process may not signal it, which is a survivor, never an exit.
 */
type SignalOutcome = "ok" | "absent" | "denied";

/** Signal the pane's process group. tmux makes the pane command its own group leader. */
const signalGroup = (
	pgid: number,
	signal: NodeJS.Signals | 0,
	deliver: (pgid: number, signal: NodeJS.Signals | 0) => void = (group, value) => process.kill(-group, value),
): SignalOutcome => {
	try {
		deliver(pgid, signal);
		return "ok";
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "ESRCH" ? "absent" : "denied";
	}
};

/**
 * True only when the process group has no live members left.
 *
 * The probe is read once and decides on its own terms: ESRCH is conclusive (`absent`), a denied
 * signal is a survivor, and only a nonempty accessible listing containing no live member counts as
 * gone. An empty or unreadable `ps` result is never proof.
 */
export const processGroupGone = (pgid: number, options: ProcessTreeProbeOptions = {}): boolean => {
	const probe = signalGroup(pgid, 0, options.signalGroup);
	return processGroupGoneFromProbe(probe, probe === "ok" ? groupMembers(pgid, options.observe) : undefined);
};

/** Classify a group probe without allowing an empty/unreadable process table to overrule liveness. */
export const processGroupGoneFromProbe = (
	probe: "ok" | "absent" | "denied",
	members: readonly Pick<GroupMember, "stat">[] | undefined,
): boolean =>
	probe === "absent" ||
	(probe === "ok" &&
		members !== undefined &&
		members.length > 0 &&
		!members.some((member) => !member.stat.startsWith("Z")));

/** True while the pane tree still holds live descendants. */
const treeRunning = (pgid: number, options: ProcessTreeProbeOptions): boolean => {
	const probe = signalGroup(pgid, 0, options.signalGroup);
	if (probe === "absent" || probe === "denied") return probe === "denied";
	return !processGroupGoneFromProbe(probe, groupMembers(pgid, options.observe));
};

/**
 * The tmux wordings that prove a server or pane is absent, and nothing else.
 *
 * `no server running` and `can't find pane` are tmux's own answers. The two errnos are the connect
 * failure of a socket that is not there or that nobody listens on — both conclusive. A permission
 * error, a timeout, or a failed spawn is NOT absence: the caller must report it rather than record
 * a stop it did not prove.
 */
export const isMissingTmuxTarget = (output: string): boolean =>
	/no server running|can't find pane|\(no such file or directory\)|\(connection refused\)/i.test(output);

/** One process found in a pane's process group. */
type GroupMember = { readonly pid: number; readonly stat: string; readonly started: string };

/**
 * Members of a process group, from one portable listing.
 *
 * `ps -g` selects by session on Linux procps, so the group is filtered here with an exact pgid
 * comparison. `undefined` means `ps` could not be read at all, which is never "no members".
 * `lstart` is parsed as the trailing field because it contains spaces.
 */
const groupMembers = (
	pgid: number,
	observe: (timeoutMs?: number) => readonly ProcessRow[] | undefined = readProcessTable,
): readonly GroupMember[] | undefined => {
	return observe()
		?.filter((row) => row.pgid === pgid)
		.map(({ pid, stat, started }) => ({ pid, stat, started }));
};

/** Identity of one live member of a pane's group, taken while the pane root was still alive. */
export type GroupMemberIdentity = { readonly pid: number; readonly started: string };

/**
 * Snapshot the live members of a pane's process group.
 *
 * Call this only while the pane root is provably alive: the root is the group leader then, so every
 * member of that live group is its descendant, and the pid plus start time is an identity a
 * recycled pid cannot reproduce. That snapshot is what later proves ownership of a group whose root
 * has already exited — a dead root's process group cannot be attributed any other way, and the
 * pane's controlling terminal is cleared when the session leader dies.
 */
export const snapshotProcessGroup = (pgid: number): readonly GroupMemberIdentity[] | undefined =>
	groupMembers(pgid)
		?.filter((member) => !member.stat.startsWith("Z"))
		.map(({ pid, started }) => ({ pid, started }));

/** Whether every live member of the group was captured while the pane root was alive. */
export const groupOwnershipProven = (
	pgid: number,
	captured: readonly GroupMemberIdentity[] | undefined,
	options: ProcessTreeProbeOptions = {},
): boolean => {
	if (captured === undefined) return false;
	const live = groupMembers(pgid, options.observe)?.filter((member) => !member.stat.startsWith("Z"));
	if (live === undefined) return false;
	return live.every((member) =>
		captured.some(
			(known) => known.pid === member.pid && normalizeStarted(known.started) === normalizeStarted(member.started),
		),
	);
};

/** Best-effort termination of a detached owned root's group; never signals without a fresh identity proof. */
export const terminateOwnedProcessGroup = async (
	root: OwnedProcess,
	captured: readonly GroupMemberIdentity[],
	options: ProcessTreeProbeOptions & { readonly graceMs?: number; readonly deadlineMs?: number } = {},
): Promise<"terminated" | "survivor" | "unknown"> => {
	const observe = options.observe ?? readProcessTable;
	const signal = options.signalGroup ?? ((pgid, value) => process.kill(-pgid, value));
	const deadline = Date.now() + (options.deadlineMs ?? 2_000);
	const rows = observe(Math.min(2_000, Math.max(1, deadline - Date.now())));
	const currentRoot = rows?.find((row) => row.pid === root.pid && live(row));
	if (!rows) return "unknown";
	if (!currentRoot) return rows.some((row) => row.pgid === root.pid && live(row)) ? "unknown" : "terminated";
	if (currentRoot.started !== root.started || currentRoot.pgid !== root.pid) return "unknown";
	const members = rows!.filter((row) => row.pgid === currentRoot.pgid && live(row));
	const identities = members.map(({ pid, started }) => ({ pid, started }));
	if (!identities.some(({ pid, started }) => pid === root.pid && started === root.started)) return "unknown";
	const known = new Map([...captured, ...identities].map((member) => [member.pid, member]));
	const prove = (): boolean => {
		const observed = observe(Math.min(2_000, Math.max(1, deadline - Date.now())));
		if (!observed) return false;
		const rootRow = observed.find((row) => row.pid === root.pid && live(row));
		if (rootRow && (rootRow.started !== root.started || rootRow.pgid !== root.pid)) return false;
		return groupOwnershipProven(root.pid, [...known.values()], { observe: () => observed });
	};
	if (!prove()) return "unknown";
	try {
		signal(root.pid, "SIGTERM");
	} catch {
		return "unknown";
	}
	const graceUntil = Math.min(deadline, Date.now() + (options.graceMs ?? 1_000));
	while (Date.now() < graceUntil) {
		if (!prove()) return "unknown";
		await Bun.sleep(Math.min(25, graceUntil - Date.now()));
	}
	if (!prove()) return "unknown";
	try {
		signal(root.pid, "SIGKILL");
	} catch {
		const observed = observe(Math.min(2_000, Math.max(1, deadline - Date.now())));
		if (observed?.every((row) => row.pgid !== root.pid || !live(row))) return "terminated";
		return "unknown";
	}
	while (Date.now() < deadline) {
		const observed = observe(Math.min(2_000, Math.max(1, deadline - Date.now())));
		if (!observed) return "unknown";
		const liveMembers = observed.filter((row) => row.pgid === root.pid && live(row));
		if (liveMembers.length === 0) return "terminated";
		if (!prove()) return "unknown";
		await Bun.sleep(Math.min(25, deadline - Date.now()));
	}
	return "survivor";
};

/**
 * What a pane whose root has already exited proves about its process group.
 *
 * `#{pane_dead}` means the root is gone while a descendant that ignores HUP can still be running in
 * the group the root left behind, so a stop that only HUPs the pane proves nothing. The group is
 * `ours` only when every live member matches a member captured while the root was alive; a group
 * with no live member is `gone`. Anything else is `foreign`, and the caller must report the stop as
 * unproven rather than signal a group it cannot attribute.
 */
export const deadPaneGroupState = (
	pgid: number,
	captured: readonly GroupMemberIdentity[] | undefined,
	options: ProcessTreeProbeOptions = {},
): "gone" | "ours" | "foreign" => {
	const probe = signalGroup(pgid, 0, options.signalGroup);
	if (probe === "absent") return "gone";
	// A denied signal means the group exists but is not this process's to judge; an empty listing
	// cannot overrule that (a hidden-pid mount would hide foreign-UID members).
	if (probe === "denied") return "foreign";
	const members = groupMembers(pgid, options.observe);
	if (members === undefined) return "foreign";
	if (processGroupGoneFromProbe(probe, members)) return "gone";
	if (members.length === 0) return "foreign";
	return groupOwnershipProven(pgid, captured) ? "ours" : "foreign";
};

/** Poll until the pane tree is gone or the budget runs out. */
const goneWithin = async (pgid: number, budgetMs: number, options: ProcessTreeProbeOptions): Promise<boolean> => {
	const deadline = Date.now() + budgetMs;
	do {
		if (!treeRunning(pgid, options)) return true;
		await Bun.sleep(POLL_MS);
	} while (Date.now() < deadline);
	return !treeRunning(pgid, options);
};

/**
 * SIGTERM the pane's process group, then SIGKILL it if it is still alive after `graceMs`.
 *
 * The caller must pass a pid it has just proven live (see {@link livePaneRootPid}). Only the group
 * is ever signalled: tmux guarantees the pane command owns it, so the escalation cannot follow a
 * reaped root's pid into a recycled process.
 */
export async function terminateProcessTree(
	pid: number | undefined,
	graceMs: number = TERM_GRACE_MS,
	options: ProcessTreeProbeOptions = {},
): Promise<ProcessTreeOutcome> {
	if (!pid || pid <= 1 || !treeRunning(pid, options)) return "absent";
	signalGroup(pid, "SIGTERM", options.signalGroup);
	if (await goneWithin(pid, graceMs, options)) return "terminated";
	signalGroup(pid, "SIGKILL", options.signalGroup);
	return (await goneWithin(pid, graceMs, options)) ? "killed" : "survivor";
}

/** Exit-path variant: no polling and no grace, only what can be done synchronously in one tick. */
export const terminateProcessTreeSync = (pid: number | undefined): void => {
	if (!pid || pid <= 1) return;
	signalGroup(pid, "SIGKILL");
};
