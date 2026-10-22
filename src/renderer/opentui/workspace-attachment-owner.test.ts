import { describe, expect, it } from "bun:test";
import { WorkspaceAttachmentOwner } from "./workspace-attachment-owner.ts";

describe("workspace attachment ownership", () => {
	it("preserves failed attachment cleanup when publishing an error presentation", async () => {
		const owner = new WorkspaceAttachmentOwner();
		const agent = { taskId: "T1", label: "test", status: "starting" as const };
		let detachAttempts = 0;
		await expect(
			owner.launch("T1", (launch) =>
				owner.attach(
					launch,
					"S1",
					agent,
					async () => {
						throw new Error("startup failed");
					},
					async () => {
						if (++detachAttempts === 1) throw new Error("detach failed");
					},
				),
			),
		).rejects.toThrow(/startup failed[\s\S]*detach failed/);
		owner.retain("S1", { taskId: "T1", label: "test", status: "error", error: "attachment failed" });
		expect(owner.agent("S1")?.status).toBe("error");
		expect(owner.agent("S1")?.error).toBe("attachment failed");
		expect(await owner.release(() => undefined)).toEqual([]);
		expect(detachAttempts).toBe(2);
		expect(owner.hasAgent("S1")).toBe(false);
	});

	it("settles pending launch work before releasing attachments and retains failed releases", async () => {
		const owner = new WorkspaceAttachmentOwner();
		let finishLaunch!: () => void;
		let released = false;
		const pending = owner.launch("T1", (launch) =>
			owner.attach(
				launch,
				"S1",
				{ taskId: "T1", label: "test", status: "running" },
				() =>
					new Promise<void>((resolve) => {
						finishLaunch = resolve;
					}),
				async () => {
					released = true;
					throw new Error("detach failed");
				},
			),
		);
		let otherReleased = false;
		await owner.launch("T2", (launch) =>
			owner.attach(
				launch,
				"S2",
				{ taskId: "T2", label: "other", status: "running" },
				async () => {},
				async () => {
					otherReleased = true;
				},
			),
		);
		const release = owner.release(() => undefined);
		await Promise.resolve();
		expect(released).toBe(false);
		finishLaunch();
		await pending;
		expect(await release).toEqual([expect.any(Error)]);
		expect(owner.hasAgent("S1")).toBe(true);
		expect(otherReleased).toBe(true);
		expect(owner.hasAgent("S2")).toBe(false);
	});

	it("settles an invalidated launch after it has already completed", async () => {
		const owner = new WorkspaceAttachmentOwner();
		let finish!: () => void;
		void owner.launch("T1", async () => {
			await new Promise<void>((resolve) => (finish = resolve));
		});
		const settling = owner.removeTask("T1", () => undefined);
		finish();
		expect(await settling).toEqual({ released: [], failures: [] });
	});

	it("attempts shutdown after a launch fails, preserves both failures, and reopens admission", async () => {
		const owner = new WorkspaceAttachmentOwner();
		let failLaunch!: () => void;
		const pending = owner.launch(
			"T1",
			() =>
				new Promise<void>((_resolve, reject) => {
					failLaunch = () => reject(new Error("startup failed"));
				}),
		);
		void pending.catch(() => undefined);
		let shutdownAttempted = false;
		const closing = owner.shutdown(async () => {
			shutdownAttempted = true;
			throw new Error("execution stop failed");
		});
		expect(await owner.launch("T2", async () => "unexpected")).toBe(false);
		failLaunch();
		await expect(closing).rejects.toThrow(/startup failed[\s\S]*execution stop failed/);
		expect(shutdownAttempted).toBe(true);
		expect(await owner.launch("T2", async () => "admitted")).toBe("admitted");
		await owner.release(() => undefined);
		expect(await owner.launch("T3", async () => "unexpected")).toBe(false);
	});
});
