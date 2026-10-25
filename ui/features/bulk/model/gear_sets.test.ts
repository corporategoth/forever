import { EquipmentSpec, ItemSlot, ItemSpec, Stat } from '@generated/proto/common';
import { BulkGearSetRef, SavedGearSet } from '@generated/proto/ui';
import type { PresetGear } from '@sim/presets/types';
import type { Gear } from '@sim/proto/gear';
import { Stats } from '@sim/proto/stats';
import { bulkState, loadStoredBulkGearSets } from '@sim/settings/bulk_settings';
import type { IndividualSimHost } from '@sim/sim_host';
import { makeBulkPlayer } from '@testing/sim/bulk_player';
import { compareGearSet } from '@testing/storybook/fixtures/bulk-compare';
import { describe, expect, it, vi } from 'vitest';

import { bulkGearSetEntries, bulkGearSetList, bulkGearSetRuns, formatGearSetSummary, pickableBulkGearSets, setBulkGearSetChecked } from './gear_sets';

vi.mock('@i18n/config', () => ({
	default: { t: (key: string, options?: { count?: number }) => (options?.count === undefined ? key : `${key}:${options.count}`) },
}));

const SAVED_KEY = 'saved-gear';

// The helm id stands for the whole set: the stubbed database turns a spec into the set wearing its first item's id.
const spec = (id: number) => EquipmentSpec.create({ items: [ItemSpec.create({ id })] });

const helmId = (gear: Gear) => gear.getEquippedItem(ItemSlot.ItemSlotHead)?.item.id;

const strength = (value: number) => new Stats().withStat(Stat.StatStrength, value);

const ref = (name: string, preset = false) => BulkGearSetRef.create({ name, preset });

const entry = (name: string, id: number, bonusStats = new Stats(), preset = false) => ({ ref: ref(name, preset), name, gear: compareGearSet(id), bonusStats });

const current = { gear: compareGearSet(1), bonusStats: new Stats() };

const gearPlayer = () => makeBulkPlayer({ sim: { db: { lookupEquipmentSpec: (equipment: EquipmentSpec) => compareGearSet(equipment.items[0]?.id ?? 0) } } });

describe('bulkGearSetEntries', () => {
	it('lists the presets whose condition passes for the player, then the saved sets, in panel order', () => {
		const player = gearPlayer();
		const presets: PresetGear[] = [
			{ name: 'Pre-raid', gear: spec(2) },
			{ name: 'Not for this player', gear: spec(3), enableWhen: () => false },
			{ name: 'Raid', gear: spec(4), enableWhen: candidate => candidate === player },
		];

		const entries = bulkGearSetEntries(presets, [{ name: 'Mine', data: SavedGearSet.create({ gear: spec(5) }) }], player);

		expect(entries.map(e => [e.name, e.ref.preset, helmId(e.gear)])).toEqual([
			['Pre-raid', true, 2],
			['Raid', true, 4],
			['Mine', false, 5],
		]);
	});

	it('gives a preset no bonus stats and a saved set the bonus stats it was saved with', () => {
		const entries = bulkGearSetEntries(
			[{ name: 'Raid', gear: spec(2) }],
			[
				{ name: 'Buffed', data: SavedGearSet.create({ gear: spec(3), bonusStatsStats: strength(10).toProto() }) },
				{ name: 'Plain', data: SavedGearSet.create({ gear: spec(4) }) },
			],
			gearPlayer(),
		);

		expect(entries.map(e => e.bonusStats.getStat(Stat.StatStrength))).toEqual([0, 10, 0]);
		expect(entries[0].bonusStats.equals(new Stats())).toBe(true);
	});
});

