import { APLRotation, APLRotation_Type as APLRotationType } from '@generated/proto/apl';
import { Profession } from '@generated/proto/common';
import type { BulkBuildOverride, BulkEncounterPairSetup, BulkGearSetup, BulkTalentPairSetup } from '@sim/bulk/types';
import type { Gear } from '@sim/proto/gear';
import { getGearIdentityKey } from '@sim/proto/items';
import type { Stats } from '@sim/proto/stats';
import { omitDeep } from '@sim/utils/collections';
import { estimateBulkSimIterations } from '@sim/wasm/bulk_sim/estimate';

import { encounterSideLabel, settingsSideLabel } from './encounter_pairs';
import { bonusStatsKey, gearSetupsSentWith } from './gear_setups';
import type { PairSide } from './pairs';
import { rotationLabel } from './rotations';
import { talentsLabel } from './talents';

export type ResolveBuildRotation = (build: { talentsString: string; gear: Gear; rotation: APLRotation }) => APLRotation;

export interface BulkBuildReference {
	/** The current gear as equipped. */
	gear: Gear;
	bonusStats: Stats;
	/** By the live professions. */
	isEnchanter: boolean;
}

export interface BulkBuildRequest {
	/** None of them wears the current gear, which the request sims as its baseline. */
	candidates: readonly BulkGearSetup[];
	/** The setup the baseline stands for: the one in the group that wears the current gear, if any. */
	baselineSetup: BulkGearSetup | null;
	override: BulkBuildOverride;
}

export interface BulkBuildRun {
	encounterPair: BulkEncounterPairSetup;
	talentPair: BulkTalentPairSetup;
	requests: readonly BulkBuildRequest[];
}

export interface BulkBuildsCount {
	setups: number;
	encounterPairs: number;
	talentPairs: number;
	/** The requests of every encounter pair, after splits and collapses. */
	runs: number;
	totalIterations: number;
	largestRequestIterations: number;
	largestRequestCandidates: number;
}

interface BuildGroup {
	setups: BulkGearSetup[];
	bonusStats: Stats;
	resolved: APLRotation;
}

const gearIdentity = (gear: Gear): string => getGearIdentityKey(gear.asSpec());

// What the sim reads of a resolved rotation: the type and Simple settings a resolved rotation keeps from its pick and
// the editor's uuids are left out, so an Auto and a Simple pick that generate the same list compare equal.
const simmedRotationKey = (rotation: APLRotation): string =>
	APLRotation.toJsonString({ ...omitDeep(rotation, ['uuid']), type: APLRotationType.TypeUnknown, simple: undefined });

const groupKey = (bonusStats: Stats, resolved: APLRotation): string => `${bonusStatsKey(bonusStats)}|${simmedRotationKey(resolved)}`;

// A settings entry sends its own professions; the current settings send the live ones.
const pairIsEnchanter = (encounterPair: BulkEncounterPairSetup, reference: BulkBuildReference): boolean =>
	encounterPair.settings.settings ? encounterPair.settings.settings.professions.includes(Profession.Enchanting) : reference.isEnchanter;

// One group per bonus stats and rotation the setups resolve to, in the order of each group's first setup. A setup that
// an earlier talent pair with the same talents resolved alike is in `simmed` and left out.
const buildGroups = (
	setups: readonly BulkGearSetup[],
	{ talents, rotation }: BulkTalentPairSetup,
	resolve: ResolveBuildRotation,
	simmed: Set<string>,
): Map<string, BuildGroup> => {
	const groups = new Map<string, BuildGroup>();
	for (const setup of setups) {
		const resolved = resolve({ talentsString: talents.talentsString, gear: setup.gear, rotation: rotation.rotation });
		const key = groupKey(setup.bonusStats, resolved);
		const simKey = `${gearIdentity(setup.gear)}|${key}`;
		if (simmed.has(simKey)) continue;
		simmed.add(simKey);
		const group = groups.get(key);
		if (group) group.setups.push(setup);
		else groups.set(key, { setups: [setup], bonusStats: setup.bonusStats, resolved });
	}
	return groups;
};

