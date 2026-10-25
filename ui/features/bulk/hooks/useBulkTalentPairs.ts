import { useSavedRotation } from '@features/apl/hooks/useSavedRotation';
import { useSavedTalents } from '@features/talents/hooks/useSavedTalents';
import { useSpecPresets } from '@sim/context/SimHostContext';
import { useMemo } from 'react';

import { bulkRotationEntries } from '../model/rotations';
import { bulkTalentEntries } from '../model/talents';
import { useBulkState } from './useBulkState';

// The same sources the batch resolves when it starts: the spec's presets and the user's saved talents and rotations.
export const useBulkTalentPairs = () => {
	const presets = useSpecPresets();
	const { entries: savedTalents } = useSavedTalents();
	const { entries: savedRotations } = useSavedRotation();
	const pairs = useBulkState(slice => slice.talentPairs);

	const talents = useMemo(() => bulkTalentEntries(presets.talents, savedTalents), [presets, savedTalents]);
	const rotations = useMemo(() => bulkRotationEntries(presets.rotations, savedRotations), [presets, savedRotations]);

	return { talents, rotations, pairs };
};
