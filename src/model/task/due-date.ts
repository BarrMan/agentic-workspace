function invalidDueDate(fieldName: string): Error {
	return new Error(`${fieldName} must be a date in YYYY-MM-DD format (for example, 2026-08-10).`);
}

/** Normalize a due date to its written calendar day; timestamp offsets never move that day. */
export function normalizeDueDate(value: unknown, fieldName = "Due date"): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (value instanceof Date && Number.isNaN(value.getTime())) throw invalidDueDate(fieldName);
	const input = value instanceof Date ? value.toISOString() : String(value).trim();
	if (!input) return undefined;
	try {
		return Temporal.PlainDate.from(input).toString();
	} catch {
		try {
			return Temporal.Instant.from(input).toZonedDateTimeISO("UTC").toPlainDate().toString();
		} catch {
			throw invalidDueDate(fieldName);
		}
	}
}
