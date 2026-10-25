import { BulkEnchantSlotOptions } from '@generated/proto/api';
import { EnchantType, HandType, ItemSlot, ItemType, Profession, Stat, WeaponType } from '@generated/proto/common';
import { BulkEnchantPreset, type UIEnchant, type UIItem } from '@generated/proto/ui';
import { Gear } from '@sim/proto/gear';
import { Stats } from '@sim/proto/stats';
import { makeBulkPlayer } from '@testing/sim/bulk_player';
import { makeEquippedItem } from '@testing/storybook/fixtures/gear';
import { makeUIEnchant } from '@testing/storybook/fixtures/protos';
import { describe, expect, it, vi } from 'vitest';

import type { BulkEnchantPick } from './enchant_picks';
import type { BulkGearSetPick } from './gear_sets';
import { bulkGearSetups, gearSetupKey, gearSetupLabel } from './gear_setups';

vi.mock('@i18n/config', () => ({
	default: {
		t: (key: string) =>
			(
				({
					'bulk_tab.results.current_gear': 'Current gear',
					'bulk_tab.settings.enchant_picks.current': 'Own enchants',
				}) as Record<string, string>
			)[key] ?? key,
	},
}));

const enchant = (effectId: number, type: ItemType, overrides: Partial<UIEnchant> = {}) =>
	makeUIEnchant({ effectId, name: `Enchant ${effectId}`, type, ...overrides });

const CLOAK_AGILITY = enchant(849, ItemType.ItemTypeBack);
const CLOAK_ARMOR = enchant(884, ItemType.ItemTypeBack);
const CHEST_STATS = enchant(1891, ItemType.ItemTypeChest);
const CRUSADER = enchant(1900, ItemType.ItemTypeWeapon);
const TWO_HAND_AGILITY = enchant(2646, ItemType.ItemTypeWeapon, { enchantType: EnchantType.EnchantTypeTwoHand });
const SHIELD_STAMINA = enchant(929, ItemType.ItemTypeWeapon, { enchantType: EnchantType.EnchantTypeShield });
const HELD_INTELLECT = enchant(7659, ItemType.ItemTypeWeapon, { enchantType: EnchantType.EnchantTypeOffHand });
const RING_STAMINA = enchant(7301, ItemType.ItemTypeFinger, { requiredProfession: Profession.Enchanting });

const ALL_ENCHANTS = [CLOAK_AGILITY, CLOAK_ARMOR, CHEST_STATS, CRUSADER, TWO_HAND_AGILITY, SHIELD_STAMINA, HELD_INTELLECT, RING_STAMINA];

const USABLE: Partial<Record<ItemSlot, UIEnchant[]>> = {
	[ItemSlot.ItemSlotBack]: [CLOAK_AGILITY, CLOAK_ARMOR],
	[ItemSlot.ItemSlotChest]: [CHEST_STATS],
	[ItemSlot.ItemSlotMainHand]: [CRUSADER, TWO_HAND_AGILITY],
	[ItemSlot.ItemSlotOffHand]: [CRUSADER, SHIELD_STAMINA, HELD_INTELLECT],
	[ItemSlot.ItemSlotFinger1]: [RING_STAMINA],
	[ItemSlot.ItemSlotFinger2]: [RING_STAMINA],
};

// Like the real player, the enchant list leaves out the enchants that need Enchanting when the player lacks it.
const makePlayer = ({ enchanter = true } = {}) =>
	makeBulkPlayer({
		hasProfession: (profession: Profession) => enchanter && profession === Profession.Enchanting,
		getEnchants: (slot: ItemSlot) => (USABLE[slot] ?? []).filter(usable => enchanter || usable.requiredProfession !== Profession.Enchanting),
		sim: { db: { getEnchantsByEffectId: (effectId: number) => ALL_ENCHANTS.filter(row => row.effectId === effectId) } },
	});

const armor = (id: number, type: ItemType): Partial<UIItem> => ({
	id,
	type,
	weaponType: WeaponType.WeaponTypeUnknown,
	handType: HandType.HandTypeUnknown,
	unique: false,
});

const weapon = (id: number, weaponType: WeaponType, handType: HandType): Partial<UIItem> => ({ id, type: ItemType.ItemTypeWeapon, weaponType, handType });

