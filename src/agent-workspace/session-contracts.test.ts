import { describe, expect, it } from "bun:test";
import type { SessionCreationIdentity } from "./session-contracts.ts";

type Step = "reserve" | "dispatch" | "ready" | "identity" | "final" | "stop" | "rollback" | "persist-rollback";

class FakeCreation {
	readonly steps: Step[] = [];
	selected = "old";
	tracked = true;
	durableEvidence = true;
	readonly secondaryErrors: Error[] = [];

	constructor(readonly identity: SessionCreationIdentity) {}

	async succeed(): Promise<void> {
		this.steps.push("reserve");
		this.steps.push("dispatch");
		this.steps.push("ready", "identity");
		this.steps.push("final");
	}

	async rollback(original: Error, failures: Partial<Record<Step, Error>> = {}): Promise<AggregateError | undefined> {
		if (this.steps.includes("dispatch")) {
			this.steps.push("stop");
			if (failures.stop) {
				this.secondaryErrors.push(failures.stop);
				return new AggregateError([original, ...this.secondaryErrors], original.message);
			}
			this.tracked = false;
		}
		this.steps.push("rollback");
		if (this.selected === this.identity.provisionalSessionId)
			this.selected = this.identity.previousActiveSessionId ?? "";
		this.steps.push("persist-rollback");
		if (failures["persist-rollback"]) this.secondaryErrors.push(failures["persist-rollback"]);
		else {
			this.tracked = false;
			this.durableEvidence = false;
		}
		return this.secondaryErrors.length
			? new AggregateError([original, ...this.secondaryErrors], original.message)
			: undefined;
	}
}

const creationIdentity: SessionCreationIdentity = {
	taskId: "task-1",
	modeId: "default",
	provisionalSessionId: "provisional-1",
	previousActiveSessionId: "old",
};

describe("shared session contract ordering", () => {
	it("persists the reservation before dispatch", async () => {
		const creation = new FakeCreation(creationIdentity);
		await creation.succeed();
		expect(creation.steps.indexOf("reserve")).toBeLessThan(creation.steps.indexOf("dispatch"));
	});

	it("waits for readiness and required checkpoints before success", async () => {
		const creation = new FakeCreation(creationIdentity);
		await creation.succeed();
		expect(creation.steps).toEqual(["reserve", "dispatch", "ready", "identity", "final"]);
	});

	it("tears down before rollback after final persistence failure and reports secondary rollback errors", async () => {
		const creation = new FakeCreation(creationIdentity);
		await creation.succeed();
		const original = new Error("final write failed");
		const persistence = new Error("rollback write failed");
		const failure = await creation.rollback(original, { "persist-rollback": persistence });
		expect(creation.steps.slice(-3)).toEqual(["stop", "rollback", "persist-rollback"]);
		expect(failure?.errors).toEqual([original, persistence]);
		expect(creation.tracked).toBe(false);
		expect(creation.durableEvidence).toBe(true);
	});

	it("does not remove execution tracking when stop fails", async () => {
		const creation = new FakeCreation(creationIdentity);
		creation.steps.push("dispatch");
		await creation.rollback(new Error("startup failed"), { stop: new Error("stop failed") });
		expect(creation.tracked).toBe(true);
		expect(creation.steps).toEqual(["dispatch", "stop"]);
	});

	it("preserves a newer selection while rolling back the exact failed creation", async () => {
		const creation = new FakeCreation(creationIdentity);
		creation.selected = "newer-session";
		await creation.rollback(new Error("startup failed"));
		expect(creation.selected).toBe("newer-session");
		expect(creation.identity.provisionalSessionId).toBe("provisional-1");
	});
});
