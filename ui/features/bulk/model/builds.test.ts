import { APLAction, APLListItem, APLRotation, APLRotation_Type as APLRotationType, APLValue, SimpleRotation } from '@generated/proto/apl';
import { Encounter, ItemSlot, ItemType, Profession, Stat, Target, UUID } from '@generated/proto/common';
import { SavedSettings, type UIEnchant } from '@generated/proto/ui';
import type { BulkEncounterPairSetup, BulkGearSetup, BulkRotationSetup, BulkTalentPairSetup, BulkTalentSetup } from '@sim/bulk/types';
import { Gear } from '@sim/proto/gear';
import { Stats } from '@sim/proto/stats';
import { bulkSimHighStageFloor } from '@sim/wasm/bulk_sim/estimate';
import { makeEquippedItem } from '@testing/storybook/fixtures/gear';
import { makeUIEnchant } from '@testing/storybook/fixtures/protos';
import { describe, expect, it, vi } from 'vitest';

import { type BulkBuildReference, bulkBuildRuns, bulkBuildsCount, bulkBuildStep, type ResolveBuildRotation } from './builds';

vi.mock('@i18n/config', () => ({
	default: { t: (key: string, options?: { count?: number }) => (options?.count === undefined ? key : `${key}:${options.count}`) },
}));

const RING_STAMINA = makeUIEnchant({ effectId: 7301, type: ItemType.ItemTypeFinger, requiredProfession: Profession.Enchanting });
const RING_AGILITY = makeUIEnchant({ effectId: 7302, type: ItemType.ItemTypeFinger, requiredProfession: Profession.Enchanting });

const gearOf = (mainHand: number, offHand?: number, ringEnchant?: UIEnchant) =>
	new Gear({
		[ItemSlot.ItemSlotMainHand]: makeEquippedItem({ item: { id: mainHand } }),
		...(offHand ? { [ItemSlot.ItemSlotOffHand]: makeEquippedItem({ item: { id: offHand } }) } : {}),
		...(ringEnchant
			? { [ItemSlot.ItemSlotFinger1]: makeEquippedItem({ item: { id: 50, type: ItemType.ItemTypeFinger, unique: false }, enchant: ringEnchant }) }
			: {}),
	});

const CURRENT_GEAR = gearOf(1, 2);
const TWO_HAND_GEAR = gearOf(3);
const OTHER_DUAL_WIELD_GEAR = gearOf(4, 2);

const NO_BONUS = new Stats();
const STRENGTH_BONUS = new Stats().withStat(Stat.StatStrength, 10);
const LIVE_BONUS = new Stats().withStat(Stat.StatAgility, 5);

const setupOf = (gearSet: string, gear: Gear, bonusStats = NO_BONUS, enchantPreset = 'Raid'): BulkGearSetup => ({ gearSet, enchantPreset, gear, bonusStats });

const referenceOf = (overrides: Partial<BulkBuildReference> = {}): BulkBuildReference => ({
	gear: CURRENT_GEAR,
	bonusStats: NO_BONUS,
	isEnchanter: true,
	...overrides,
});

const rotationOf = (type: APLRotationType, notes = '', uuid = '') =>
	APLRotation.create({
		type,
		priorityList: notes
			? [
					APLListItem.create({
						notes,
						action: uuid ? APLAction.create({ condition: APLValue.create({ uuid: UUID.create({ value: uuid }) }) }) : undefined,
					}),
				]
			: [],
	});

const CURRENT_TALENTS: BulkTalentSetup = { name: '', talentsString: '111', isCurrent: true };
const ARMS_TALENTS: BulkTalentSetup = { name: 'Arms', talentsString: '222', isCurrent: false };

const CURRENT_ROTATION: BulkRotationSetup = { name: '', isCurrent: true, rotation: rotationOf(APLRotationType.TypeAuto) };
const CUSTOM_ROTATION: BulkRotationSetup = { name: 'Custom', isCurrent: false, rotation: rotationOf(APLRotationType.TypeAPL, 'custom', 'original') };

const simpleRotation = (name: string, specRotationJson: string): BulkRotationSetup => ({
	name,
	isCurrent: false,
	rotation: APLRotation.create({ type: APLRotationType.TypeSimple, simple: SimpleRotation.create({ specRotationJson }) }),
});

const talentPair = (talents: BulkTalentSetup, rotation: BulkRotationSetup): BulkTalentPairSetup => ({ talents, rotation });

const CURRENT_TALENT_PAIR = talentPair(CURRENT_TALENTS, CURRENT_ROTATION);
const ARMS_CUSTOM = talentPair(ARMS_TALENTS, CUSTOM_ROTATION);

