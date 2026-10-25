import type { Encounter } from '@generated/proto/common';
import { BulkEncounterRef, SavedEncounter } from '@generated/proto/ui';
import i18n from '@i18n/config';
import type { BulkEncounterResults } from '@sim/bulk/types';
import type { PresetEncounter } from '@sim/presets/types';
import type { IndividualSimHost } from '@sim/sim_host';
import { formatDurationSeconds } from '@sim/utils/format';

import { storedSavedData } from './saved_refs';

export interface BulkEncounterEntry {
	ref: BulkEncounterRef;
	name: string;
	encounter: Encounter;
}

type EncounterLength = Pick<BulkEncounterResults, 'duration' | 'durationVariation'>;

const t = (key: string) => i18n.t(`bulk_tab.settings.encounters.${key}`);

// As the results store it: null for both on a health-based encounter, which has no set length.
export const encounterLength = ({
	duration,
	durationVariation,
	useHealth,
}: Pick<Encounter, 'duration' | 'durationVariation' | 'useHealth'>): EncounterLength =>
	useHealth ? { duration: null, durationVariation: null } : { duration, durationVariation };

// "m:ss ±Ns", or "m:ss" alone when the variation is null; a health-based encounter shows how it ends.
export const formatEncounterDuration = ({ duration, durationVariation }: EncounterLength): string => {
	if (duration === null) return t('health_summary');
	const length = formatDurationSeconds(duration, { separatorStyle: 'colon', minimumUnit: 'minutes' });
	return durationVariation === null ? length : `${length} ±${durationVariation}s`;
};

// The current encounter runs unnamed; every view calls it "Current".
export const encounterLabel = ({ isCurrent, name }: Pick<BulkEncounterResults, 'isCurrent' | 'name'>): string =>
	isCurrent ? i18n.t('bulk_tab.results.current') : name;

const entry = (name: string, preset: boolean, encounter: Encounter | undefined): BulkEncounterEntry[] =>
	encounter && encounter.targets.length > 0 ? [{ ref: BulkEncounterRef.create({ name, preset }), name, encounter }] : [];

// Presets first, then the user's saved encounters, in the order the Saved Encounters panel lists them. One with no
// encounter or no target cannot run and is left out.
export const bulkEncounterEntries = (
	presets: readonly PresetEncounter[] | undefined,
	saved: ReadonlyArray<{ name: string; data: SavedEncounter }>,
): BulkEncounterEntry[] => [
	...(presets ?? []).flatMap(({ name, encounter }) => entry(name, true, encounter)),
	...saved.flatMap(({ name, data }) => entry(name, false, data.encounter)),
];

export const pickableBulkEncounters = (host: IndividualSimHost<any>): BulkEncounterEntry[] =>
	bulkEncounterEntries(host.individualConfig.presets.encounters, storedSavedData(host, host.getSavedEncounterStorageKey(), SavedEncounter));
