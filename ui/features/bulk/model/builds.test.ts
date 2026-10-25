import { APLListItem, APLRotation, APLRotation_Type as APLRotationType, SimpleRotation } from '@generated/proto/apl';
import { Encounter, ItemSlot, Stat, Target } from '@generated/proto/common';
import type { BulkGearSetup, BulkRotationSetup, BulkTalentSetup } from '@sim/bulk/types';
import { Gear } from '@sim/proto/gear';
import { Stats } from '@sim/proto/stats';
import { bulkSimHighStageFloor, estimateBulkSimIterations } from '@sim/wasm/bulk_sim/estimate';
import { makeEquippedItem } from '@testing/storybook/fixtures/gear';
import { describe, expect, it, vi } from 'vitest';

import { type BulkBuildRun, bulkBuildRuns, bulkBuildsCount, bulkBuildStepLabel, type ResolveBuildRotation } from './builds';

vi.mock('@i18n/config', () => ({
	default: { t: (key: string, options?: { count?: number }) => (options?.count === undefined ? key : `${key}:${options.count}`) },
}));

const gearOf = (mainHand: number, offHand?: number) =>
	new Gear({
		[ItemSlot.ItemSlotMainHand]: makeEquippedItem({ item: { id: mainHand } }),
		...(offHand ? { [ItemSlot.ItemSlotOffHand]: makeEquippedItem({ item: { id: offHand } }) } : {}),
	});

const CURRENT_GEAR = gearOf(1, 2);
const TWO_HAND_GEAR = gearOf(3);
const OTHER_DUAL_WIELD_GEAR = gearOf(4, 2);

const NO_BONUS = new Stats();
const STRENGTH_BONUS = new Stats().withStat(Stat.StatStrength, 10);

const currentSetup = (bonusStats = NO_BONUS): BulkGearSetup => ({ gearSet: '', enchantPreset: '', isCurrent: true, gear: CURRENT_GEAR, bonusStats });

const savedSetup = (gearSet: string, gear: Gear, bonusStats = NO_BONUS): BulkGearSetup => ({ gearSet, enchantPreset: '', isCurrent: false, gear, bonusStats });

const rotationOf = (type: APLRotationType, notes = '') => APLRotation.create({ type, priorityList: notes ? [APLListItem.create({ notes })] : [] });

const CURRENT_TALENTS: BulkTalentSetup = { name: '', talentsString: '111', isCurrent: true };
const ARMS_TALENTS: BulkTalentSetup = { name: 'Arms', talentsString: '222', isCurrent: false };

const CURRENT_ROTATION: BulkRotationSetup = { name: '', isCurrent: true, rotation: rotationOf(APLRotationType.TypeAuto) };
const CUSTOM_ROTATION: BulkRotationSetup = { name: 'Custom', isCurrent: false, rotation: rotationOf(APLRotationType.TypeAPL, 'custom') };

const simpleRotation = (name: string, specRotationJson: string): BulkRotationSetup => ({
	name,
	isCurrent: false,
	rotation: APLRotation.create({ type: APLRotationType.TypeSimple, simple: SimpleRotation.create({ specRotationJson }) }),
});

// A custom APL goes as it is; an Auto or Simple rotation resolves by its type and the hands the gear fills, each time
// to a new object, whatever its settings.
const resolve: ResolveBuildRotation = ({ gear, rotation }) => {
	if (rotation.type === APLRotationType.TypeAPL) return rotation;
	return rotationOf(rotation.type, gear.getEquippedItem(ItemSlot.ItemSlotOffHand) ? 'dual wield' : 'two-hand');
};

const DUAL_WIELD_RESOLVED = rotationOf(APLRotationType.TypeAuto, 'dual wield');
const TWO_HAND_RESOLVED = rotationOf(APLRotationType.TypeAuto, 'two-hand');

const encounterOf = (duration: number) => Encounter.create({ duration, durationVariation: 5, targets: [Target.create()] });