// As the player's resolver: a custom APL goes as it is; an Auto or Simple pick generates a new list each time, here by
// the hands the gear fills alone, and the result keeps the pick's type and Simple settings.
const resolve: ResolveBuildRotation = ({ gear, rotation }) => {
	if (rotation.type === APLRotationType.TypeAPL) return rotation;
	const generated = rotationOf(APLRotationType.TypeUnknown, gear.getEquippedItem(ItemSlot.ItemSlotOffHand) ? 'dual wield' : 'two-hand');
	return { ...generated, type: rotation.type, simple: rotation.simple };
};

const DUAL_WIELD_RESOLVED = rotationOf(APLRotationType.TypeAuto, 'dual wield');
const TWO_HAND_RESOLVED = rotationOf(APLRotationType.TypeAuto, 'two-hand');

const encounterOf = (duration: number) => Encounter.create({ duration, durationVariation: 5, targets: [Target.create()] });

const encounterPair = (name: string, settingsName: string, settings: SavedSettings | null, duration = 180): BulkEncounterPairSetup => ({
	encounter: { name, isCurrent: !name, encounter: encounterOf(duration) },
	settings: { name: settingsName, isCurrent: !settingsName, settings },
});

const CURRENT_PAIR = encounterPair('', '', null);
const RAID_PAIR = encounterPair('Raid boss', 'Tank', SavedSettings.create({ professions: [Profession.Enchanting] }), 300);

