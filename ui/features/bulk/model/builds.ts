import { APLRotation, APLRotation_Type as APLRotationType } from '@generated/proto/apl';
import type { Encounter } from '@generated/proto/common';
import type { BulkBuildOverride, BulkEncounterResults, BulkGearSetup, BulkRotationSetup, BulkTalentSetup } from '@sim/bulk/types';
import type { Gear } from '@sim/proto/gear';
import { getGearIdentityKey } from '@sim/proto/items';
import { omitDeep } from '@sim/utils/collections';
import { estimateBulkSimIterations } from '@sim/wasm/bulk_sim/estimate';

import { encounterLabel, formatEncounterSummary } from './encounters';
import { bonusStatsKey } from './gear_setups';
import { rotationLabel } from './rotations';
import { talentsLabel } from './talents';

export type ResolveBuildRotation = (build: { talentsString: string; gear: Gear; rotation: APLRotation }) => APLRotation;

export interface BulkBuildRequest {
	/** None of them wears the current gear, which the request sims as its baseline. */
	candidates: readonly BulkGearSetup[];
	/** The setup the baseline stands for: the one in the group that wears the current gear, if any. */
	baselineSetup: BulkGearSetup | null;
	override: BulkBuildOverride;
}

export interface BulkBuildRun {
	talents: BulkTalentSetup;
	rotation: BulkRotationSetup;
	requests: readonly BulkBuildRequest[];
}

export interface BulkBuildsCount {
	setups: number;
	encounters: number;
	talentSetups: number;
	rotations: number;
	/** Encounters × talent setups × rotations. */
	runs: number;
	totalIterations: number;
	largestRequestIterations: number;
	largestRequestCandidates: number;
}

const gearIdentity = (gear: Gear): string => getGearIdentityKey(gear.asSpec());

// What the sim reads of a resolved rotation: the type and Simple settings a resolved rotation keeps from its pick and
// the editor's uuids are left out, so an Auto and a Simple pick that generate the same list compare equal.
const simmedRotationKey = (rotation: APLRotation): string =>
	APLRotation.toJsonString({ ...omitDeep(rotation, ['uuid']), type: APLRotationType.TypeUnknown, simple: undefined });

// One request per bonus stats and rotation the setups resolve to, in the order of each group's first setup. A setup
// that an earlier rotation of the same talents resolved alike is in `simmed` and left out.
const buildRequests = (
	setups: readonly BulkGearSetup[],
	talents: BulkTalentSetup,
	rotation: BulkRotationSetup,
	resolve: ResolveBuildRotation,
	currentGear: string,
	simmed: Set<string>,
): BulkBuildRequest[] => {
	const groups = new Map<string, { setups: BulkGearSetup[]; resolved: APLRotation }>();
	for (const setup of setups) {
		const resolved = resolve({ talentsString: talents.talentsString, gear: setup.gear, rotation: rotation.rotation });
		const key = `${bonusStatsKey(setup.bonusStats)}|${simmedRotationKey(resolved)}`;
		const simKey = `${gearIdentity(setup.gear)}|${key}`;
		if (simmed.has(simKey)) continue;
		simmed.add(simKey);
		const group = groups.get(key);
		if (group) group.setups.push(setup);
		else groups.set(key, { setups: [setup], resolved });
	}
	return [...groups.values()].map(group => ({
		candidates: group.setups.filter(setup => gearIdentity(setup.gear) !== currentGear),
		baselineSetup: group.setups.find(setup => gearIdentity(setup.gear) === currentGear) ?? null,
		override: { talentsString: talents.talentsString, rotation: group.resolved, bonusStats: group.setups[0].bonusStats.toProto() },
	}));
};

// Talents outer, rotation inner, so with current-first inputs `runs[0]` is the current talents with the current
// rotation, and its first request holds the current setup. Rotations that resolve alike for a setup sim it once, under
// the first of them; a rotation left with no setup has no run.
export const bulkBuildRuns = (
	setups: readonly BulkGearSetup[],
	talentRuns: readonly BulkTalentSetup[],
	rotationRuns: readonly BulkRotationSetup[],
	resolve: ResolveBuildRotation,
): BulkBuildRun[] => {
	if (!setups.length) return [];
	// The current setup is the batch's reference and the gear every request sims as its baseline.
	if (!setups[0].isCurrent) throw new Error('A Builds batch needs the current gear setup first');
	const currentGear = gearIdentity(setups[0].gear);
	return talentRuns.flatMap(talents => {
		const simmed = new Set<string>();
		return rotationRuns.flatMap(rotation => {
			const requests = buildRequests(setups, talents, rotation, resolve, currentGear, simmed);
			return requests.length ? [{ talents, rotation, requests }] : [];
		});
	});
};

export const bulkBuildsCount = (
	setups: readonly BulkGearSetup[],
	runs: readonly BulkBuildRun[],
	encounters: number,
	talentSetups: number,
	rotations: number,
): BulkBuildsCount => {
	const requests = runs.flatMap(run => run.requests);
	const iterations = requests.map(request => estimateBulkSimIterations(request.candidates.length));
	return {
		setups: setups.length,
		encounters,
		talentSetups,
		rotations,
		runs: encounters * talentSetups * rotations,
		totalIterations: encounters * iterations.reduce((sum, count) => sum + count, 0),
		largestRequestIterations: iterations.reduce((largest, count) => Math.max(largest, count), 0),
		largestRequestCandidates: requests.reduce((largest, request) => Math.max(largest, request.candidates.length), 0),
	};
};

export const bulkBuildStepLabel = (
	encounter: Pick<BulkEncounterResults, 'isCurrent' | 'name'> & { encounter: Encounter },
	run: BulkBuildRun,
	talentSetups: number,
	rotations: number,
): string => {
	const parts = [
		encounterLabel(encounter),
		...(talentSetups > 1 ? [talentsLabel(run.talents)] : []),
		...(rotations > 1 ? [rotationLabel(run.rotation)] : []),
	];
	return (parts.length === 1 ? [...parts, formatEncounterSummary(encounter.encounter)] : parts).join(' · ');
};
