import { describe, expect, it } from "bun:test";
import { createMilestoneIdentityResolver } from "../core/milestone-identity.ts";

const milestone = (id: string, title: string) => ({ id, title });

describe("milestone identity resolver", () => {
	it("treats 1, m-1, and m-01 as the same ID", () => {
		const resolver = createMilestoneIdentityResolver([milestone("m-1", "Release")]);

		for (const input of ["1", "m-1", "M-1", "01", "m-01"]) {
			expect(resolver.findId(input)?.id).toBe("m-1");
			expect(resolver.resolveStorageInput(input)).toBe("m-1");
		}

		const historical = createMilestoneIdentityResolver([milestone("m-01", "Historical")]);
		expect(historical.findId("1")?.id).toBe("m-01");
	});

	it("keeps an exact raw ID ahead of a colliding title", () => {
		const resolver = createMilestoneIdentityResolver([milestone("m-0", "Alpha"), milestone("m-1", "m-0")]);

		expect(resolver.findId("m-0")?.id).toBe("m-0");
		expect(resolver.resolveStorageInput("m-0")).toBe("m-0");
		expect(resolver.findUniqueActiveTitle("m-0")?.id).toBe("m-1");
	});

	it("keeps a unique active title ahead of a colliding active ID", () => {
		const resolver = createMilestoneIdentityResolver([milestone("Alpha", "Other"), milestone("m-1", "Alpha")]);

		expect(resolver.resolveStorageInput("Alpha")).toBe("m-1");
	});

	it("prefers an exact archived ID over an active title", () => {
		const resolver = createMilestoneIdentityResolver([milestone("m-1", "m-2")], [milestone("m-2", "Archived release")]);

		expect(resolver.resolveStorageInput("m-2")).toBe("m-2");
	});

	it("lets active titles shadow reused archived titles", () => {
		const resolver = createMilestoneIdentityResolver([milestone("m-1", "Shared")], [milestone("m-9", "Shared")]);

		expect(resolver.findUniqueArchivedTitle("Shared")?.id).toBe("m-9");
		expect(resolver.canonicalize("Shared")).toBe("m-1");
		expect(resolver.resolveStorageInput("Shared")).toBe("m-1");
	});

	it("preserves ambiguous active titles instead of falling through to archived titles", () => {
		const resolver = createMilestoneIdentityResolver(
			[milestone("m-1", "Release"), milestone("m-2", "Release")],
			[milestone("m-9", "Legacy release")],
		);

		expect(resolver.findUniqueActiveTitle("Release")).toBeUndefined();
		expect(resolver.canonicalize("Release")).toBe("Release");
		expect(resolver.resolveStorageInput("Release")).toBe("Release");
	});

	it("uses a unique archived title only when active titles do not match", () => {
		const resolver = createMilestoneIdentityResolver(
			[milestone("m-1", "Current")],
			[milestone("m-9", "Legacy release")],
		);

		expect(resolver.findUniqueArchivedTitle("Legacy release")?.id).toBe("m-9");
		expect(resolver.resolveStorageInput("Legacy release")).toBe("m-9");
	});

	it("does not fuzzy-match identity values", () => {
		const resolver = createMilestoneIdentityResolver([milestone("m-1", "Release 1")]);

		expect(resolver.findActiveByAlias("Releas 1")).toBeUndefined();
		expect(resolver.resolveStorageInput("Releas 1")).toBe("Releas 1");
	});
});
