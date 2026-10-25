import { APLRotation } from '@generated/proto/apl';
import { ItemSlot } from '@generated/proto/common';
import { SavedSettings } from '@generated/proto/ui';
import type { BulkEncounterResults, BulkPlayerSettingsSetup, BulkRankedResult } from '@sim/bulk/types';
import { ActionId } from '@sim/proto/action_id';
import type { EquippedItem } from '@sim/proto/equipped_item';
import type { Gear } from '@sim/proto/gear';
import { Stats } from '@sim/proto/stats';
import { stDevToConf95 } from '@sim/utils/math';
import { CURRENT_ROTATION_SETUP, CURRENT_TALENT_SETUP } from '@testing/storybook/fixtures/bulk-compare';
import { describe, expect, it } from 'vitest';

import { bulkResultsCsv } from './results_csv';

const SLOTS = [ItemSlot.ItemSlotHead, ItemSlot.ItemSlotMainHand];

const equipped = (id: number, name: string, enchant?: { name: string; effectId: number }, suffix?: { id: number; name: string }) =>
	({ id, item: { id, name }, enchant: enchant ?? null, randomSuffix: suffix ?? null }) as unknown as EquippedItem;

// A gear set over two slots; sets are equal when they are the same object.
const gear = (head: EquippedItem | null, mainHand: EquippedItem | null): Gear => {
	const set = {
		getItemSlots: () => SLOTS,
		getEquippedItem: (slot: ItemSlot) => (slot === ItemSlot.ItemSlotHead ? head : mainHand),
		equals: (other: Gear) => other === set,
	};
	return set as unknown as Gear;
};

const GEAR_MODE: Pick<BulkRankedResult, 'rotation' | 'gearSetup'> = { rotation: CURRENT_ROTATION_SETUP, gearSetup: null };

const result = (set: Gear, avg: number, stdev = 0, talents = CURRENT_TALENT_SETUP, build = GEAR_MODE): BulkRankedResult => ({
	gear: set,
	dpsMetrics: { avg, stdev } as never,
	talents,
	...build,
});

const ARMS = '3030500130';
const LIVE = CURRENT_TALENT_SETUP.talentsString;

const LIONHEART = equipped(12640, 'Lionheart Helm');
const THUNDERFURY = equipped(19019, 'Thunderfury, Blessed Blade of the Windseeker', { name: 'Crusader', effectId: 1900 });
const BEAR_HELM = equipped(10001, 'Helm of "the" Wild', undefined, { id: 23, name: 'of the Bear' });
const ASHKANDI = equipped(19364, 'Ashkandi');
const CURRENT_GEAR = gear(LIONHEART, THUNDERFURY);
const UPGRADE = gear(BEAR_HELM, ASHKANDI);

// A timed encounter of 180 ±5 seconds, or a health-based one when `timed` is false.
const entry = (
	name: string,
	isCurrent: boolean,
	best: number,
	timed = true,
	upgrade = UPGRADE,
	settings: BulkPlayerSettingsSetup | null = null,
): BulkEncounterResults => {
	const base = result(CURRENT_GEAR, 1000, 10);
	return {
		name,
		isCurrent,
		duration: timed ? 180 : null,
		durationVariation: timed ? 5 : null,
		settings,
		results: { chains: [[result(upgrade, best, 10)], [base]], originalGearResults: base, iterations: 100, talentPairs: 1 },
	};
};

const lines = (csv: string) => csv.trimEnd().split('\n');

