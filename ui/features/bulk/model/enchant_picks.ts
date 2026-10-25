import { type BulkEnchantPreset, BulkEnchantPresetSelection } from '@generated/proto/ui';
import i18n from '@i18n/config';
import type { Player } from '@sim/player/player';
import { bulkState, patchBulkState, storeBulkBuildEnchantPresets } from '@sim/settings/bulk_settings';

import { checkedRefList, type SavedRef } from './saved_refs';

export interface BulkEnchantPickEntry {
	/** Enchant presets are the user's own, so `preset` is always false. */
	ref: SavedRef;
	name: string;
	preset: BulkEnchantPreset;
}

export interface BulkEnchantPick {
	/** Empty, with a null preset, for the gear set's own enchants. */
	name: string;
	preset: BulkEnchantPreset | null;
}

const filledSlots = (preset: BulkEnchantPreset) => preset.slots.filter(options => options.effectIds.length > 0);

// The order a preset lists its slots and enchants in changes nothing it applies.
const enchantsKey = (preset: BulkEnchantPreset) =>
	JSON.stringify(
		filledSlots(preset)
			.map(({ slot, effectIds }) => [slot, [...effectIds].sort((a, b) => a - b)] as const)
			.sort(([a], [b]) => a - b),
	);

const refOf = (name: string): SavedRef => ({ name, preset: false });

export const bulkEnchantPickEntries = (presets: readonly BulkEnchantPreset[]): BulkEnchantPickEntry[] =>
	presets.map(preset => ({ ref: refOf(preset.name), name: preset.name, preset }));

// The rows the Enchant presets list shows, in list order. One with no enchants is left out, since it runs as the set's
// own enchants; a checked one holding the same enchants as an earlier checked row is flagged.
export const bulkEnchantPickList = (entries: readonly BulkEnchantPickEntry[], checked: readonly string[]) =>
	checkedRefList(
		entries,
		checked.map(refOf),
		entry => filledSlots(entry.preset).length === 0,
		(a, b) => enchantsKey(a.preset) === enchantsKey(b.preset),
	);

// The gear set's own enchants run first, then every checked row the list neither leaves out nor flags.
export const bulkEnchantPickRuns = (entries: readonly BulkEnchantPickEntry[], checked: readonly string[]): BulkEnchantPick[] => [
	{ name: '', preset: null },
	...bulkEnchantPickList(entries, checked)
		.filter(item => item.checked && !item.duplicate)
		.map(({ name, preset }) => ({ name, preset })),
];

// Stored apart from `BulkEnchantPreset.checked`, the Gear mode's pick, so no `settings` bump. Names go in list order, and
// one no longer pickable goes.
export const setBulkEnchantPickChecked = (player: Player<any>, name: string, checked: boolean, pickable: readonly string[]) => {
	const stored = bulkState(player).buildEnchantPresets;
	const buildEnchantPresets = pickable.filter(item => (item === name ? checked : stored.includes(item)));
	patchBulkState(player, { buildEnchantPresets });
	storeBulkBuildEnchantPresets(player, BulkEnchantPresetSelection.create({ names: buildEnchantPresets }));
};

export const formatEnchantPickSummary = (preset: BulkEnchantPreset): string =>
	i18n.t('bulk_tab.settings.enchant_picks.slots', { count: filledSlots(preset).length });
