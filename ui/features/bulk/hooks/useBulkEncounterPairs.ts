import { useSavedEncounter } from '@features/encounter/hooks/useSavedEncounter';
import { useSavedSettings } from '@features/settings/hooks/useSavedSettings';
import { useSimHost, useSpecPresets } from '@sim/context/SimHostContext';
import { useMemo } from 'react';

import { bulkSettingsEntries } from '../model/encounter_pairs';
import { bulkEncounterEntries } from '../model/encounters';
import { useBulkState } from './useBulkState';

// The same sources the batch resolves when it starts: the spec's presets and the user's saved encounters and settings.
export const useBulkEncounterPairs = () => {
	const host = useSimHost();
	const presets = useSpecPresets();
	const { entries: savedEncounters } = useSavedEncounter();
	const { entries: savedSettings } = useSavedSettings();
	const pairs = useBulkState(slice => slice.encounterPairs);

	const encounters = useMemo(() => bulkEncounterEntries(presets.encounters, savedEncounters), [presets, savedEncounters]);
	const settings = useMemo(() => bulkSettingsEntries(presets, savedSettings, host), [presets, savedSettings, host]);

	return { encounters, settings, pairs };
};
