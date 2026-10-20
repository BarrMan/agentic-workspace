/* Status icon and color mappings for consistent UI display */

import type { AgentActivity, AgentIndication } from "../../model/session/types.ts";

export interface StatusStyle {
	icon: string;
	color: string;
}

/**
 * Get the icon and color for a given status
 * @param status - The task status
 * @returns The icon and color for the status
 */
export function getStatusStyle(status: string): StatusStyle {
	const statusMap: Record<string, StatusStyle> = {
		Done: { icon: "✔", color: "green" },
		"In Progress": { icon: "◒", color: "yellow" },
		Blocked: { icon: "●", color: "red" },
		"To Do": { icon: "○", color: "default" },
		Review: { icon: "◆", color: "blue" },
		Testing: { icon: "▣", color: "cyan" },
	};

	// Return the mapped style or default for unknown statuses
	return statusMap[status] || { icon: "○", color: "default" };
}

/**
 * Get just the color for a status (for backward compatibility)
 * @param status - The task status
 * @returns The color for the status
 */
export function getStatusColor(status: string): string {
	return getStatusStyle(status).color;
}

/**
 * Colour for the derived agent-activity dot. This is the agent-session status indication, a distinct
 * axis from task statuses:
 *   green  = `running` — the agent is doing work
 *   orange = `waiting` — the agent is waiting for a user response or a permission approval
 *   blue   = `idle` / parked — the session exists but is not doing work
 *   none   = `unknown` / `stopped` or no session — the row renders no dot
 * `starting` is parked blue; `error` (red) is a transient state. An active session with no derived
 * value yet (cold start or restart, including `starting` and `unknown`) is parked and reads blue.
 */
export function getActivityColor(activity: AgentActivity | undefined): string {
	switch (activity) {
		case "running":
			return "brightgreen";
		case "waiting":
			return "#f59e0b";
		case "error":
			return "red";
		default:
			return "#60a5fa";
	}
}

/**
 * Colour for the derived agent-activity dot when it renders on the light selected-row background
 * (`#cbd5e1`). The default {@link getActivityColor} palette is tuned for the dark surface, so its
 * bright variants (e.g. bright green) fall below the 4.5 contrast floor on the selection fill. These
 * are the same hue families, darkened to stay legible without collapsing every activity to one dot.
 */
export function getSelectedActivityColor(activity: AgentActivity | undefined): string {
	switch (activity) {
		case "running":
			return "#166534";
		case "waiting":
			return "#92400e";
		case "error":
			return "#991b1b";
		default:
			return "#1e40af";
	}
}

/**
 * Colour for a task's settled agent-session indication on the dark surface. This is the single
 * source of truth for the row dot: `working` green, `waiting` orange, `error` red, `parked` blue.
 */
export function getIndicationColor(indication: AgentIndication): string {
	switch (indication) {
		case "working":
			return "brightgreen";
		case "waiting":
			return "#f59e0b";
		case "error":
			return "red";
		case "ended":
			return "#9ca3af";
		default:
			return "#60a5fa";
	}
}

/**
 * The selected-row variant of {@link getIndicationColor}, darkened to keep at least a 4.5 contrast
 * ratio on the light selected-row background (`#cbd5e1`).
 */
export function getSelectedIndicationColor(indication: AgentIndication): string {
	switch (indication) {
		case "working":
			return "#166534";
		case "waiting":
			return "#92400e";
		case "error":
			return "#991b1b";
		case "ended":
			return "#4b5563";
		default:
			return "#1e40af";
	}
}

/**
 * Format a status with its icon
 * @param status - The task status
 * @returns The formatted status string with icon
 */
export function formatStatusWithIcon(status: string): string {
	const style = getStatusStyle(status);
	return `${style.icon} ${status}`;
}
