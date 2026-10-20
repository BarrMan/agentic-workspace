import { DateTime as LuxonDateTime } from "luxon";

export type UtcDateDisplayOptions = {
	appendUtcLabel?: boolean;
	/** Rearranges the canonical UTC value for display; storage stays canonical. */
	dateFormat?: string;
};

export function formatUtcDateForDisplay(dateStr: string | undefined, options: UtcDateDisplayOptions = {}): string {
	const input = (dateStr ?? "").trim();
	if (!input) return "";
	const date = LuxonDateTime.fromISO(input, { zone: "utc", setZone: true });
	const parsed = date.isValid ? date : LuxonDateTime.fromSQL(input, { zone: "utc", setZone: true });
	const dateOnly = LuxonDateTime.fromFormat(input, "yyyy-MM-dd", { zone: "utc" }).isValid;
	let display = parsed.isValid ? parsed.toUTC().toFormat(dateOnly ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm") : input;
	if (parsed.isValid && options.dateFormat !== undefined)
		display = `${parsed.toUTC().toFormat(options.dateFormat)}${dateOnly ? "" : ` ${parsed.toUTC().toFormat("HH:mm")}`}`;
	return options.appendUtcLabel ? `${display} (UTC)` : display;
}
