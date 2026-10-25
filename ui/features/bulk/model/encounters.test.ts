import { Encounter, Target } from '@generated/proto/common';
import { SavedEncounter } from '@generated/proto/ui';
import type { IndividualSimHost } from '@sim/sim_host';
import { makeBulkPlayer } from '@testing/sim/bulk_player';
import { describe, expect, it, vi } from 'vitest';

import { formatEncounterDuration, formatEncounterSummary, pickableBulkEncounters } from './encounters';

vi.mock('@i18n/config', () => ({
	default: { t: (key: string, options?: { count?: number }) => (options?.count === undefined ? key : `${key}:${options.count}`) },
}));

const SAVED_KEY = 'saved-encounters';

const encounter = (duration: number, durationVariation = 5, targets = 1) =>
	Encounter.create({ duration, durationVariation, targets: Array.from({ length: targets }, () => Target.create()) });

const hostWith = (presets: Array<{ name: string; encounter?: Encounter }>, saved: Record<string, Encounter>) => {
	const player = makeBulkPlayer();
	const record = Object.fromEntries(Object.entries(saved).map(([name, proto]) => [name, SavedEncounter.toJson(SavedEncounter.create({ encounter: proto }))]));
	player.sim.env.storage.setItem(SAVED_KEY, JSON.stringify(record));
	return {
		player,
		sim: player.sim,
		individualConfig: { presets: { encounters: presets } },
		getSavedEncounterStorageKey: () => SAVED_KEY,
	} as unknown as IndividualSimHost<any>;
};

describe('formatEncounterDuration', () => {
	it.each([
		[{ duration: 90, durationVariation: 10 }, '1:30 ±10s'],
		[{ duration: 300, durationVariation: null }, '5:00'],
		[{ duration: null, durationVariation: null }, 'bulk_tab.settings.encounters.health_summary'],
	])('formats %#', (length, label) => {
		expect(formatEncounterDuration(length)).toBe(label);
	});
});

describe('formatEncounterSummary', () => {
	it.each([
		[encounter(180), '3:00 ±5s · bulk_tab.settings.encounters.targets:1'],
		[encounter(90, 10, 3), '1:30 ±10s · bulk_tab.settings.encounters.targets:3'],
		[encounter(600, 30, 0), '10:00 ±30s · bulk_tab.settings.encounters.targets:1'],
		[{ ...encounter(180, 5, 2), useHealth: true }, 'bulk_tab.settings.encounters.health_summary · bulk_tab.settings.encounters.targets:2'],
	])('formats %#', (proto, summary) => {
		expect(formatEncounterSummary(proto)).toBe(summary);
	});
});

describe('pickableBulkEncounters', () => {
	it('leaves out a preset or a saved encounter with no target', () => {
		const host = hostWith(
			[
				{ name: 'No preset target', encounter: encounter(300, 5, 0) },
				{ name: 'Patchwerk', encounter: encounter(300) },
			],
			{ 'No saved target': encounter(90, 5, 0), Council: encounter(90) },
		);

		expect(pickableBulkEncounters(host).map(entry => entry.name)).toEqual(['Patchwerk', 'Council']);
	});

	it('lists the presets, then the saved encounters, and leaves out a preset with no encounter', () => {
		const host = hostWith(
			[
				{ name: 'Patchwerk', encounter: encounter(300) },
				{ name: 'Empty', encounter: undefined },
			],
			{ Council: encounter(90), Patchwerk: encounter(120) },
		);

		expect(pickableBulkEncounters(host).map(entry => [entry.name, entry.ref.preset, entry.encounter.duration])).toEqual([
			['Patchwerk', true, 300],
			['Council', false, 90],
			['Patchwerk', false, 120],
		]);
	});
});
