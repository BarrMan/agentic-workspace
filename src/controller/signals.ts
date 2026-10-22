export type SignalName =
	| "TasksChanged"
	| "SelectionChanged"
	| "DetailsChanged"
	| "PreviewChanged"
	| "IndicationsChanged"
	| "NoticeChanged"
	| "ViewChanged"
	| "Closed";

export type SignalHandler = (...payload: unknown[]) => void;

/** Post-commit notifications from Controller to Renderer; handlers must not call Controller operations. */
export class Signals {
	readonly #subscribers = new Map<SignalName, Set<SignalHandler>>();

	publish(name: SignalName, ...payload: unknown[]): void {
		const errors: unknown[] = [];
		for (const handler of [...(this.#subscribers.get(name) ?? [])]) {
			try {
				handler(...payload);
			} catch (error) {
				errors.push(error);
			}
		}
		if (errors.length) throw new AggregateError(errors, `Post-commit ${name} delivery failed.`);
	}

	subscribe(name: SignalName, handler: SignalHandler): () => void {
		let handlers = this.#subscribers.get(name);
		if (!handlers) {
			handlers = new Set();
			this.#subscribers.set(name, handlers);
		}
		handlers.add(handler);
		return () => {
			handlers?.delete(handler);
			if (handlers?.size === 0) this.#subscribers.delete(name);
		};
	}
}
