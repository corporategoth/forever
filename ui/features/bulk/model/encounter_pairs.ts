import type { SpecPresets } from '@features/hooks/useSavedPanel';
import { settingsPresets } from '@features/settings/components/SavedSettings/utils';
import type { Encounter } from '@generated/proto/common';
import { type BulkEncounterPair, BulkEncounterPairs, BulkSettingsRef, SavedSettings } from '@generated/proto/ui';
import i18n from '@i18n/config';
import type { BulkEncounterPairSetup, BulkEncounterResults, BulkEncounterSetup, BulkPlayerSettingsSetup } from '@sim/bulk/types';
import type { Player } from '@sim/player/player';
import { bulkState, patchBulkState, storeBulkEncounterPairs } from '@sim/settings/bulk_settings';
import type { IndividualSimHost } from '@sim/sim_host';

import { type BulkEncounterEntry, encounterLabel } from './encounters';
import {
	CURRENT_REF,
	pairsAfterAdd,
	pairsAfterChecked,
	pairsAfterRemove,
	type PairSide,
	pairSide,
	pairSideOptions,
	type PairSides,
	resolvedPairs,
} from './pairs';
import { storedSavedData } from './saved_refs';

export interface BulkSettingsEntry {
	ref: BulkSettingsRef;
	name: string;
	settings: SavedSettings;
}

export const encounterPairSides: PairSides<BulkEncounterPair> = pair => [pair.encounter ?? CURRENT_REF, pair.settings ?? CURRENT_REF];

const entry = (name: string, preset: boolean, settings: SavedSettings): BulkSettingsEntry => ({
	ref: BulkSettingsRef.create({ name, preset }),
	name,
	settings,
});

// The Saved Settings panel's presets first, the spec's settings and then its item swaps, then the user's saved entries in
// the order the panel lists them.
export const bulkSettingsEntries = (
	presets: SpecPresets,
	saved: ReadonlyArray<{ name: string; data: SavedSettings }>,
	host: IndividualSimHost<any>,
): BulkSettingsEntry[] => [
	...settingsPresets(presets, host).map(({ name, data }) => entry(name, true, data)),
	...saved.map(({ name, data }) => entry(name, false, data)),
];

// The panel's lenient read also clears oneofs it could not read; no SavedSettings field reaches one, so ignoring unknown
// fields reads the same.
export const pickableBulkSettings = (host: IndividualSimHost<any>): BulkSettingsEntry[] =>
	bulkSettingsEntries(
		host.individualConfig.presets,
		storedSavedData(host, host.getSavedSettingsStorageKey(), SavedSettings, { ignoreUnknownFields: true }),
		host,
	);

export const encounterSideLabel = ({ isCurrent, name }: PairSide): string => (isCurrent ? i18n.t('bulk_tab.builds.pairs.current_encounter') : name);

export const settingsSideLabel = ({ isCurrent, name }: PairSide): string => (isCurrent ? i18n.t('bulk_tab.builds.pairs.current_settings') : name);

export const encounterPairLabel = (pair: {
	encounter: Pick<BulkEncounterSetup, 'isCurrent' | 'name'>;
	settings: Pick<BulkPlayerSettingsSetup, 'isCurrent' | 'name'>;
}): string => `${encounterSideLabel(pair.encounter)} · ${settingsSideLabel(pair.settings)}`;

export const bulkEntryLabel = (entry: Pick<BulkEncounterResults, 'isCurrent' | 'name' | 'settings'>): string =>
	entry.settings === null ? encounterLabel(entry) : encounterPairLabel({ encounter: entry, settings: entry.settings });

export const encounterPairOptions = (encounters: readonly BulkEncounterEntry[], settings: readonly BulkSettingsEntry[]) => ({
	encounters: pairSideOptions(encounters, encounterSideLabel),
	settings: pairSideOptions(settings, settingsSideLabel),
});

export const bulkEncounterPairList = (
	encounters: readonly BulkEncounterEntry[],
	settings: readonly BulkSettingsEntry[],
	pairs: readonly BulkEncounterPair[],
): Array<{ pair: BulkEncounterPair; label: string; checked: boolean }> =>
	resolvedPairs(pairs, encounterPairSides, encounters, settings).map(({ pair, first, second }) => ({
		pair,
		label: encounterPairLabel({ encounter: pairSide(first), settings: pairSide(second) }),
		checked: pair.checked,
	}));

const encounterSetup = (current: Encounter, entry: BulkEncounterEntry | null): BulkEncounterSetup =>
	entry === null ? { name: '', isCurrent: true, encounter: current } : { name: entry.name, isCurrent: false, encounter: entry.encounter };

const settingsSetup = (entry: BulkSettingsEntry | null): BulkPlayerSettingsSetup =>
	entry === null ? { name: '', isCurrent: true, settings: null } : { name: entry.name, isCurrent: false, settings: entry.settings };

// The current pair runs first, then every checked pair the list shows, in list order.
export const bulkEncounterPairRuns = (
	current: Encounter,
	encounters: readonly BulkEncounterEntry[],
	settings: readonly BulkSettingsEntry[],
	pairs: readonly BulkEncounterPair[],
): BulkEncounterPairSetup[] => [
	{ encounter: encounterSetup(current, null), settings: settingsSetup(null) },
	...resolvedPairs(pairs, encounterPairSides, encounters, settings)
		.filter(({ pair }) => pair.checked)
		.map(({ first, second }) => ({ encounter: encounterSetup(current, first), settings: settingsSetup(second) })),
];

// No `settings` bump: the pairs change neither the Gear mode's combination count nor the stored BulkSettings.
const setEncounterPairs = (player: Player<any>, encounterPairs: BulkEncounterPair[]) => {
	patchBulkState(player, { encounterPairs });
	storeBulkEncounterPairs(player, BulkEncounterPairs.create({ pairs: encounterPairs }));
};

export const addBulkEncounterPair = (player: Player<any>, pair: BulkEncounterPair) =>
	setEncounterPairs(player, pairsAfterAdd(bulkState(player).encounterPairs, pair, encounterPairSides));

export const removeBulkEncounterPair = (player: Player<any>, pair: BulkEncounterPair) =>
	setEncounterPairs(player, pairsAfterRemove(bulkState(player).encounterPairs, pair, encounterPairSides));

export const setBulkEncounterPairChecked = (player: Player<any>, pair: BulkEncounterPair, checked: boolean) =>
	setEncounterPairs(player, pairsAfterChecked(bulkState(player).encounterPairs, pair, checked, encounterPairSides));