// Encounter pair outer, talent pair inner, so with current-first inputs each encounter pair's first run is the current
// talent pair. Its first request carries the reference: the live bonus stats and the rotation the current gear resolves
// to, with no candidates when no setup shares them. Talent pairs that resolve alike for a setup under the same talents
// sim it once, under the first of them; a talent pair left with no setup has no run.
export const bulkBuildRuns = (
	setups: readonly BulkGearSetup[],
	reference: BulkBuildReference,
	encounterPairs: readonly BulkEncounterPairSetup[],
	talentPairs: readonly BulkTalentPairSetup[],
	resolve: ResolveBuildRotation,
): BulkBuildRun[] => {
	if (!setups.length) return [];
	return encounterPairs.flatMap(encounterPair => {
		const isEnchanter = pairIsEnchanter(encounterPair, reference);
		const sent = gearSetupsSentWith(setups, isEnchanter);
		const referenceGear = isEnchanter ? reference.gear : reference.gear.withoutEnchanting();
		const referenceIdentity = gearIdentity(referenceGear);
		const simmedByTalents = new Map<string, Set<string>>();
		return talentPairs.flatMap((talentPair, index): BulkBuildRun[] => {
			const { talentsString } = talentPair.talents;
			const simmed = simmedByTalents.get(talentsString) ?? new Set<string>();
			simmedByTalents.set(talentsString, simmed);
			const groups = buildGroups(sent, talentPair, resolve, simmed);
			let ordered = [...groups.values()];
			if (index === 0) {
				const resolved = resolve({ talentsString, gear: referenceGear, rotation: talentPair.rotation.rotation });
				const key = groupKey(reference.bonusStats, resolved);
				const lead = groups.get(key) ?? { setups: [], bonusStats: reference.bonusStats, resolved };
				ordered = [lead, ...ordered.filter(group => group !== lead)];
			}
			const requests = ordered.map((group): BulkBuildRequest => ({
				candidates: group.setups.filter(setup => gearIdentity(setup.gear) !== referenceIdentity),
				baselineSetup: group.setups.find(setup => gearIdentity(setup.gear) === referenceIdentity) ?? null,
				override: { talentsString, rotation: group.resolved, bonusStats: group.bonusStats.toProto() },
			}));
			return requests.length ? [{ encounterPair, talentPair, requests }] : [];
		});
	});
};

export const bulkBuildsCount = (
	setups: readonly BulkGearSetup[],
	runs: readonly BulkBuildRun[],
	encounterPairs: number,
	talentPairs: number,
): BulkBuildsCount => {
	const requests = runs.flatMap(run => run.requests);
	const iterations = requests.map(request => estimateBulkSimIterations(request.candidates.length));
	return {
		setups: setups.length,
		encounterPairs,
		talentPairs,
		runs: requests.length,
		totalIterations: iterations.reduce((sum, count) => sum + count, 0),
		largestRequestIterations: iterations.reduce((largest, count) => Math.max(largest, count), 0),
		largestRequestCandidates: requests.reduce((largest, request) => Math.max(largest, request.candidates.length), 0),
	};
};

export interface BulkBuildStep {
	encounter: string;
	settings: string;
	talents: string;
	rotation: string;
}

export const bulkBuildStep = ({
	encounterPair,
	talentPair,
}: {
	encounterPair: Record<'encounter' | 'settings', PairSide>;
	talentPair: Record<'talents' | 'rotation', PairSide>;
}): BulkBuildStep => ({
	encounter: encounterSideLabel(encounterPair.encounter),
	settings: settingsSideLabel(encounterPair.settings),
	talents: talentsLabel(talentPair.talents),
	rotation: rotationLabel(talentPair.rotation),
});
