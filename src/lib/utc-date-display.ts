export type UtcDateDisplayOptions = {
	appendUtcLabel?: boolean;
	/** Rearranges the canonical UTC value for display; storage stays canonical. */
	dateFormat?: string;
};

function parseDate(value: string): Date | undefined {
	const input = value.trim().replace(" ", "T");
	if (!input) return undefined;
	// Native ISO parsing treats timezone-less date-times as UTC and explicit offsets as instants.
	const date = new Date(input);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

function canonical(date: Date, dateOnly: boolean): string {
	const day = date.toISOString();
	return dateOnly ? day.slice(0, 10) : `${day.slice(0, 10)} ${day.slice(11, 16)}`;
}

function formatCustom(value: string, format: string): string | undefined {
	const dateOnly = value.length === 10;
	const date = parseDate(value);
	if (!date) return undefined;
	const trimmed = format.trim();
	let split = -1;
	for (let index = 0; index < trimmed.length; index++) {
		if (trimmed[index] === " " || trimmed[index] === "\t" || trimmed[index] === "\n") {
			split = index;
			break;
		}
	}
	const dateFormat = (split < 0 ? trimmed : trimmed.slice(0, split)).toLowerCase();
	const timeFormat = split < 0 ? "" : trimmed.slice(split).trim().toLowerCase();
	const values: Record<string, string> = {
		yyyy: String(date.getUTCFullYear()).padStart(4, "0"),
		mm: String(date.getUTCMonth() + 1).padStart(2, "0"),
		dd: String(date.getUTCDate()).padStart(2, "0"),
		hh: String(date.getUTCHours()).padStart(2, "0"),
		minutes: String(date.getUTCMinutes()).padStart(2, "0"),
	};
	const render = (template: string, allowed: readonly string[]): string | undefined => {
		let result = "";
		for (let index = 0; index < template.length; ) {
			const token = allowed.find((candidate) => template.slice(index, index + candidate.length) === candidate);
			if (token) {
				result += token === "mm" && allowed[0] === "hh" ? values.minutes : (values[token] ?? "");
				index += token.length;
			} else {
				result += template[index];
				index++;
			}
		}
		return result;
	};
	if (
		dateFormat.split("yyyy").length !== 2 ||
		dateFormat.split("mm").length !== 2 ||
		dateFormat.split("dd").length !== 2
	)
		return undefined;
	if (timeFormat && (timeFormat.split("hh").length !== 2 || timeFormat.split("mm").length !== 2)) return undefined;
	const formattedDate = render(dateFormat, ["yyyy", "mm", "dd"]);
	if (!formattedDate) return undefined;
	if (dateOnly) return formattedDate;
	return `${formattedDate} ${timeFormat ? render(timeFormat, ["hh", "mm"]) : canonical(date, false).slice(11)}`;
}

export function formatUtcDateForDisplay(dateStr: string | undefined, options: UtcDateDisplayOptions = {}): string {
	let input = (dateStr ?? "").trim();
	if (input.toUpperCase().endsWith(" (UTC)")) input = input.slice(0, -6).trim();
	if (!input) return "";
	const date = parseDate(input);
	let display = date ? canonical(date, input.length === 10) : input;
	if (date && options.dateFormat) display = formatCustom(display, options.dateFormat) ?? display;
	return options.appendUtcLabel ? `${display} (UTC)` : display;
}
