import { BulkRotationRef, BulkTalentPair, BulkTalentRef } from '@generated/proto/ui';
import i18n from '@i18n/config';
import { usePlayer } from '@sim/context/SimHostContext';
import { useMemo } from 'react';

import { useBulkTalentPairs } from '../../hooks/useBulkTalentPairs';
import { pairInList, pairKey, pairSide } from '../../model/pairs';
import type { SavedRef } from '../../model/saved_refs';
import {
	addBulkTalentPair,
	bulkTalentPairList,
	removeBulkTalentPair,
	setBulkTalentPairChecked,
	talentPairLabel,
	talentPairOptions,
	talentPairSides,
} from '../../model/talent_pairs';
import { BulkPairAddRow, type BulkPairAddRowProps } from '../BulkPairAddRow';
import { BulkPairList, type BulkPairListProps } from '../BulkPairList';

export interface TalentPairsViewProps {
	list: BulkPairListProps;
	add: BulkPairAddRowProps;
}

const t = (key: string, options?: Record<string, unknown>) => i18n.t(`bulk_tab.builds.pairs.${key}`, options);

const toOption = ({ ref, label }: { ref: SavedRef; label: string }) => ({ value: ref, label });

const pairOf = (talents: SavedRef, rotation: SavedRef) =>
	BulkTalentPair.create({ talents: BulkTalentRef.create(talents), rotation: BulkRotationRef.create(rotation), checked: true });

export const TalentPairsView = ({ list, add }: TalentPairsViewProps) => (
	<div className="grid gap-2">
		<BulkPairList {...list} />
		<BulkPairAddRow {...add} />
	</div>
);

export const TalentPairs = () => {
	const player = usePlayer();
	const { talents, rotations, pairs } = useBulkTalentPairs();
	const rows = useMemo(
		() => bulkTalentPairList(talents, rotations, pairs).map(row => ({ ...row, key: pairKey(row.pair, talentPairSides) })),
		[talents, rotations, pairs],
	);
	const options = useMemo(() => talentPairOptions(talents, rotations), [talents, rotations]);
	const storedPair = (key: string) => rows.find(row => row.key === key)!.pair;

	return (
		<TalentPairsView
			list={{
				current: talentPairLabel({ talents: pairSide(null), rotation: pairSide(null) }),
				rows,
				onCheckedChange: (key, checked) => setBulkTalentPairChecked(player, storedPair(key), checked),
				onRemove: key => removeBulkTalentPair(player, storedPair(key)),
				removeLabel: label => t('remove', { pair: label }),
				testIds: { list: 'bulk-talent-pairs', row: 'bulk-talent-pair', current: 'bulk-talent-pair-current' },
			}}
			add={{
				first: { label: t('talents'), options: options.talents.map(toOption) },
				second: { label: t('rotation'), options: options.rotations.map(toOption) },
				inList: (talentsRef, rotation) => pairInList(pairs, pairOf(talentsRef, rotation), talentPairSides),
				onAdd: (talentsRef, rotation) => addBulkTalentPair(player, pairOf(talentsRef, rotation)),
				testId: 'bulk-talent-pair-add',
			}}
		/>
	);
};
