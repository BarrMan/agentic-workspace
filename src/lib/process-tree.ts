import { type ProcessInfo, processList, terminateTree } from "@3leaps/sysprims";

export type ProcessRow = Pick<ProcessInfo, "pid" | "ppid" | "name" | "state">;
export type OwnedProcess = { readonly pid: number; readonly comm: string };

export type ProcessTreeOutcome = "absent" | "terminated" | "killed" | "survivor";

export function processIdentity(pid: number | undefined): OwnedProcess | undefined {
	if (!pid || pid <= 1) return undefined;
	let table: readonly ProcessRow[];
	try {
		table = processList().processes;
	} catch {
		throw new Error(`Could not inspect process identity for PID ${pid}.`);
	}
	const row = table.find((process) => process.pid === pid && process.state !== "zombie");
	if (!row) return undefined;
	if (!row.name) throw new Error(`Could not read process name for identity PID ${pid}.`);
	return { pid: row.pid, comm: row.name };
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
			if (!current) return "absent";
			if (current.pid !== expected.pid || current.comm !== expected.comm) return "survivor";
		}
		const result = terminateTree(pid, { grace_timeout_ms: graceMs, kill_timeout_ms: graceMs });
		return result.exited ? (result.escalated ? "killed" : "terminated") : "survivor";
	} catch {
		return "survivor";
	}
}