describe('bulkBuildRuns', () => {
	it('plans nothing without gear setups', () => {
		expect(bulkBuildRuns([], referenceOf(), [CURRENT_PAIR], [CURRENT_TALENT_PAIR], resolve)).toEqual([]);
	});

	it('runs each encounter pair with each talent pair, current first, encounter pair outer', () => {
		const runs = bulkBuildRuns(
			[setupOf('Raid set', OTHER_DUAL_WIELD_GEAR)],
			referenceOf(),
			[CURRENT_PAIR, RAID_PAIR],
			[CURRENT_TALENT_PAIR, ARMS_CUSTOM],
			resolve,
		);

		expect(runs.map(({ encounterPair, talentPair }) => [encounterPair.encounter.name, talentPair.talents.name])).toEqual([
			['', ''],
			['', 'Arms'],
			['Raid boss', ''],
			['Raid boss', 'Arms'],
		]);
		expect(runs.map(run => run.requests[0].override.talentsString)).toEqual(['111', '222', '111', '222']);
	});

	it('leads with the reference request: live bonus stats and the current rotation resolved for the current gear', () => {
		const setups = [setupOf('Two-hand', TWO_HAND_GEAR), setupOf('Raid set', OTHER_DUAL_WIELD_GEAR)];

		const [run] = bulkBuildRuns(setups, referenceOf(), [CURRENT_PAIR], [CURRENT_TALENT_PAIR], resolve);

		expect(run.requests).toEqual([
			{ candidates: [setups[1]], baselineSetup: null, override: { talentsString: '111', rotation: DUAL_WIELD_RESOLVED, bonusStats: NO_BONUS.toProto() } },
			{ candidates: [setups[0]], baselineSetup: null, override: { talentsString: '111', rotation: TWO_HAND_RESOLVED, bonusStats: NO_BONUS.toProto() } },
		]);
	});

	it('gives the reference a request of its own when no setup shares its bonus stats and rotation', () => {
		const setups = [setupOf('Raid set', OTHER_DUAL_WIELD_GEAR), setupOf('Two-hand', TWO_HAND_GEAR)];

		const runs = bulkBuildRuns(setups, referenceOf({ bonusStats: LIVE_BONUS }), [CURRENT_PAIR, RAID_PAIR], [CURRENT_TALENT_PAIR, ARMS_CUSTOM], resolve);

		expect(runs[0].requests[0]).toEqual({
			candidates: [],
			baselineSetup: null,
			override: { talentsString: '111', rotation: DUAL_WIELD_RESOLVED, bonusStats: LIVE_BONUS.toProto() },
		});
		expect(runs.map(run => run.requests.map(request => request.candidates.length))).toEqual([[0, 1, 1], [2], [0, 1, 1], [2]]);
	});

	it('lets a setup wearing the current gear stand for its request’s baseline', () => {
		const setups = [setupOf('', CURRENT_GEAR), setupOf('Raid set', OTHER_DUAL_WIELD_GEAR), setupOf('Buffed', CURRENT_GEAR, STRENGTH_BONUS)];

		const runs = bulkBuildRuns(setups, referenceOf(), [CURRENT_PAIR], [CURRENT_TALENT_PAIR, ARMS_CUSTOM], resolve);

		expect(runs.map(run => run.requests.map(({ candidates, baselineSetup }) => ({ candidates, baselineSetup })))).toEqual([
			[
				{ candidates: [setups[1]], baselineSetup: setups[0] },
				{ candidates: [], baselineSetup: setups[2] },
			],
			[
				{ candidates: [setups[1]], baselineSetup: setups[0] },
				{ candidates: [], baselineSetup: setups[2] },
			],
		]);
	});

	it('splits a run by bonus stats and by the rotation each gear set resolves to', () => {
		const setups = [setupOf('Two-hand', TWO_HAND_GEAR), setupOf('Raid set', OTHER_DUAL_WIELD_GEAR), setupOf('Buffed', gearOf(5, 6), STRENGTH_BONUS)];

		const [auto, custom] = bulkBuildRuns(setups, referenceOf(), [CURRENT_PAIR], [CURRENT_TALENT_PAIR, ARMS_CUSTOM], resolve);

		expect(auto.requests.map(({ candidates, override }) => ({ candidates, rotation: override.rotation, bonusStats: override.bonusStats }))).toEqual([
			{ candidates: [setups[1]], rotation: DUAL_WIELD_RESOLVED, bonusStats: NO_BONUS.toProto() },
			{ candidates: [setups[0]], rotation: TWO_HAND_RESOLVED, bonusStats: NO_BONUS.toProto() },
			{ candidates: [setups[2]], rotation: DUAL_WIELD_RESOLVED, bonusStats: STRENGTH_BONUS.toProto() },
		]);
		expect(custom.requests.map(({ candidates, override }) => ({ candidates, rotation: override.rotation, bonusStats: override.bonusStats }))).toEqual([
			{ candidates: [setups[0], setups[1]], rotation: CUSTOM_ROTATION.rotation, bonusStats: NO_BONUS.toProto() },
			{ candidates: [setups[2]], rotation: CUSTOM_ROTATION.rotation, bonusStats: STRENGTH_BONUS.toProto() },
		]);
	});

	it('runs talent pairs the sim reads alike once, under the first of them', () => {
		const setups = [setupOf('Two-hand', TWO_HAND_GEAR), setupOf('Raid set', OTHER_DUAL_WIELD_GEAR)];
		const customCopy: BulkRotationSetup = { name: 'Custom copy', isCurrent: false, rotation: rotationOf(APLRotationType.TypeAPL, 'custom', 'copy') };
		const simpleA = simpleRotation('Simple A', '{"a":1}');

		const runs = bulkBuildRuns(
			setups,
			referenceOf(),
			[CURRENT_PAIR, RAID_PAIR],
			[
				CURRENT_TALENT_PAIR,
				talentPair(CURRENT_TALENTS, simpleA),
				talentPair(CURRENT_TALENTS, CUSTOM_ROTATION),
				talentPair(CURRENT_TALENTS, customCopy),
				talentPair(CURRENT_TALENTS, simpleRotation('Simple B', '{"b":2}')),
				talentPair(ARMS_TALENTS, simpleA),
			],
			resolve,
		);

		expect(runs.map(run => [run.encounterPair.encounter.name, run.talentPair.talents.name, run.talentPair.rotation.name])).toEqual([
			['', '', ''],
			['', '', 'Custom'],
			['', 'Arms', 'Simple A'],
			['Raid boss', '', ''],
			['Raid boss', '', 'Custom'],
			['Raid boss', 'Arms', 'Simple A'],
		]);
		expect(runs[1].requests).toEqual([expect.objectContaining({ candidates: [setups[0], setups[1]], baselineSetup: null })]);
	});

	it('sends a pair without Enchanting its setups without ring enchants', () => {
		const current = gearOf(1, 2, RING_STAMINA);
		const setups = [setupOf('', gearOf(1, 2, RING_AGILITY), NO_BONUS, 'Agility'), setupOf('', current, NO_BONUS, 'Stamina')];
		const enchanterEntry = encounterPair('', 'Enchanter', SavedSettings.create({ professions: [Profession.Mining, Profession.Enchanting] }));
		const stripped = { ...setups[0], gear: setups[0].gear.withoutEnchanting(), ownGear: setups[0].gear };

		const [live, entry] = bulkBuildRuns(
			setups,
			referenceOf({ gear: current, isEnchanter: false }),
			[CURRENT_PAIR, enchanterEntry],
			[CURRENT_TALENT_PAIR],
			resolve,
		);

		expect(live.requests.map(({ candidates, baselineSetup }) => ({ candidates, baselineSetup }))).toEqual([{ candidates: [], baselineSetup: stripped }]);
		expect(stripped.gear.getEquippedItem(ItemSlot.ItemSlotFinger1)?.enchant).toBeNull();
		expect(entry.requests.map(({ candidates, baselineSetup }) => ({ candidates, baselineSetup }))).toEqual([
			{ candidates: [setups[0]], baselineSetup: setups[1] },
		]);
	});

	it('resolves a rotation once per talents, pick and items, whatever the enchants and the encounter pairs', () => {
		const setups = [
			setupOf('', gearOf(1, 2, RING_STAMINA), NO_BONUS, 'Stamina'),
			setupOf('', gearOf(1, 2, RING_AGILITY), NO_BONUS, 'Agility'),
			setupOf('Two-hand', TWO_HAND_GEAR),
		];
		const counted = vi.fn<ResolveBuildRotation>(resolve);

		const runs = bulkBuildRuns(setups, referenceOf(), [CURRENT_PAIR, RAID_PAIR], [CURRENT_TALENT_PAIR, ARMS_CUSTOM], counted);

		const calls = counted.mock.calls.map(([{ talentsString, rotation, gear }]) => [
			talentsString,
			rotation.type,
			gear.getEquippedItem(ItemSlot.ItemSlotMainHand)?.id,
		]);
		expect(calls).toEqual([
			['111', APLRotationType.TypeAuto, 1],
			['111', APLRotationType.TypeAuto, 3],
			['111', APLRotationType.TypeAuto, 1],
			['222', APLRotationType.TypeAPL, 1],
			['222', APLRotationType.TypeAPL, 3],
		]);
		expect(runs.map(run => run.requests.map(request => request.candidates))).toEqual([
			[[setups[0], setups[1]], [setups[2]]],
			[[setups[0], setups[1], setups[2]]],
			[[setups[0], setups[1]], [setups[2]]],
			[[setups[0], setups[1], setups[2]]],
		]);
	});
});

