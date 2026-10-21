import type { Milestone } from "../types.ts";

/** Resolves only an exact stored milestone ID; titles are presentation data, never aliases. */
export function requireMilestoneId(milestoneId: string, milestones: readonly Milestone[]): string {
	if (milestones.some((milestone) => milestone.id === milestoneId)) return milestoneId;
	throw new Error(`Unknown milestone ID: ${milestoneId}. Use an existing milestone ID.`);
}

/**
 * Get the display label for a milestone
 * Uses the milestone entity title if available, otherwise returns the ID
 */
export function getMilestoneLabel(milestoneId: string | undefined, milestoneEntities: Milestone[]): string {
	if (!milestoneId) {
		return "Tasks without milestone";
	}
	const entity = milestoneEntities.find((m) => m.id === milestoneId);
	return entity?.title || milestoneId;
}
