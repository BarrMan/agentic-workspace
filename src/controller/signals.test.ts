import { describe, expect, test } from "bun:test";
import { type SignalName, Signals } from "./signals.ts";

const SIGNAL_NAMES = [
	"TasksChanged",
	"SelectionChanged",
	"DetailsChanged",
	"PreviewChanged",
	"IndicationsChanged",
	"NoticeChanged",
	"ViewChanged",
	"Closed",
] satisfies SignalName[];

describe("Signals", () => {
	test("publishes each signal to its subscribers with the payload", () => {
		const signals = new Signals();

		for (const name of SIGNAL_NAMES) {
			const calls: unknown[][] = [];
			const handler = (...payload: unknown[]) => calls.push(payload);
			signals.subscribe(name, handler);
			if (name === "Closed") signals.publish(name);
			else signals.publish(name, name, 42);
			expect(calls).toEqual([name === "Closed" ? [] : [name, 42]]);
		}
	});

	test("delivers to every subscriber for a signal and not to other signals", () => {
		const signals = new Signals();
		const first: unknown[][] = [];
		const second: unknown[][] = [];
		const unrelated: unknown[][] = [];
		signals.subscribe("TasksChanged", (...payload) => first.push(payload));
		signals.subscribe("TasksChanged", (...payload) => second.push(payload));
		signals.subscribe("SelectionChanged", (...payload) => unrelated.push(payload));

		signals.publish("TasksChanged", { id: "task-1" });

		expect(first).toEqual([[{ id: "task-1" }]]);
		expect(second).toEqual([[{ id: "task-1" }]]);
		expect(unrelated).toEqual([]);
	});

	test("unsubscribe removes only its subscription", () => {
		const signals = new Signals();
		const removed: unknown[][] = [];
		const retained: unknown[][] = [];
		const unsubscribe = signals.subscribe("NoticeChanged", (...payload) => removed.push(payload));
		signals.subscribe("NoticeChanged", (...payload) => retained.push(payload));

		unsubscribe();
		signals.publish("NoticeChanged", "notice");

		expect(removed).toEqual([]);
		expect(retained).toEqual([["notice"]]);
		unsubscribe();
		signals.publish("NoticeChanged", "again");
		expect(retained).toEqual([["notice"], ["again"]]);
	});
});