describe('pickableBulkGearSets', () => {
	it('reads the sets the Saved Gear panel stores, after the spec presets', () => {
		const player = gearPlayer();
		player.sim.env.storage.setItem(
			SAVED_KEY,
			JSON.stringify({ Mine: SavedGearSet.toJson(SavedGearSet.create({ gear: spec(5), bonusStatsStats: strength(10).toProto() })) }),
		);
		const host = {
			player,
			sim: player.sim,
			individualConfig: { presets: { gear: [{ name: 'Raid', gear: spec(2) }] } },
			getSavedGearStorageKey: () => SAVED_KEY,
		} as unknown as IndividualSimHost<any>;

		expect(pickableBulkGearSets(host).map(e => [e.name, helmId(e.gear), e.bonusStats.getStat(Stat.StatStrength)])).toEqual([
			['Raid', 2, 0],
			['Mine', 5, 10],
		]);
	});

	it('lists a stored set that still carries the removed bonus stats field, as the Saved Gear panel does', () => {
		const player = gearPlayer();
		const old = { ...(SavedGearSet.toJson(SavedGearSet.create({ gear: spec(5) })) as object), bonusStats: [10] };
		player.sim.env.storage.setItem(SAVED_KEY, JSON.stringify({ Old: old }));
		const host = {
			player,
			sim: player.sim,
			individualConfig: { presets: { gear: [] } },
			getSavedGearStorageKey: () => SAVED_KEY,
		} as unknown as IndividualSimHost<any>;

		expect(pickableBulkGearSets(host).map(e => [e.name, helmId(e.gear)])).toEqual([['Old', 5]]);
	});
});

describe('bulkGearSetList', () => {
	it('hides a set equal to the current gear and bonus stats, and lists one equal in gear but not in bonus stats', () => {
		const list = bulkGearSetList(current, [entry('Same', 1), entry('Buffed', 1, strength(10)), entry('Other', 2)], []);

		expect(list.map(item => item.name)).toEqual(['Buffed', 'Other']);
	});

	it('flags a checked set equal to an earlier checked one and skips it in the runs', () => {
		const entries = [entry('Raid', 2, new Stats(), true), entry('Raid copy', 2), entry('Other', 3)];
		const checked = [ref('Raid', true), ref('Raid copy')];

		expect(bulkGearSetList(current, entries, checked).map(item => [item.name, item.checked, item.duplicate])).toEqual([
			['Raid', true, false],
			['Raid copy', true, true],
			['Other', false, false],
		]);
		expect(bulkGearSetRuns(current, entries, checked).map(run => run.name)).toEqual(['', 'Raid']);
	});
});

describe('bulkGearSetRuns', () => {
	it('runs the current gear first, then each checked set in list order', () => {
		const entries = [entry('Raid', 2, new Stats(), true), entry('Buffed', 3, strength(10))];

		const runs = bulkGearSetRuns(current, entries, [ref('Buffed'), ref('Raid', true)]);

		expect(runs).toEqual([
			{ name: '', gear: current.gear, bonusStats: current.bonusStats },
			{ name: 'Raid', gear: entries[0].gear, bonusStats: entries[0].bonusStats },
			{ name: 'Buffed', gear: entries[1].gear, bonusStats: entries[1].bonusStats },
		]);
	});

	it('names a grouped preset by its group and name, and an ungrouped preset or a saved set by its name', () => {
		const grouped = (group: string, id: number) => ({
			...entry('Pre-BiS', id, new Stats(), true),
			ref: BulkGearSetRef.create({ name: 'Pre-BiS', preset: true, group }),
		});
		const entries = [grouped('Fury', 2), grouped('Arms', 3), entry('Raid', 4, new Stats(), true), entry('Mine', 5)];

		const runs = bulkGearSetRuns(
			current,
			entries,
			entries.map(item => item.ref),
		);

		expect(runs.map(run => run.name)).toEqual(['', 'Fury · Pre-BiS', 'Arms · Pre-BiS', 'Raid', 'Mine']);
	});
});

describe('setBulkGearSetChecked', () => {
	it('stores the checked refs in list order so they load back, dropping refs no longer pickable', () => {
		const player = gearPlayer();
		const pickable = [ref('Raid', true), ref('Mine')];
		const { settings } = bulkState(player).v;

		setBulkGearSetChecked(player, ref('Mine'), true, pickable);
		setBulkGearSetChecked(player, ref('Raid', true), true, pickable);

		expect(loadStoredBulkGearSets(player)?.gearSets).toEqual([ref('Raid', true), ref('Mine')]);
		expect(bulkState(player).gearSets).toEqual([ref('Raid', true), ref('Mine')]);
		expect(bulkState(player).v.settings).toBe(settings);

		setBulkGearSetChecked(player, ref('Other'), true, [ref('Raid', true), ref('Other')]);

		expect(bulkState(player).gearSets).toEqual([ref('Raid', true), ref('Other')]);
	});
});

describe('formatGearSetSummary', () => {
	it('counts the items the set wears', () => {
		expect(formatGearSetSummary(compareGearSet(1))).toBe('bulk_tab.settings.gear_sets.items:1');
	});
});
