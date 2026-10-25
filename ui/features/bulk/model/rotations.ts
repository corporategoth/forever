import { APLRotation, APLRotation_Type as APLRotationType } from '@generated/proto/apl';
import { BulkRotationRef, BulkRotationSelection, SavedRotation } from '@generated/proto/ui';
import i18n from '@i18n/config';
import type { BulkRotationSetup } from '@sim/bulk/types';
import type { Player } from '@sim/player/player';
import type { PresetRotation } from '@sim/presets/types';
import { bulkState, patchBulkState, storeBulkRotations } from '@sim/settings/bulk_settings';
import type { IndividualSimHost } from '@sim/sim_host';
import { omitDeep } from '@sim/utils/collections';

import { checkedRefList, checkedRefsAfter, storedSavedData } from './saved_refs';

export interface BulkRotationEntry {
	ref: BulkRotationRef;
	name: string;
	rotation: APLRotation;
}

// The editor gives APL values uuids, so two rotations that differ only in uuids are the same.
const sameRotation = (a: APLRotation, b: APLRotation) => APLRotation.equals(omitDeep(a, ['uuid']), omitDeep(b, ['uuid']));

const entry = (name: string, preset: boolean, rotation: APLRotation): BulkRotationEntry => ({
	ref: BulkRotationRef.create({ name, preset }),
	name,
	rotation,
});

// Every spec preset first, then the user's saved rotations in the order the Saved Rotations panel lists them.
export const bulkRotationEntries = (
	presets: readonly PresetRotation[] | undefined,
	saved: ReadonlyArray<{ name: string; data: SavedRotation }>,
): BulkRotationEntry[] => [
	...(presets ?? []).map(preset => entry(preset.name, true, preset.rotation.rotation ?? APLRotation.create())),
	...saved.map(({ name, data }) => entry(name, false, data.rotation ?? APLRotation.create())),
];

// Read uuid-stripped, as the Saved Rotations panel reads them.
export const pickableBulkRotations = (host: IndividualSimHost<any>): BulkRotationEntry[] =>
	bulkRotationEntries(
		host.individualConfig.presets.rotations,
		storedSavedData(host, host.getSavedRotationStorageKey(), SavedRotation).map(({ name, data }) => ({ name, data: omitDeep(data, ['uuid']) })),
	);

// The rows the Rotations list shows, in list order. One equal to the current rotation is left out, since the current one
// runs anyway; a checked one equal to an earlier checked row is flagged. A checked ref whose rotation no longer exists has
// no row.
export const bulkRotationList = (current: APLRotation, entries: readonly BulkRotationEntry[], checked: readonly BulkRotationRef[]) =>
	checkedRefList(
		entries,
		checked,
		entry => sameRotation(entry.rotation, current),
		(a, b) => sameRotation(a.rotation, b.rotation),
	);

// The current rotation runs first, unnamed, then every checked row the list neither leaves out nor flags.
export const bulkRotationRuns = (current: APLRotation, entries: readonly BulkRotationEntry[], checked: readonly BulkRotationRef[]): BulkRotationSetup[] => [
	{ name: '', isCurrent: true, rotation: current },
	...bulkRotationList(current, entries, checked)
		.filter(item => item.checked && !item.duplicate)
		.map(({ name, rotation }) => ({ name, isCurrent: false, rotation })),
];

// No `settings` bump: the rotations change neither the Gear mode's combination count nor the stored BulkSettings.
export const setBulkRotationChecked = (player: Player<any>, ref: BulkRotationRef, checked: boolean, pickable: readonly BulkRotationRef[]) => {
	const rotations = checkedRefsAfter(bulkState(player).rotations, ref, checked, pickable);
	patchBulkState(player, { rotations });
	storeBulkRotations(player, BulkRotationSelection.create({ rotations }));
};

// The current rotation runs unnamed; every view calls it "Current rotation".
export const rotationLabel = ({ isCurrent, name }: Pick<BulkRotationSetup, 'isCurrent' | 'name'>): string =>
	isCurrent ? i18n.t('bulk_tab.results.current_rotation') : name;

// A rotation with no type runs as an APL.
export const formatRotationSummary = (rotation: APLRotation): string => {
	switch (rotation.type) {
		case APLRotationType.TypeAuto:
			return i18n.t('rotation_tab.common.rotation_type.auto');
		case APLRotationType.TypeSimple:
			return i18n.t('rotation_tab.common.rotation_type.simple');
		default:
			return i18n.t('rotation_tab.common.rotation_type.apl');
	}
};
