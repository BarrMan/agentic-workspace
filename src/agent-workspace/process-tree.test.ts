import { describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import {
	captureOwnedDescendants,
	type OwnedProcess,
	parseProcessTable,
	processIdentity,
	processIdentityAlive,
	terminateOwnedDescendants,
	terminateOwnedProcessGroup,
} from "./process-tree.ts";

const started = (second: number) => `Mon Jan 01 00:00:${String(second).padStart(2, "0")} 2024`;
const row = (pid: number, ppid: number, second: number, uid = 501, pgid = pid, stat = "S") =>
	`${pid} ${ppid} ${pgid} ${uid} ${stat} ${started(second)}`;
const root: OwnedProcess = { pid: 10, started: started(10), uid: 501 };
const table = (...lines: string[]) => parseProcessTable(lines.join("\n"));
const legacySpacing = (value: string) => value.replace(/ (\d{1,2}) /, "  $1 ");

describe("owned process primitives", () => {
	it("reaps an owned detached process group only after pgid and start-time proof", async () => {
		let rows = table(row(10, 1, 10, 501, 10), row(11, 10, 11, 501, 10));
		const signals: string[] = [];
		const result = await terminateOwnedProcessGroup(root, [], {
			observe: () => rows,
			graceMs: 0,
			deadlineMs: 100,
			signalGroup: (_pgid, signal) => {
				if (typeof signal === "string") signals.push(signal);
				if (signal === "SIGKILL") rows = table(row(1, 0, 1, 0));
			},
		});
		expect(result).toBe("terminated");
		expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
		expect(await terminateOwnedProcessGroup(root, [], { observe: () => table(row(1, 0, 1, 0)) })).toBe("terminated");
		const recycled = await terminateOwnedProcessGroup(root, [], {
			observe: () => table(row(10, 1, 12, 501, 10)),
			signalGroup: () => {
				throw new Error("recycled process group signaled");
			},
		});
		expect(recycled).toBe("unknown");
	});

	it("rejects empty, malformed, and truncated process tables but accepts Linux kernel rows", () => {
		for (const output of ["", row(10, 1, 10) + "\nmalformed", "12 1 12 501 S", "12 1 12 501 S not-a-start-time"])
			expect(parseProcessTable(output)).toBeUndefined();
		expect(table("1 0 0 0 S Mon Sep 23 09:03:11 2026", row(10, 1, 10))).toHaveLength(2);
	});

	it("captures verified descendants, rejects recycled ancestry, and retains UID-changed identities", () => {
		const rows = table(row(10, 1, 10), row(11, 10, 11), row(12, 10, 12, 502));
		expect(captureOwnedDescendants(root, [], () => rows)?.map(({ pid }) => pid)).toEqual([11, 12]);
		expect(captureOwnedDescendants({ ...root, started: started(9) }, [], () => rows)).toBeUndefined();
		const prior = [{ pid: 11, started: started(11), uid: 501 }];
		expect(
			captureOwnedDescendants(root, prior, () => table(row(11, 1, 11, 502), row(12, 11, 12, 502)))?.map(
				({ pid }) => pid,
			),
		).toEqual([11, 12]);
		expect(captureOwnedDescendants(root, [], () => undefined)).toBeUndefined();
	});

	it("normalizes spaced root, parent, captured, and live-owner timestamps", () => {
		const oldRoot = { ...root, started: legacySpacing(root.started) };
		const saved = [
			{ pid: 11, started: legacySpacing(started(11)), uid: 501, parent: { pid: 10, started: oldRoot.started } },
		];
		const observed = table(row(10, 1, 10), row(11, 10, 11), row(12, 11, 12));
		expect(captureOwnedDescendants(oldRoot, saved, () => observed)?.map(({ pid }) => pid)).toEqual([11, 12]);
		const identity = processIdentity(process.pid);
		expect(identity).toBeDefined();
		expect(processIdentityAlive({ ...identity!, started: legacySpacing(identity!.started) })).toBe(true);
	});

	it("treats unknown final probes and UID changes as outstanding, not gone", async () => {
		const owned = [{ pid: 11, started: started(11), uid: 501 }];
		let calls = 0;
		const unknown = await terminateOwnedDescendants({
			root,
			captured: owned,
			checkpoint: () => {},
			deadlineMs: 50,
			graceMs: 0,
			observe: () => (++calls === 1 ? table(row(11, 1, 11)) : undefined),
			signal: () => {},
		});
		expect(unknown).toBe("unknown");
		const mismatch = await terminateOwnedDescendants({
			root,
			captured: owned,
			checkpoint: () => {},
			deadlineMs: 50,
			graceMs: 0,
			observe: () => table(row(11, 1, 11, 502)),
			signal: () => {
				throw new Error("uid-mismatched process signaled");
			},
		});
		expect(mismatch).toBe("survivor");
	});

	it("checkpoints discoveries before signaling and does not signal after checkpoint failure or deadline", async () => {
		const events: string[] = [];
		await expect(
			terminateOwnedDescendants({
				root,
				captured: [],
				checkpoint: () => {
					events.push("checkpoint");
					throw new Error("disk");
				},
				observe: () => table(row(10, 1, 10), row(11, 10, 11)),
				signal: () => events.push("signal"),
			}),
		).rejects.toThrow("disk");
		expect(events).toEqual(["checkpoint"]);
		let checkpointStarted = false;
		const overdue = await terminateOwnedDescendants({
			root,
			captured: [],
			checkpoint: () => {
				checkpointStarted = true;
				return new Promise<void>(() => {});
			},
			deadlineMs: 50,
			observe: () => table(row(10, 1, 10), row(11, 10, 11)),
			signal: () => events.push("late"),
		});
		expect(overdue).toBe("unknown");
		expect(checkpointStarted).toBe(true);
		expect(events).not.toContain("late");
		let lateCheckpointCompleted = false;
		const lateSignals: string[] = [];
		const late = await terminateOwnedDescendants({
			root,
			captured: [],
			checkpoint: () =>
				new Promise<void>((resolve) =>
					setTimeout(() => {
						lateCheckpointCompleted = true;
						resolve();
					}, 80),
				),
			deadlineMs: 30,
			observe: () => table(row(10, 1, 10), row(11, 10, 11)),
			signal: (_pid, sig) => lateSignals.push(sig),
		});
		expect(late).toBe("unknown");
		await Bun.sleep(90);
		expect(lateCheckpointCompleted).toBe(true);
		expect(lateSignals).toEqual([]);
	});

	it("revalidates identity immediately before signaling and escalates TERM to KILL", async () => {
		const owned = [{ pid: 11, started: started(11), uid: 501 }];
		let probes = 0;
		const signals: string[] = [];
		const replacement = await terminateOwnedDescendants({
			root,
			captured: owned,
			checkpoint: () => {},
			deadlineMs: 100,
			graceMs: 0,
			observe: () => (++probes === 1 ? table(row(11, 1, 11)) : table(row(11, 1, 12))),
			signal: (_pid, sig) => signals.push(sig),
		});
		expect(replacement).toBe("terminated");
		expect(signals).toEqual([]);

		const escalationSignals: string[] = [];
		let alive = true;
		const result = await terminateOwnedDescendants({
			root,
			captured: owned,
			checkpoint: () => {},
			deadlineMs: 500,
			graceMs: 20,
			observe: () => table(row(11, 1, 11, 501, 11, alive ? "S" : "Z")),
			signal: (_pid, sig) => {
				escalationSignals.push(sig);
				if (sig === "SIGKILL") alive = false;
			},
		});
		expect(result).toBe("terminated");
		expect(escalationSignals).toContain("SIGTERM");
		expect(escalationSignals).toContain("SIGKILL");
	});

	it("checkpoints a child first observed during immediate pre-signal revalidation", async () => {
		let probes = 0;
		let alive = true;
		const events: string[] = [];
		const outcome = await terminateOwnedDescendants({
			root,
			captured: [{ pid: 11, started: started(11), uid: 501 }],
			checkpoint: (owned) => {
				events.push(`checkpoint:${owned.map((p) => p.pid).join(",")}`);
			},
			deadlineMs: 500,
			graceMs: 0,
			observe: () =>
				alive
					? ++probes <= 1
						? table(row(10, 1, 10), row(11, 10, 11))
						: table(row(10, 1, 10), row(11, 10, 11), row(12, 11, 12))
					: table("1 0 0 0 S Mon Sep 23 09:03:11 2026"),
			signal: (pid) => {
				events.push(`signal:${pid}`);
				if (pid === 11) alive = false;
			},
		});
		expect(outcome).toBe("terminated");
		expect(events[0]).toBe("checkpoint:11,12");
		expect(events.indexOf("checkpoint:11,12")).toBeLessThan(events.indexOf("signal:11"));
	});

	it("discovers and terminates children of a restored, reparented ledger identity", async () => {
		const captured = [{ pid: 11, started: started(11), uid: 501, parent: { pid: 10, started: started(10) } }];
		const checkpoints: number[][] = [];
		const signals: number[] = [];
		let rows = table(row(11, 1, 11), row(12, 11, 12));
		const outcome = await terminateOwnedDescendants({
			root,
			captured,
			checkpoint: (owned) => {
				checkpoints.push(owned.map((p) => p.pid));
			},
			deadlineMs: 500,
			graceMs: 20,
			observe: () => rows,
			signal: (pid, sig) => {
				signals.push(pid);
				if (sig === "SIGKILL") rows = table("1 0 0 0 S Mon Sep 23 09:03:11 2026");
			},
		});
		expect(outcome).toBe("terminated");
		expect(checkpoints).toEqual([[11, 12]]);
		expect(new Set(signals)).toEqual(new Set([11, 12]));
	});

	it("returns unknown when a probe fails during escalation", async () => {
		let probes = 0;
		const result = await terminateOwnedDescendants({
			root,
			captured: [{ pid: 11, started: started(11), uid: 501 }],
			checkpoint: () => {},
			deadlineMs: 500,
			graceMs: 0,
			observe: () => (++probes < 4 ? table(row(11, 1, 11)) : undefined),
			signal: () => {},
		});
		expect(result).toBe("unknown");
	});

	it("does not settle after signaling when the final process-table probe fails", async () => {
		let probes = 0;
		const signals: string[] = [];
		const result = await terminateOwnedDescendants({
			root,
			captured: [{ pid: 11, started: started(11), uid: 501 }],
			checkpoint: () => {},
			deadlineMs: 100,
			graceMs: 20,
			observe: () => (++probes < 3 ? table(row(11, 1, 11)) : undefined),
			signal: (_pid, sig) => signals.push(sig),
		});
		expect(signals).toEqual(["SIGTERM"]);
		expect(result).toBe("unknown");
	});

	it("settles a serialized restored ledger when the root and all captured descendants are absent", async () => {
		const restored = JSON.parse(
			JSON.stringify([{ pid: 11, started: started(11), uid: 501, parent: { pid: 10, started: started(10) } }]),
		) as OwnedProcess[];
		const result = await terminateOwnedDescendants({
			root,
			captured: restored,
			checkpoint: () => {},
			deadlineMs: 100,
			observe: () => table("1 0 0 0 S Mon Sep 23 09:03:11 2026"),
			signal: () => {
				throw new Error("absent ledger identity signaled");
			},
		});
		expect(result).toBe("terminated");
		const unestablished = await terminateOwnedDescendants({
			root,
			captured: [],
			checkpoint: () => {},
			deadlineMs: 100,
			observe: () => table("1 0 0 0 S Mon Sep 23 09:03:11 2026"),
			signal: () => {
				throw new Error("unproven identity signaled");
			},
		});
		expect(unestablished).toBe("unknown");
	});

	it("gives TERM delivery and each newly acquired child its own complete grace", async () => {
		const events: { pid: number; signal: string; at: number }[] = [];
		let rows = table(row(10, 1, 10), row(11, 10, 11));
		let checkpoints = 0;
		const result = await terminateOwnedDescendants({
			root,
			captured: [],
			deadlineMs: 300,
			graceMs: 25,
			checkpoint: async () => {
				if (checkpoints++ === 0) await Bun.sleep(40);
			},
			observe: () => rows,
			signal: (pid, sig) => {
				events.push({ pid, signal: sig, at: Date.now() });
				if (sig === "SIGTERM" && pid === 11) rows = table(row(10, 1, 10), row(11, 10, 11), row(12, 11, 12));
				if (sig === "SIGKILL")
					rows = table(
						row(10, 1, 10),
						...(pid === 11
							? [row(11, 10, 11, 501, 11, "Z"), row(12, 11, 12)]
							: [row(11, 10, 11, 501, 11, "Z"), row(12, 11, 12, 501, 12, "Z")]),
					);
			},
		});
		expect(result).toBe("terminated");
		expect(events[0]?.signal).toBe("SIGTERM");
		for (const pid of [11, 12]) {
			const sent = events.find((event) => event.pid === pid && event.signal === "SIGTERM")!;
			const killed = events.find((event) => event.pid === pid && event.signal === "SIGKILL")!;
			expect(killed.at - sent.at).toBeGreaterThanOrEqual(25);
		}
	});

	it("does not skip TERM grace when the overall deadline cannot fit it", async () => {
		const signals: string[] = [];
		const result = await terminateOwnedDescendants({
			root,
			captured: [{ pid: 11, started: started(11), uid: 501 }],
			checkpoint: () => {},
			deadlineMs: 35,
			graceMs: 100,
			observe: () => table(row(11, 1, 11)),
			signal: (_pid, sig) => signals.push(sig),
		});
		expect(signals).toEqual(["SIGTERM"]);
		expect(result).toBe("survivor");
	});

	it("captures and terminates a detached child in another process group, then verifies absence", async () => {
		const parent = Bun.spawn(
			[
				"bun",
				"-e",
				`const child = Bun.spawn(["bun", "-e", "setInterval(() => {}, 1000)"], { detached: true, stdout: "ignore", stderr: "ignore" }); console.log(child.pid); setInterval(() => {}, 1000);`,
			],
			{ detached: true, stdout: "pipe", stderr: "ignore" },
		);
		const fixtures: OwnedProcess[] = [];
		let childPid: number | undefined;
		try {
			const output = await parent.stdout.getReader().read();
			childPid = Number(new TextDecoder().decode(output.value).trim());
			const observe = () => {
				const ps = Bun.spawnSync(["ps", "-axo", "pid=,ppid=,pgid=,uid=,stat=,lstart="], {
					env: { ...process.env, LC_ALL: "C" },
				});
				return ps.exitCode === 0 ? parseProcessTable(ps.stdout.toString()) : undefined;
			};
			const before = observe();
			const rootRow = before?.find((p) => p.pid === parent.pid);
			const childRow = before?.find((p) => p.pid === childPid);
			if (rootRow) fixtures.push({ pid: parent.pid, started: rootRow.started, uid: rootRow.uid });
			if (childRow) fixtures.push({ pid: childPid, started: childRow.started, uid: childRow.uid });
			expect(rootRow).toBeDefined();
			expect(childRow).toBeDefined();
			assert(rootRow && childRow, "Fixture process identities are captured.");
			expect(childRow.pgid).not.toBe(rootRow.pgid);
			const ownedRoot: OwnedProcess = { pid: parent.pid, started: rootRow.started, uid: rootRow.uid };
			const acquired = captureOwnedDescendants(ownedRoot, [], observe)!;
			fixtures.push(...acquired);
			expect(acquired.some((p) => p.pid === childPid)).toBe(true);
			process.kill(parent.pid, "SIGKILL");
			await parent.exited;
			expect(
				await terminateOwnedDescendants({
					root: ownedRoot,
					captured: acquired,
					checkpoint: () => {},
					observe,
					deadlineMs: 1_000,
					graceMs: 50,
				}),
			).toBe("terminated");
			const after = observe();
			expect(after).toBeDefined();
			expect(after?.some((p) => p.pid === childPid && p.started === childRow.started)).toBe(false);
		} finally {
			if (
				childPid !== undefined &&
				Number.isSafeInteger(childPid) &&
				!fixtures.some((fixture) => fixture.pid === childPid)
			) {
				process.kill(childPid, "SIGKILL");
			}
			parent.kill("SIGKILL");
			for (const fixture of fixtures) {
				const ps = Bun.spawnSync(["ps", "-p", String(fixture.pid), "-o", "pid=,ppid=,pgid=,uid=,stat=,lstart="], {
					env: { ...process.env, LC_ALL: "C" },
				});
				const current = parseProcessTable(ps.stdout.toString())?.[0];
				if (current?.started === fixture.started && current.uid === fixture.uid) process.kill(fixture.pid, "SIGKILL");
			}
			await parent.exited;
			if (
				childPid !== undefined &&
				Number.isSafeInteger(childPid) &&
				!fixtures.some((fixture) => fixture.pid === childPid)
			) {
				const deadline = Date.now() + 5_000;
				let exited = false;
				while (Date.now() < deadline) {
					try {
						process.kill(childPid, 0);
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code === "ESRCH") exited = true;
						break;
					}
					await Bun.sleep(10);
				}
				expect(exited).toBe(true);
			}
			for (const fixture of fixtures) {
				const deadline = Date.now() + 5_000;
				let exited = false;
				while (Date.now() < deadline) {
					const ps = Bun.spawnSync(["ps", "-p", String(fixture.pid), "-o", "pid=,ppid=,pgid=,uid=,stat=,lstart="], {
						env: { ...process.env, LC_ALL: "C" },
					});
					const current = parseProcessTable(ps.stdout.toString())?.[0];
					if (current?.started !== fixture.started || current.uid !== fixture.uid) {
						exited = true;
						break;
					}
					await Bun.sleep(10);
				}
				expect(exited).toBe(true);
			}
		}
	});
});
