import { BulkEncounterPair, BulkEncounterRef, BulkSettingsRef } from '@generated/proto/ui';
import i18n from '@i18n/config';
import { usePlayer } from '@sim/context/SimHostContext';
import { useMemo } from 'react';

import { useBulkEncounterPairs } from '../../hooks/useBulkEncounterPairs';
import {
	addBulkEncounterPair,
	bulkEncounterPairList,
	encounterPairLabel,
	encounterPairOptions,
	encounterPairSides,
	removeBulkEncounterPair,
	setBulkEncounterPairChecked,
} from '../../model/encounter_pairs';
import { pairInList, pairKey, pairSide } from '../../model/pairs';
import type { SavedRef } from '../../model/saved_refs';
import { BulkPairAddRow, type BulkPairAddRowProps } from '../BulkPairAddRow';
import { BulkPairList, type BulkPairListProps } from '../BulkPairList';

export interface EncounterPairsViewProps {
	list: BulkPairListProps;
	add: BulkPairAddRowProps;
}

const t = (key: string, options?: Record<string, unknown>) => i18n.t(`bulk_tab.builds.pairs.${key}`, options);

const toOption = ({ ref, label }: { ref: SavedRef; label: string }) => ({ value: ref, label });

const pairOf = (encounter: SavedRef, settings: SavedRef) =>
	BulkEncounterPair.create({ encounter: BulkEncounterRef.create(encounter), settings: BulkSettingsRef.create(settings), checked: true });

export const EncounterPairsView = ({ list, add }: EncounterPairsViewProps) => (
	<div className="grid gap-2">
		<BulkPairList {...list} />
		<BulkPairAddRow {...add} />
	</div>
);

export const EncounterPairs = () => {
	const player = usePlayer();
	const { encounters, settings, pairs } = useBulkEncounterPairs();
	const rows = useMemo(
		() => bulkEncounterPairList(encounters, settings, pairs).map(row => ({ ...row, key: pairKey(row.pair, encounterPairSides) })),
		[encounters, settings, pairs],
	);
	const options = useMemo(() => encounterPairOptions(encounters, settings), [encounters, settings]);
	const storedPair = (key: string) => rows.find(row => row.key === key)!.pair;

	return (
		<EncounterPairsView
			list={{
				current: encounterPairLabel({ encounter: pairSide(null), settings: pairSide(null) }),
				rows,
				onCheckedChange: (key, checked) => setBulkEncounterPairChecked(player, storedPair(key), checked),
				onRemove: key => removeBulkEncounterPair(player, storedPair(key)),
				removeLabel: label => t('remove', { pair: label }),
				testIds: { list: 'bulk-encounter-pairs', row: 'bulk-encounter-pair', current: 'bulk-encounter-pair-current' },
			}}
			add={{
				first: { label: t('encounter'), options: options.encounters.map(toOption) },
				second: { label: t('settings'), options: options.settings.map(toOption) },
				inList: (encounter, settingsRef) => pairInList(pairs, pairOf(encounter, settingsRef), encounterPairSides),
				onAdd: (encounter, settingsRef) => addBulkEncounterPair(player, pairOf(encounter, settingsRef)),
				testId: 'bulk-encounter-pair-add',
			}}
		/>
	);
};
