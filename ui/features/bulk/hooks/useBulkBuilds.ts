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
import { useBulkTalentPairs } from './useBulkTalentPairs';

// The count of the plan a Builds batch starts with, from the same sources and the live encounter, talents, rotation and
// professions. The enchants come from the database, so there are no gear setups until the sim is ready.
export const useBulkBuilds = (): BulkBuildsCount => {
	const player = usePlayer();
	const sim = useSim();
	const { ready, current, entries: gearSetEntries, checked: checkedGearSets } = useBulkGearSets();
	const { entries: enchantPickEntries, checked: checkedEnchantPicks } = useBulkEnchantPicks();
	const { encounters, settings, pairs: encounterPairs } = useBulkEncounterPairs();
	const { talents, rotations, pairs: talentPairs } = useBulkTalentPairs();
	const encounter = useStore(sim.store, state => state.encounter);
	const talentsString = usePlayerStore('talentsString');
	const rotation = useAplRotation(live => APLRotation.clone(live));
	const profession1 = usePlayerStore('profession1');
	const profession2 = usePlayerStore('profession2');

	// Apart from the runs, so checking an encounter or talent pair does not build the setups again.
	const setups = useMemo(() => {
		if (!ready) return [];
		const gearSetRuns = bulkGearSetRuns(current, gearSetEntries, checkedGearSets);
		return bulkGearSetups(player, gearSetRuns, bulkEnchantPickRuns(enchantPickEntries, checkedEnchantPicks));
	}, [ready, player, current, gearSetEntries, checkedGearSets, enchantPickEntries, checkedEnchantPicks]);

	return useMemo(() => {
		const encounterRuns = bulkEncounterPairRuns(Encounter.create(encounter), encounters, settings, encounterPairs);
		const talentRuns = bulkTalentPairRuns({ talentsString, rotation }, talents, rotations, talentPairs);
		const reference = { ...current, isEnchanter: profession1 === Profession.Enchanting || profession2 === Profession.Enchanting };
		const runs = bulkBuildRuns(setups, reference, encounterRuns, talentRuns, build => player.getResolvedAplRotationForBuild(build));
		return bulkBuildsCount(setups, runs, encounterRuns.length, talentRuns.length);
	}, [
		setups,
		player,
		current,
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
