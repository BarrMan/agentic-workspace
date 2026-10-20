/**
 * Shared ambiguity error for record lookups.
 *
 * Identity must fail closed: an ID that matches more than one file raises
 * {@link AmbiguousIdError} instead of picking a winner.
 */

export class AmbiguousIdError extends Error {
	readonly id: string;
	readonly candidates: string[];

	constructor(entityLabel: string, id: string, candidates: string[], guidance: string) {
		const sortedCandidates = [...candidates].sort((left, right) => left.localeCompare(right));
		super(
			[
				`${entityLabel} ID ${id} is ambiguous; ${sortedCandidates.length} files match:`,
				...sortedCandidates.map((candidate) => `  - ${candidate}`),
				guidance,
			].join("\n"),
		);
		this.name = "AmbiguousIdError";
		this.id = id;
		this.candidates = sortedCandidates;
	}
}