describe('bulkBuildRuns', () => {
	it('runs the current talents with the current rotation first, talents outer', () => {
		const runs = bulkBuildRuns([currentSetup()], [CURRENT_TALENTS, ARMS_TALENTS], [CURRENT_ROTATION, CUSTOM_ROTATION], resolve);

		expect(runs.map(({ talents, rotation }) => [talents.name, rotation.name])).toEqual([
			['', ''],
			['', 'Custom'],
			['Arms', ''],
			['Arms', 'Custom'],
		]);
		expect(runs.map(run => run.requests[0].override.talentsString)).toEqual(['111', '111', '222', '222']);
	});

	it('sends every setup but the current gear as a candidate, the current gear standing for the baseline', () => {
		const setups = [currentSetup(), savedSetup('Raid', OTHER_DUAL_WIELD_GEAR), savedSetup('Dungeon', gearOf(5, 6))];

		const runs = bulkBuildRuns(setups, [CURRENT_TALENTS], [CURRENT_ROTATION], resolve);

		expect(runs[0].requests).toHaveLength(1);
		expect(runs[0].requests[0].baselineSetup).toBe(setups[0]);
		expect(runs[0].requests[0].candidates).toEqual(setups.slice(1));
	});

	it('splits a run by the rotation each gear set resolves to, a custom APL going as it is', () => {
		const setups = [currentSetup(), savedSetup('Two-hand', TWO_HAND_GEAR), savedSetup('Raid', OTHER_DUAL_WIELD_GEAR)];

		const [auto, custom] = bulkBuildRuns(setups, [CURRENT_TALENTS], [CURRENT_ROTATION, CUSTOM_ROTATION], resolve);

		expect(auto.requests).toEqual([
			{
				candidates: [setups[2]],
				baselineSetup: setups[0],
				override: { talentsString: '111', rotation: DUAL_WIELD_RESOLVED, bonusStats: NO_BONUS.toProto() },
			},
			{
				candidates: [setups[1]],
				baselineSetup: null,
				override: { talentsString: '111', rotation: TWO_HAND_RESOLVED, bonusStats: NO_BONUS.toProto() },
			},
		]);
		expect(custom.requests).toHaveLength(1);
		expect(custom.requests[0].candidates).toEqual([setups[1], setups[2]]);
		expect(custom.requests[0].override.rotation).toBe(CUSTOM_ROTATION.rotation);
	});

	it('puts the gear sets whose rotations resolve alike in one request', () => {
		const setups = [currentSetup(), savedSetup('Two-hand', TWO_HAND_GEAR), savedSetup('Other two-hand', gearOf(7))];

		const [run] = bulkBuildRuns(setups, [CURRENT_TALENTS], [CURRENT_ROTATION], resolve);

		expect(run.requests.map(request => request.candidates)).toEqual([[], [setups[1], setups[2]]]);
	});

	it('runs picked rotations that resolve alike once, under the first of them', () => {
		const setups = [currentSetup(), savedSetup('Two-hand', TWO_HAND_GEAR)];
		const pickedAuto: BulkRotationSetup = { name: 'Auto', isCurrent: false, rotation: rotationOf(APLRotationType.TypeAuto, 'picked') };

		const runs = bulkBuildRuns(
			setups,
			[CURRENT_TALENTS],
			[CURRENT_ROTATION, simpleRotation('Simple A', '{"a":1}'), pickedAuto, simpleRotation('Simple B', '{"b":2}')],
			resolve,
		);

		expect(runs.map(run => run.rotation.name)).toEqual(['', 'Simple A']);
		expect(runs[1].requests.map(({ candidates, baselineSetup }) => ({ candidates, baselineSetup }))).toEqual([
			{ candidates: [], baselineSetup: setups[0] },
			{ candidates: [setups[1]], baselineSetup: null },
		]);
	});

	it('splits a run by bonus stats, each request carrying its group’s bonus stats', () => {
		const setups = [currentSetup(), savedSetup('Buffed', OTHER_DUAL_WIELD_GEAR, STRENGTH_BONUS), savedSetup('Raid', gearOf(5, 6))];

		const [run] = bulkBuildRuns(setups, [CURRENT_TALENTS], [CURRENT_ROTATION], resolve);

		expect(run.requests.map(({ candidates, baselineSetup, override }) => ({ candidates, baselineSetup, bonusStats: override.bonusStats }))).toEqual([
			{ candidates: [setups[2]], baselineSetup: setups[0], bonusStats: NO_BONUS.toProto() },
			{ candidates: [setups[1]], baselineSetup: null, bonusStats: STRENGTH_BONUS.toProto() },
		]);
	});

	it('lets a setup with the current gear and other bonus stats stand for its request’s baseline', () => {
		const setups = [
			currentSetup(),
			savedSetup('Buffed current', CURRENT_GEAR, STRENGTH_BONUS),
			savedSetup('Buffed raid', OTHER_DUAL_WIELD_GEAR, STRENGTH_BONUS),
		];

		const [run] = bulkBuildRuns(setups, [CURRENT_TALENTS], [CURRENT_ROTATION], resolve);

		expect(run.requests[1]).toEqual(expect.objectContaining({ candidates: [setups[2]], baselineSetup: setups[1] }));
	});

	it('leaves a request with no candidates when only the current gear is in its group', () => {
		const setups = [currentSetup()];

		const runs = bulkBuildRuns(setups, [CURRENT_TALENTS, ARMS_TALENTS], [CURRENT_ROTATION], resolve);

		expect(runs[1].requests).toEqual([expect.objectContaining({ candidates: [], baselineSetup: setups[0] })]);
	});

	it('refuses setups that do not start with the current one', () => {
		expect(() => bulkBuildRuns([], [CURRENT_TALENTS], [CURRENT_ROTATION], resolve)).toThrow();
		expect(() => bulkBuildRuns([savedSetup('Raid', OTHER_DUAL_WIELD_GEAR), currentSetup()], [CURRENT_TALENTS], [CURRENT_ROTATION], resolve)).toThrow();
	});
});

