export class SessionMutationError extends AggregateError {
	constructor(
		operationError: unknown,
		releaseError: unknown,
		readonly writeCommitted: boolean,
	) {
		super(
			[...(operationError === undefined ? [] : [operationError]), releaseError],
			"Session mutation lock release failed.",
		);
		this.name = "SessionMutationError";
	}
}