const CLOAK = armor(101, ItemType.ItemTypeBack);
const CHEST = armor(102, ItemType.ItemTypeChest);
const RING_A = armor(103, ItemType.ItemTypeFinger);
const RING_B = armor(104, ItemType.ItemTypeFinger);
const SWORD = weapon(105, WeaponType.WeaponTypeSword, HandType.HandTypeOneHand);
const OFF_HAND_SWORD = weapon(106, WeaponType.WeaponTypeSword, HandType.HandTypeOneHand);
const HELD = weapon(107, WeaponType.WeaponTypeOffHand, HandType.HandTypeOffHand);

const gearOf = (items: Array<[ItemSlot, Partial<UIItem>, UIEnchant?]>) =>
	new Gear(Object.fromEntries(items.map(([slot, item, worn]) => [slot, makeEquippedItem({ item, enchant: worn })])));

const enchantIn = (gear: Gear, slot: ItemSlot) => gear.getEquippedItem(slot)?.enchant?.effectId ?? null;

const currentSet = (gear: Gear, bonusStats = new Stats()): BulkGearSetPick => ({ name: '', isCurrent: true, gear, bonusStats });

const savedSet = (name: string, gear: Gear, bonusStats = new Stats()): BulkGearSetPick => ({ name, isCurrent: false, gear, bonusStats });

const OWN: BulkEnchantPick = { name: '', preset: null };

const presetPick = (name: string, slots: Array<[ItemSlot, number[]]>): BulkEnchantPick => ({
	name,
	preset: BulkEnchantPreset.create({ name, slots: slots.map(([slot, effectIds]) => BulkEnchantSlotOptions.create({ slot, effectIds })) }),
});

