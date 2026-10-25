import { enchantPresetSlotIds } from '@features/enchant-presets/model/enchant_presets';
import { Profession, UnitStats } from '@generated/proto/common';
import type { BulkEnchantPreset } from '@generated/proto/ui';
import i18n from '@i18n/config';
import type { BulkGearSetup } from '@sim/bulk/types';
import type { Player } from '@sim/player/player';
import type { EquippedItem } from '@sim/proto/equipped_item';
import { Gear } from '@sim/proto/gear';
import { enchantAppliesToItem, getGearIdentityKey } from '@sim/proto/items';
import type { Stats } from '@sim/proto/stats';

import type { BulkEnchantPick } from './enchant_picks';
import type { BulkGearSetPick } from './gear_sets';

export const bonusStatsKey = (bonusStats: Stats): string => UnitStats.toJsonString(bonusStats.toProto());

export const gearSetupKey = (setup: Pick<BulkGearSetup, 'gear' | 'bonusStats'>): string =>
	`${getGearIdentityKey(setup.gear.asSpec())}|${bonusStatsKey(setup.bonusStats)}`;

// Without Enchanting the request drops the ring enchants, so setups compare as the baseline it sends.
const asSent = (player: Player<any>, gear: Gear): Gear => (player.hasProfession(Profession.Enchanting) ? gear : gear.withoutEnchanting());

// Every slot the preset holds a fitting enchant for takes one of them, in every combination; the other slots keep the
// set's own enchant.
const enchantVariants = (player: Player<any>, gear: Gear, preset: BulkEnchantPreset): Gear[] => {
	const slotChoices = gear.getItemSlots().flatMap(slot => {
		const equipped = gear.getEquippedItem(slot);
		if (!equipped) return [];
		const items = enchantPresetSlotIds(player, [preset], slot).flatMap((effectId): EquippedItem[] => {
			const enchant = player.sim.db.getEnchantsByEffectId(effectId).find(row => enchantAppliesToItem(row, equipped.item));
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
	return variants.map(variant => asSent(player, variant));
};

// Gear set major, so with the picks' current entries first the current gear with its own enchants leads. A setup equal
// to an earlier one, such as a preset that fits nothing on a set, is dropped.
export const bulkGearSetups = (player: Player<any>, gearSets: readonly BulkGearSetPick[], enchantPicks: readonly BulkEnchantPick[]): BulkGearSetup[] => {
	const seen = new Set<string>();
	return gearSets
		.flatMap(gearSet =>
			enchantPicks.flatMap(({ name, preset }) =>
				(preset ? enchantVariants(player, gearSet.gear, preset) : [asSent(player, gearSet.gear)]).map(gear => ({
					gearSet: gearSet.name,
					enchantPreset: preset ? name : '',
					isCurrent: gearSet.isCurrent && !preset,
					gear,
					bonusStats: gearSet.bonusStats,
				})),
			),
		)
		.filter(setup => {
			const key = gearSetupKey(setup);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
};

export const gearSetupNames = (setup: BulkGearSetup): { gearSet: string; enchantPreset: string } => ({
	gearSet: setup.gearSet || i18n.t('bulk_tab.results.current_gear'),
	enchantPreset: setup.enchantPreset || i18n.t('bulk_tab.settings.enchant_picks.current'),
});

export const gearSetupLabel = (setup: BulkGearSetup): string => {
	const { gearSet, enchantPreset } = gearSetupNames(setup);
	return `${gearSet} · ${enchantPreset}`;
};
