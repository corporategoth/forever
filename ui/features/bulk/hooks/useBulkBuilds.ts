import { APLRotation } from '@generated/proto/apl';
import { Encounter, Profession } from '@generated/proto/common';
import { usePlayer, useSim } from '@sim/context/SimHostContext';
import { useAplRotation } from '@sim/hooks/useAplRotation';
import { usePlayerStore } from '@sim/hooks/usePlayerStore';
import { useMemo } from 'react';
import { useStore } from 'zustand';

import { bulkBuildRuns, type BulkBuildsCount, bulkBuildsCount } from '../model/builds';
import { bulkEnchantPickRuns } from '../model/enchant_picks';
import { bulkEncounterPairRuns } from '../model/encounter_pairs';
import { bulkGearSetRuns } from '../model/gear_sets';
import { bulkGearSetups } from '../model/gear_setups';
import { bulkTalentPairRuns } from '../model/talent_pairs';
import { useBulkEnchantPicks } from './useBulkEnchantPicks';
import { useBulkEncounterPairs } from './useBulkEncounterPairs';
import { useBulkGearSets } from './useBulkGearSets';
import { useBulkMode } from './useBulkMode';
import { useBulkTalentPairs } from './useBulkTalentPairs';

// The count of the plan a Builds batch starts with, from the same sources and the live encounter, talents, rotation and
// professions. Null in Gear mode, which plans no builds.
export const useBulkBuilds = (): BulkBuildsCount | null => {
	const player = usePlayer();
	const sim = useSim();
	const { builds } = useBulkMode();
	const { current, entries: gearSetEntries, checked: checkedGearSets } = useBulkGearSets();
	const { entries: enchantPickEntries, checked: checkedEnchantPicks } = useBulkEnchantPicks();
	const { encounters, settings, pairs: encounterPairs } = useBulkEncounterPairs();
	const { talents, rotations, pairs: talentPairs } = useBulkTalentPairs();
	const encounter = useStore(sim.store, state => (builds ? state.encounter : undefined));
	const talentsString = usePlayerStore('talentsString');
	const rotation = useAplRotation(live => APLRotation.clone(live));
	const profession1 = usePlayerStore('profession1');
	const profession2 = usePlayerStore('profession2');

	return useMemo(() => {
		if (!builds) return null;
		const setups = bulkGearSetups(
			player,
			bulkGearSetRuns(current, gearSetEntries, checkedGearSets),
			bulkEnchantPickRuns(enchantPickEntries, checkedEnchantPicks),
		);
		const encounterRuns = bulkEncounterPairRuns(Encounter.create(encounter), encounters, settings, encounterPairs);
		const talentRuns = bulkTalentPairRuns({ talentsString, rotation }, talents, rotations, talentPairs);
		const reference = { ...current, isEnchanter: profession1 === Profession.Enchanting || profession2 === Profession.Enchanting };
		const runs = bulkBuildRuns(setups, reference, encounterRuns, talentRuns, build => player.getResolvedAplRotationForBuild(build));
		return bulkBuildsCount(setups, runs, encounterRuns.length, talentRuns.length);
	}, [
		builds,
		player,
		current,
		gearSetEntries,
		checkedGearSets,
		enchantPickEntries,
		checkedEnchantPicks,
		encounter,
		encounters,
		settings,
		encounterPairs,
		talentsString,
		rotation,
		talents,
		rotations,
		talentPairs,
		profession1,
		profession2,
	]);
};
