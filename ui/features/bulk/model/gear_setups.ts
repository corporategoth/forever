import { presetSlotEffectIds } from '@features/enchant-presets/model/enchant_presets';
import { ItemSlot, UnitStats } from '@generated/proto/common';
import type { BulkEnchantPreset, UIEnchant } from '@generated/proto/ui';
import i18n from '@i18n/config';
import type { BulkGearSetup } from '@sim/bulk/types';
import type { Player } from '@sim/player/player';
import type { EquippedItem } from '@sim/proto/equipped_item';
import { Gear } from '@sim/proto/gear';
import { canEquipEnchant, enchantAppliesToItem, getGearIdentityKey } from '@sim/proto/items';
import type { Stats } from '@sim/proto/stats';

import type { BulkEnchantPick } from './enchant_picks';
import type { BulkGearSetPick } from './gear_sets';

export const bonusStatsKey = (bonusStats: Stats): string => UnitStats.toJsonString(bonusStats.toProto());

const gearSetupKey = (setup: Pick<BulkGearSetup, 'gear' | 'bonusStats'>): string =>
	`${getGearIdentityKey(setup.gear.asSpec())}|${bonusStatsKey(setup.bonusStats)}`;

// The slot's enchant list as Gear mode reads it, with Enchanting taken as known: each request drops the ring enchants
// by its own professions.
const slotEnchants = (player: Player<any>, slot: ItemSlot): UIEnchant[] =>
	player.sim.db.getEnchants(slot).filter(enchant => canEquipEnchant(enchant, player.getPlayerSpec(), true));

// Every slot the preset holds a fitting enchant for takes one of them, in every combination; the other slots keep the
// set's own enchant.
const enchantVariants = (player: Player<any>, gear: Gear, preset: BulkEnchantPreset): Gear[] => {
	const slotChoices = gear.getItemSlots().flatMap(slot => {
		const equipped = gear.getEquippedItem(slot);
		if (!equipped) return [];
		const rows = slotEnchants(player, slot);
		const items = presetSlotEffectIds([preset], slot).flatMap((effectId): EquippedItem[] => {
			const enchant = rows.find(row => row.effectId === effectId && enchantAppliesToItem(row, equipped.item));
			return enchant ? [equipped.withEnchant(enchant)] : [];
		});
		return items.length ? [{ slot, items }] : [];
	});

	let variants = [gear];
	for (const { slot, items } of slotChoices) {
		// Set in place: `withEquippedItem` would unequip the other ring of a shared limit category.
		variants = variants.flatMap(variant =>
			items.map(item => {
				const slots = variant.asMap();
				slots[slot] = item;
				return new Gear(slots);
			}),
		);
	}
	return variants;
};

const firstOfEachKey = (setups: readonly BulkGearSetup[]): BulkGearSetup[] => {
	const seen = new Set<string>();
	return setups.filter(setup => {
		const key = gearSetupKey(setup);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

// Gear set major. A setup equal to an earlier one, such as a preset that fits nothing on a set, is dropped.
export const bulkGearSetups = (player: Player<any>, gearSets: readonly BulkGearSetPick[], enchantPicks: readonly BulkEnchantPick[]): BulkGearSetup[] =>
	firstOfEachKey(
		gearSets.flatMap(gearSet =>
			enchantPicks.flatMap(({ name, preset }) =>
				enchantVariants(player, gearSet.gear, preset).map(gear => ({
					gearSet: gearSet.name,
					enchantPreset: name,
					gear,
					bonusStats: gearSet.bonusStats,
				})),
			),
		),
	);

// Without Enchanting the request drops the ring enchants, so setups that become equal run as the first of them. Each
// keeps the gear it holds as `ownGear`.
export const gearSetupsSentWith = (setups: readonly BulkGearSetup[], isEnchanter: boolean): BulkGearSetup[] =>
	firstOfEachKey(isEnchanter ? setups : setups.map(setup => ({ ...setup, gear: setup.gear.withoutEnchanting(), ownGear: setup.gear })));

export const gearSetupNames = (setup: BulkGearSetup): { gearSet: string; enchantPreset: string } => ({
	gearSet: setup.gearSet || i18n.t('bulk_tab.results.current_gear'),
	enchantPreset: setup.enchantPreset,
});

export const gearSetupLabel = (setup: BulkGearSetup): string => {
	const { gearSet, enchantPreset } = gearSetupNames(setup);
	return `${gearSet} · ${enchantPreset}`;
};
