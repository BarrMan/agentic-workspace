export class ResumeFailedError extends Error {
	constructor(
		readonly nativeProvider: string,
		readonly nativeSessionId: string,
		cause: unknown,
	) {
		super(
			`ResumeFailed: ${nativeProvider} ${nativeSessionId}. Conversation preserved; starting fresh requires an explicit decision.`,
			{ cause },
		);
		this.name = "ResumeFailedError";
	}
}

export class ExactResumeUnavailableError extends Error {
	// Callers and tests discriminate this error by its kind.
	// fallow-ignore-next-line unused-class-member -- asserted by startup and resume failure tests
	readonly kind = "exact-resume-unavailable";

	constructor(
		readonly reason: "auto-resume-disabled" | "previous-resume-failed",
		readonly nativeProvider?: string,
		readonly nativeSessionId?: string,
		cause?: unknown,
	) {
		const identity = [nativeProvider, nativeSessionId].filter(Boolean).join(" ");
		super(
			`Exact conversation resume is unavailable (${reason})${identity ? ` for ${identity}` : ""}. The existing conversation was preserved; start a fresh conversation explicitly if desired.`,
			{ cause },
		);
		this.name = "ExactResumeUnavailableError";
	}
}

export class ConclusiveStartupFailureError extends Error {
	// Callers and tests discriminate this error by its kind.
	// fallow-ignore-next-line unused-class-member -- asserted by startup and resume failure tests
	readonly kind = "conclusive-startup-failure";
}
