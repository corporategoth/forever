import { EquipmentSpec, UnitStats } from '@generated/proto/common';
import { BulkGearSetRef, BulkGearSetSelection, SavedGearSet } from '@generated/proto/ui';
import i18n from '@i18n/config';
import type { Player } from '@sim/player/player';
import type { PresetGear } from '@sim/presets/types';
import type { Gear } from '@sim/proto/gear';
import { getGearIdentityKey } from '@sim/proto/items';
import { Stats } from '@sim/proto/stats';
import { bulkState, patchBulkState, storeBulkGearSets } from '@sim/settings/bulk_settings';
import type { IndividualSimHost } from '@sim/sim_host';

import { checkedRefList, checkedRefsAfter, storedSavedData } from './saved_refs';

export interface BulkGearSetEntry {
	ref: BulkGearSetRef;
	name: string;
	gear: Gear;
	bonusStats: Stats;
}

export interface BulkGearSetPick {
	name: string;
	gear: Gear;
	bonusStats: Stats;
}

type GearAndBonusStats = Pick<BulkGearSetPick, 'gear' | 'bonusStats'>;

// Two sets with the same items but other bonus stats sim differently, so both have to match.
export const sameGearSet = (a: GearAndBonusStats, b: GearAndBonusStats): boolean =>
	getGearIdentityKey(a.gear.asSpec()) === getGearIdentityKey(b.gear.asSpec()) && a.bonusStats.equals(b.bonusStats);

const entry = (name: string, preset: boolean, gear: Gear, bonusStats: Stats): BulkGearSetEntry => ({
	ref: BulkGearSetRef.create({ name, preset }),
	name,
	gear,
	bonusStats,
});

// Presets first, the ones the player can load, then the user's saved sets in the order the Saved Gear panel lists them.
// A preset brings no bonus stats, and its `onLoad` never runs here.
export const bulkGearSetEntries = (
	presets: readonly PresetGear[],
	saved: ReadonlyArray<{ name: string; data: SavedGearSet }>,
	player: Player<any>,
): BulkGearSetEntry[] => [
	...presets
		.filter(preset => !preset.enableWhen || preset.enableWhen(player))
		.map(preset => entry(preset.name, true, player.sim.db.lookupEquipmentSpec(preset.gear), new Stats())),
	...saved.map(({ name, data }) =>
		entry(name, false, player.sim.db.lookupEquipmentSpec(data.gear ?? EquipmentSpec.create()), Stats.fromProto(data.bonusStatsStats ?? UnitStats.create())),
	),
];

export const pickableBulkGearSets = (host: IndividualSimHost<any>): BulkGearSetEntry[] =>
	bulkGearSetEntries(
		host.individualConfig.presets.gear,
		storedSavedData(host, host.getSavedGearStorageKey(), SavedGearSet, { ignoreUnknownFields: true }),
		host.player,
	);

// The rows the Gear sets list shows, in list order. One equal to the current gear and bonus stats is left out, since the
// current one runs anyway; a checked one equal to an earlier checked row is flagged. A checked ref whose set no longer
// exists has no row.
export const bulkGearSetList = (current: GearAndBonusStats, entries: readonly BulkGearSetEntry[], checked: readonly BulkGearSetRef[]) =>
	checkedRefList(entries, checked, entry => sameGearSet(entry, current), sameGearSet);

// The current gear runs first, unnamed, then every checked row the list neither leaves out nor flags.
export const bulkGearSetRuns = (current: GearAndBonusStats, entries: readonly BulkGearSetEntry[], checked: readonly BulkGearSetRef[]): BulkGearSetPick[] => [
	{ name: '', gear: current.gear, bonusStats: current.bonusStats },
	...bulkGearSetList(current, entries, checked)
		.filter(item => item.checked && !item.duplicate)
		.map(({ name, gear, bonusStats }) => ({ name, gear, bonusStats })),
];

// No `settings` bump: the gear sets change neither the Gear mode's combination count nor the stored BulkSettings.
export const setBulkGearSetChecked = (player: Player<any>, ref: BulkGearSetRef, checked: boolean, pickable: readonly BulkGearSetRef[]) => {
	const gearSets = checkedRefsAfter(bulkState(player).gearSets, ref, checked, pickable);
	patchBulkState(player, { gearSets });
	storeBulkGearSets(player, BulkGearSetSelection.create({ gearSets }));
};

export const formatGearSetSummary = (gear: Gear): string =>
	i18n.t('bulk_tab.settings.gear_sets.items', { count: gear.asArray().filter(item => item != null).length });
