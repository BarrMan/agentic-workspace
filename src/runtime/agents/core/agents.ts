import type { HarnessInterface } from "./agent.ts";

export class HarnessRegistry {
	readonly #harnesses: Map<string, HarnessInterface>;

	constructor(harnesses: readonly HarnessInterface[]) {
		this.#harnesses = new Map();
		for (const harness of harnesses) {
			if (this.#harnesses.has(harness.name)) throw new Error(`Duplicate harness name: ${harness.name}`);
			this.#harnesses.set(harness.name, harness);
		}
	}

	find(name: string): HarnessInterface | undefined {
		return this.#harnesses.get(name);
	}

	forPreset(name: string): HarnessInterface {
		const harness = this.find(name);
		if (!harness) throw new Error(`Unknown harness preset: ${name}`);
		return harness;
	}

	replace(harness: HarnessInterface): void {
		if (!this.#harnesses.has(harness.name)) throw new Error(`Unknown harness preset: ${harness.name}`);
		this.#harnesses.set(harness.name, harness);
	}

	all(): readonly HarnessInterface[] {
		return [...this.#harnesses.values()];
	}
}