describe('bulkBuildsCount', () => {
	it('counts every request of every encounter pair as a run', () => {
		const setups = [setupOf('Raid set', OTHER_DUAL_WIELD_GEAR), setupOf('Two-hand', TWO_HAND_GEAR)];
		const currentCustom = talentPair(CURRENT_TALENTS, { ...CUSTOM_ROTATION, name: '', isCurrent: true });
		const runs = bulkBuildRuns(
			setups,
			referenceOf(),
			[CURRENT_PAIR, RAID_PAIR],
			[currentCustom, talentPair(ARMS_TALENTS, simpleRotation('Simple', '{}'))],
			resolve,
		);

		const count = bulkBuildsCount(setups, runs, 2, 2);

		expect(runs.map(run => run.requests.length)).toEqual([1, 2, 1, 2]);
		expect(count.runs).toBe(6);
	});

	it('counts the minimum iterations of every request', () => {
		const setups = [setupOf('Raid set', OTHER_DUAL_WIELD_GEAR), setupOf('Dungeon', gearOf(5, 6)), setupOf('Heroic', gearOf(7, 8))];
		const runs = bulkBuildRuns(setups, referenceOf({ bonusStats: LIVE_BONUS }), [CURRENT_PAIR], [CURRENT_TALENT_PAIR], resolve);

		expect(bulkBuildsCount(setups, runs, 1, 1)).toEqual({
			setups: 3,
			encounterPairs: 1,
			talentPairs: 1,
			runs: 2,
			totalIterations: 5 * bulkSimHighStageFloor(),
			largestRequestIterations: 4 * bulkSimHighStageFloor(),
			largestRequestCandidates: 3,
		});
	});
});

describe('bulkBuildStep', () => {
	it('names a step by its encounter with its length and targets, settings, talents and rotation, calling each current one current', () => {
		expect(bulkBuildStep({ encounterPair: RAID_PAIR, talentPair: ARMS_CUSTOM })).toEqual({
			encounter: 'Raid boss',
			encounterSummary: '5:00 ±5s · bulk_tab.settings.encounters.targets:1',
			settings: 'Tank',
			talents: 'Arms',
			rotation: 'Custom',
		});
		expect(bulkBuildStep({ encounterPair: CURRENT_PAIR, talentPair: CURRENT_TALENT_PAIR })).toEqual({
			encounter: 'bulk_tab.builds.pairs.current_encounter',
			encounterSummary: '3:00 ±5s · bulk_tab.settings.encounters.targets:1',
			settings: 'bulk_tab.builds.pairs.current_settings',
			talents: 'bulk_tab.results.current_talents',
			rotation: 'bulk_tab.results.current_rotation',
		});
	});
});