describe('bulkBuildsCount', () => {
	it('counts the minimum iterations of every request of every encounter', () => {
		const many = [currentSetup(), ...Array.from({ length: 24 }, (_, index) => savedSetup(`Set ${index}`, gearOf(100 + index, 2)))];
		const manyCount = bulkBuildsCount(many, bulkBuildRuns(many, [CURRENT_TALENTS], [CURRENT_ROTATION], resolve), 2, 1, 1);

		expect(manyCount).toEqual({
			setups: 25,
			encounters: 2,
			talentSetups: 1,
			rotations: 1,
			runs: 2,
			totalIterations: 2 * estimateBulkSimIterations(24),
			largestRequestIterations: estimateBulkSimIterations(24),
			largestRequestCandidates: 24,
		});

		const few = [currentSetup(), savedSetup('Raid', OTHER_DUAL_WIELD_GEAR), savedSetup('Dungeon', gearOf(5, 6))];
		const fewCount = bulkBuildsCount(few, bulkBuildRuns(few, [CURRENT_TALENTS], [CURRENT_ROTATION], resolve), 2, 1, 1);

		expect(fewCount.totalIterations).toBe(2 * bulkSimHighStageFloor() * 3);
	});

	it('counts runs as encounters × talent setups × rotations', () => {
		const setups = [currentSetup()];
		const runs = bulkBuildRuns(setups, [CURRENT_TALENTS, ARMS_TALENTS], [CURRENT_ROTATION, CUSTOM_ROTATION], resolve);

		expect(bulkBuildsCount(setups, runs, 3, 2, 2).runs).toBe(12);
	});
});

describe('bulkBuildStepLabel', () => {
	it('names a step by encounter, talents and rotation, leaving out what only one of ran', () => {
		const current = { name: '', isCurrent: true, encounter: encounterOf(180) };
		const raid = { name: 'Raid boss', isCurrent: false, encounter: encounterOf(300) };
		const run: BulkBuildRun = { talents: ARMS_TALENTS, rotation: CUSTOM_ROTATION, requests: [] };
		const currentRun: BulkBuildRun = { talents: CURRENT_TALENTS, rotation: CURRENT_ROTATION, requests: [] };

		expect(bulkBuildStepLabel(current, run, 1, 1)).toBe('bulk_tab.results.current · 3:00 ±5s · bulk_tab.settings.encounters.targets:1');
		expect(bulkBuildStepLabel(current, run, 2, 1)).toBe('bulk_tab.results.current · Arms');
		expect(bulkBuildStepLabel(current, run, 1, 2)).toBe('bulk_tab.results.current · Custom');
		expect(bulkBuildStepLabel(raid, run, 2, 2)).toBe('Raid boss · Arms · Custom');
		expect(bulkBuildStepLabel(raid, currentRun, 2, 2)).toBe('Raid boss · bulk_tab.results.current_talents · bulk_tab.results.current_rotation');
	});
});
