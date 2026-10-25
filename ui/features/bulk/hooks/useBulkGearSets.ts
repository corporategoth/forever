import { useSavedGear } from '@features/gear/hooks/useSavedGear';
import { usePlayer, useSpecPresets } from '@sim/context/SimHostContext';
import { usePlayerStore } from '@sim/hooks/usePlayerStore';
import { useSimReady } from '@sim/hooks/useSimReady';
import { useMemo } from 'react';

import { bulkGearSetEntries, type BulkGearSetEntry } from '../model/gear_sets';
import { useBulkState } from './useBulkState';

const NO_ENTRIES: BulkGearSetEntry[] = [];

// The same sources the batch resolves when it starts: the spec's preset gear, the user's saved sets and the live gear.
// The sets are looked up in the database, so the list stays empty until the sim is ready.
export const useBulkGearSets = () => {
	const player = usePlayer();
	const ready = useSimReady();
	const presets = useSpecPresets().gear;
	const { entries: saved } = useSavedGear();
	const checked = useBulkState(slice => slice.gearSets);
	const gear = usePlayerStore('gear');
	const bonusStats = usePlayerStore('bonusStats');

	const current = useMemo(() => ({ gear, bonusStats }), [gear, bonusStats]);
	const entries = useMemo(() => (ready ? bulkGearSetEntries(presets, saved, player) : NO_ENTRIES), [ready, presets, saved, player]);

	return { ready, current, entries, checked };
};