describe('bulkResultsCsv', () => {
	it('heads the file with the result columns, then four columns per gear slot', () => {
		expect(lines(bulkResultsCsv([entry('', true, 1100)]))[0]).toBe(
			[
				'encounter,settings,duration,variation,rank,current_gear,dps,dps_margin_95,diff,diff_pct,talents,talents_string,gear_set,enchant_preset,rotation',
				'slots.head,slots.head wowhead,slots.head item id,slots.head enchant id',
				'slots.main_hand,slots.main_hand wowhead,slots.main_hand item id,slots.main_hand enchant id',
			].join(','),
		);
	});

	it('writes one row per ranked set of every encounter, in ranked order, with the length in seconds', () => {
		const rows = lines(bulkResultsCsv([entry('', true, 1100), entry('Patchwerk', false, 1050, false)])).slice(1);

		expect(rows.map(row => row.split(',').slice(0, 6))).toEqual([
			['bulk_tab.results.current', '', '180', '5', '1', ''],
			['bulk_tab.results.current', '', '180', '5', '2', 'yes'],
			['Patchwerk', '', '', '', '1', ''],
			['Patchwerk', '', '', '', '2', 'yes'],
		]);
	});

	it('keeps the DPS and the difference from the current gear at full precision', () => {
		const [, upgrade, current] = lines(bulkResultsCsv([entry('', true, 1036.125)]));

		expect(upgrade.split(',').slice(6, 10)).toEqual(['1036.125', String(stDevToConf95(10, 100)), '36.125', '3.6125']);
		expect(current.split(',').slice(8, 10)).toEqual(['0', '0']);
	});

	it('writes each slot as its name, wowhead link, item id and enchant id, quoting names holding commas or quotes', () => {
		const [, upgrade, current] = lines(bulkResultsCsv([entry('', true, 1100)]));
		const link = (id: number, suffixId?: number) => ActionId.makeItemUrl(id, suffixId);

		const thunderfury = `"Thunderfury, Blessed Blade of the Windseeker (Crusader)",${link(19019)},19019,1900`;
		expect(upgrade.endsWith(`,"Helm of ""the"" Wild of the Bear",${link(10001, 23)},10001,,Ashkandi,${link(19364)},19364,`)).toBe(true);
		expect(current.endsWith(`,Lionheart Helm,${link(12640)},12640,,${thunderfury}`)).toBe(true);
	});

	it('links a suffixed item to wowhead with the suffix as its bonus', () => {
		const [, upgrade] = lines(bulkResultsCsv([entry('', true, 1100)]));

		expect(upgrade).toMatch(/,https:\/\/wowhead\.com\/forever\/item=10001\?level=\d+&bonus=23,10001,/);
	});

	it('adds the talent setup’s name and string to every row', () => {
		const arms = { name: 'Arms', talentsString: ARMS, isCurrent: false };
		const base = result(CURRENT_GEAR, 1000, 10);
		const twoSetups: BulkEncounterResults = {
			name: '',
			isCurrent: true,
			duration: 180,
			durationVariation: 5,
			settings: null,
			results: {
				chains: [[result(UPGRADE, 1100, 10, arms)], [result(CURRENT_GEAR, 1050, 10, arms)], [base]],
				originalGearResults: base,
				iterations: 100,
				talentPairs: 2,
			},
		};
		const [header, ...rows] = lines(bulkResultsCsv([twoSetups]));

		expect(header.split(',').slice(10, 12)).toEqual(['talents', 'talents_string']);
		expect(rows.map(row => row.split(',').slice(10, 12))).toEqual([
			['Arms', ARMS],
			['Arms', ARMS],
			['bulk_tab.results.current_talents', LIVE],
		]);
	});

	it('leaves all four cells of an empty slot empty', () => {
		const [, upgrade] = lines(bulkResultsCsv([entry('', true, 1100, true, gear(null, ASHKANDI))]));

		expect(upgrade).toContain(`,,,,,Ashkandi,${ActionId.makeItemUrl(19364)},19364,`);
	});

	it('heads the file with settings after encounter and gear set, enchant preset and rotation after the talents string', () => {
		const header = lines(bulkResultsCsv([entry('', true, 1100)]))[0].split(',');

		expect(header.slice(0, 3)).toEqual(['encounter', 'settings', 'duration']);
		expect(header.slice(11, 15)).toEqual(['talents_string', 'gear_set', 'enchant_preset', 'rotation']);
	});

	it('writes each row’s settings, gear set, enchant preset and rotation, empty for a Gear-mode row', () => {
		const healer: BulkPlayerSettingsSetup = { name: 'Healer', isCurrent: false, settings: SavedSettings.create() };
		const opener = { name: 'Opener', isCurrent: false, rotation: APLRotation.create() };
		const raid = { gearSet: 'Raid', enchantPreset: 'Undead', gear: UPGRADE, bonusStats: new Stats() };
		const currentGearSet = { ...raid, gearSet: '', gear: CURRENT_GEAR };
		const base = result(CURRENT_GEAR, 1000, 10);
		const builds: BulkEncounterResults = {
			...entry('Patchwerk', false, 1100),
			settings: healer,
			results: {
				chains: [
					[result(UPGRADE, 1100, 10, CURRENT_TALENT_SETUP, { rotation: opener, gearSetup: raid })],
					[result(CURRENT_GEAR, 1050, 10, CURRENT_TALENT_SETUP, { rotation: CURRENT_ROTATION_SETUP, gearSetup: currentGearSet })],
					[base],
				],
				originalGearResults: base,
				iterations: 100,
				talentPairs: 1,
			},
		};
		const currentSettings = entry('Patchwerk', false, 1100, true, UPGRADE, { name: '', isCurrent: true, settings: null });
		const rows = lines(bulkResultsCsv([builds, currentSettings, entry('', true, 1100)]))
			.slice(1)
			.map(row => row.split(','));

		expect(rows.map(row => [row[0], row[1], ...row.slice(12, 15)])).toEqual([
			['Patchwerk', 'Healer', 'Raid', 'Undead', 'Opener'],
			['Patchwerk', 'Healer', 'bulk_tab.results.current_gear', 'Undead', 'bulk_tab.results.current_rotation'],
			['Patchwerk', 'Healer', '', '', 'bulk_tab.results.current_rotation'],
			['Patchwerk', 'bulk_tab.builds.pairs.current_settings', '', '', 'bulk_tab.results.current_rotation'],
			['Patchwerk', 'bulk_tab.builds.pairs.current_settings', '', '', 'bulk_tab.results.current_rotation'],
			['bulk_tab.results.current', '', '', '', 'bulk_tab.results.current_rotation'],
			['bulk_tab.results.current', '', '', '', 'bulk_tab.results.current_rotation'],
		]);
	});
});