describe('bulkGearSetups', () => {
	it('puts the preset’s enchant on the slots it covers and keeps the set’s own elsewhere', () => {
		const gear = gearOf([
			[ItemSlot.ItemSlotBack, CLOAK, CLOAK_ARMOR],
			[ItemSlot.ItemSlotChest, CHEST, CHEST_STATS],
		]);

		const setups = bulkGearSetups(makePlayer(), [currentSet(gear)], [OWN, presetPick('Raid', [[ItemSlot.ItemSlotBack, [CLOAK_AGILITY.effectId]]])]);

		expect(setups.map(setup => [setup.enchantPreset, enchantIn(setup.gear, ItemSlot.ItemSlotBack), enchantIn(setup.gear, ItemSlot.ItemSlotChest)])).toEqual(
			[
				['', CLOAK_ARMOR.effectId, CHEST_STATS.effectId],
				['Raid', CLOAK_AGILITY.effectId, CHEST_STATS.effectId],
			],
		);
	});

	it('crosses two enchants in one slot into two setups', () => {
		const gear = gearOf([[ItemSlot.ItemSlotBack, CLOAK]]);
		const twoCloakEnchants = presetPick('Cloaks', [[ItemSlot.ItemSlotBack, [CLOAK_ARMOR.effectId, CLOAK_AGILITY.effectId]]]);

		const setups = bulkGearSetups(makePlayer(), [currentSet(gear)], [OWN, twoCloakEnchants]);

		expect(setups.map(setup => [setup.enchantPreset, enchantIn(setup.gear, ItemSlot.ItemSlotBack)])).toEqual([
			['', null],
			['Cloaks', CLOAK_AGILITY.effectId],
			['Cloaks', CLOAK_ARMOR.effectId],
		]);
	});

	it('puts a Main Hand enchant on both hands and a Finger 1 enchant on both rings', () => {
		const gear = gearOf([
			[ItemSlot.ItemSlotMainHand, SWORD],
			[ItemSlot.ItemSlotOffHand, OFF_HAND_SWORD],
			[ItemSlot.ItemSlotFinger1, RING_A],
			[ItemSlot.ItemSlotFinger2, RING_B],
		]);
		const preset = presetPick('Raid', [
			[ItemSlot.ItemSlotMainHand, [CRUSADER.effectId]],
			[ItemSlot.ItemSlotFinger1, [RING_STAMINA.effectId]],
		]);

		const [, raid] = bulkGearSetups(makePlayer(), [currentSet(gear)], [OWN, preset]);

		expect(
			[ItemSlot.ItemSlotMainHand, ItemSlot.ItemSlotOffHand, ItemSlot.ItemSlotFinger1, ItemSlot.ItemSlotFinger2].map(slot => enchantIn(raid.gear, slot)),
		).toEqual([CRUSADER.effectId, CRUSADER.effectId, RING_STAMINA.effectId, RING_STAMINA.effectId]);
	});

	it('skips an enchant that does not fit the item, keeping the set’s own there', () => {
		const gear = gearOf([
			[ItemSlot.ItemSlotBack, CLOAK],
			[ItemSlot.ItemSlotMainHand, SWORD, CRUSADER],
			[ItemSlot.ItemSlotOffHand, HELD, HELD_INTELLECT],
		]);
		const preset = presetPick('Mixed', [
			[ItemSlot.ItemSlotBack, [CLOAK_AGILITY.effectId]],
			[ItemSlot.ItemSlotMainHand, [TWO_HAND_AGILITY.effectId]],
			[ItemSlot.ItemSlotOffHand, [SHIELD_STAMINA.effectId]],
		]);

		const setups = bulkGearSetups(makePlayer(), [currentSet(gear)], [OWN, preset]);

		expect(setups).toHaveLength(2);
		expect([ItemSlot.ItemSlotBack, ItemSlot.ItemSlotMainHand, ItemSlot.ItemSlotOffHand].map(slot => enchantIn(setups[1].gear, slot))).toEqual([
			CLOAK_AGILITY.effectId,
			CRUSADER.effectId,
			HELD_INTELLECT.effectId,
		]);
	});

	it('collapses a preset that fits nothing onto the set itself', () => {
		const gear = gearOf([
			[ItemSlot.ItemSlotMainHand, SWORD],
			[ItemSlot.ItemSlotOffHand, HELD],
		]);
		const shieldOnly = presetPick('Shield', [[ItemSlot.ItemSlotOffHand, [SHIELD_STAMINA.effectId]]]);

		expect(bulkGearSetups(makePlayer(), [currentSet(gear)], [OWN, shieldOnly]).length).toBe(1);
	});

	it('leaves ring enchants out for a player without Enchanting', () => {
		const gear = gearOf([
			[ItemSlot.ItemSlotBack, CLOAK],
			[ItemSlot.ItemSlotFinger1, RING_A, RING_STAMINA],
			[ItemSlot.ItemSlotFinger2, RING_B],
		]);
		const preset = presetPick('Raid', [
			[ItemSlot.ItemSlotBack, [CLOAK_AGILITY.effectId]],
			[ItemSlot.ItemSlotFinger1, [RING_STAMINA.effectId]],
		]);

		const setups = bulkGearSetups(makePlayer({ enchanter: false }), [currentSet(gear)], [OWN, preset]);

		expect(
			setups.map(setup => [
				setup.enchantPreset,
				enchantIn(setup.gear, ItemSlot.ItemSlotBack),
				enchantIn(setup.gear, ItemSlot.ItemSlotFinger1),
				enchantIn(setup.gear, ItemSlot.ItemSlotFinger2),
			]),
		).toEqual([
			['', null, null, null],
			['Raid', CLOAK_AGILITY.effectId, null, null],
		]);
	});

	it('runs the current gear with its own enchants first and drops a later setup equal to an earlier one', () => {
		const agility = presetPick('Agility', [[ItemSlot.ItemSlotBack, [CLOAK_AGILITY.effectId]]]);
		const sets = [
			currentSet(gearOf([[ItemSlot.ItemSlotBack, CLOAK, CLOAK_ARMOR]])),
			savedSet('Agile', gearOf([[ItemSlot.ItemSlotBack, CLOAK, CLOAK_AGILITY]])),
		];

		const setups = bulkGearSetups(makePlayer(), sets, [OWN, agility]);

		expect(setups.map(setup => [setup.gearSet, setup.enchantPreset, setup.isCurrent])).toEqual([
			['', '', true],
			['', 'Agility', false],
		]);
	});

	it('keeps two setups with the same gear and different bonus stats', () => {
		const gear = gearOf([[ItemSlot.ItemSlotBack, CLOAK]]);
		const buffed = savedSet('Buffed', gear, new Stats().withStat(Stat.StatStrength, 10));

		const setups = bulkGearSetups(makePlayer(), [currentSet(gear), buffed], [OWN]);

		expect(setups.map(setup => setup.gearSet)).toEqual(['', 'Buffed']);
		expect(gearSetupKey(setups[0])).not.toBe(gearSetupKey(setups[1]));
	});
});

describe('gearSetupLabel', () => {
	it('labels a setup by its gear set and enchant preset', () => {
		const gear = gearOf([[ItemSlot.ItemSlotBack, CLOAK]]);
		const [own, setup] = bulkGearSetups(makePlayer(), [currentSet(gear)], [OWN, presetPick('Raid', [[ItemSlot.ItemSlotBack, [CLOAK_AGILITY.effectId]]])]);

		expect(gearSetupLabel(setup)).toBe('Current gear · Raid');
		expect(gearSetupLabel(own)).toBe('Current gear · Own enchants');
	});
});
