import { useSavedGear } from '@features/gear/hooks/useSavedGear';
import { usePlayer, useSpecPresets } from '@sim/context/SimHostContext';
import { usePlayerStore } from '@sim/hooks/usePlayerStore';
import { useMemo } from 'react';

import { bulkGearSetEntries } from '../model/gear_sets';
import { useBulkState } from './useBulkState';

// The same sources the batch resolves when it starts: the spec's preset gear, the user's saved sets and the live gear.
export const useBulkGearSets = () => {
	const player = usePlayer();
	const presets = useSpecPresets().gear;
	const { entries: saved } = useSavedGear();
	const checked = useBulkState(slice => slice.gearSets);
	const gear = usePlayerStore('gear');
	const bonusStats = usePlayerStore('bonusStats');

	const current = useMemo(() => ({ gear, bonusStats }), [gear, bonusStats]);
	const entries = useMemo(() => bulkGearSetEntries(presets, saved, player), [presets, saved, player]);

	return { current, entries, checked };
};
