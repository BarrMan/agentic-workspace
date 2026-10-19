export class ResumeFailedError extends Error {
	readonly kind = "resume-failed";

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
	readonly kind = "conclusive-startup-failure";
}
