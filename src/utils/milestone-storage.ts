import { createMilestoneIdentityResolver } from "../core/milestone-identity.ts";
import type { Milestone } from "../types/index.ts";

type MilestoneRef = Pick<Milestone, "id" | "title">;

export function resolveMilestoneInputForStorage(
	milestone: string,
	activeMilestones: MilestoneRef[],
	archivedMilestones: MilestoneRef[] = [],
): string {
	return createMilestoneIdentityResolver(activeMilestones, archivedMilestones).resolveStorageInput(milestone);
}

type MilestoneStorageFilesystem = {
	listMilestones(): Promise<MilestoneRef[]>;
	listArchivedMilestones(): Promise<MilestoneRef[]>;
};

export async function resolveMilestoneInputFromFilesystem(
	milestone: string,
	filesystem: MilestoneStorageFilesystem,
): Promise<string> {
	const [activeMilestones, archivedMilestones] = await Promise.all([
		filesystem.listMilestones(),
		filesystem.listArchivedMilestones(),
	]);
	return resolveMilestoneInputForStorage(milestone, activeMilestones, archivedMilestones);
}
