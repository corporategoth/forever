import type { APLRotation } from '@generated/proto/apl';
import { type BulkTalentPair, BulkTalentPairs } from '@generated/proto/ui';
import type { BulkRotationSetup, BulkTalentPairSetup, BulkTalentSetup } from '@sim/bulk/types';
import type { Player } from '@sim/player/player';
import { bulkState, patchBulkState, storeBulkTalentPairs } from '@sim/settings/bulk_settings';

import { CURRENT_REF, pairsAfterAdd, pairsAfterChecked, pairsAfterRemove, pairSide, pairSideOptions, type PairSides, resolvedPairs } from './pairs';
import { type BulkRotationEntry, rotationLabel } from './rotations';
import { type BulkTalentEntry, talentsLabel } from './talents';

export interface CurrentTalentPair {
	talentsString: string;
	rotation: APLRotation;
}

export const talentPairSides: PairSides<BulkTalentPair> = pair => [pair.talents ?? CURRENT_REF, pair.rotation ?? CURRENT_REF];

export const talentPairLabel = (pair: {
	talents: Pick<BulkTalentSetup, 'isCurrent' | 'name'>;
	rotation: Pick<BulkRotationSetup, 'isCurrent' | 'name'>;
}): string => `${talentsLabel(pair.talents)} · ${rotationLabel(pair.rotation)}`;

export const talentPairOptions = (talents: readonly BulkTalentEntry[], rotations: readonly BulkRotationEntry[]) => ({
	talents: pairSideOptions(talents, talentsLabel),
	rotations: pairSideOptions(rotations, rotationLabel),
});

export const bulkTalentPairList = (
	talents: readonly BulkTalentEntry[],
	rotations: readonly BulkRotationEntry[],
	pairs: readonly BulkTalentPair[],
): Array<{ pair: BulkTalentPair; label: string; checked: boolean }> =>
	resolvedPairs(pairs, talentPairSides, talents, rotations).map(({ pair, first, second }) => ({
		pair,
		label: talentPairLabel({ talents: pairSide(first), rotation: pairSide(second) }),
		checked: pair.checked,
	}));

const talentsSetup = (current: CurrentTalentPair, entry: BulkTalentEntry | null): BulkTalentSetup =>
	entry === null
		? { name: '', talentsString: current.talentsString, isCurrent: true }
		: { name: entry.name, talentsString: entry.talentsString, isCurrent: false };

const rotationSetup = (current: CurrentTalentPair, entry: BulkRotationEntry | null): BulkRotationSetup =>
	entry === null ? { name: '', isCurrent: true, rotation: current.rotation } : { name: entry.name, isCurrent: false, rotation: entry.rotation };

// The current pair runs first, with the rotation it is given, then every checked pair the list shows, in list order.
export const bulkTalentPairRuns = (
	current: CurrentTalentPair,
	talents: readonly BulkTalentEntry[],
	rotations: readonly BulkRotationEntry[],
	pairs: readonly BulkTalentPair[],
): BulkTalentPairSetup[] => [
	{ talents: talentsSetup(current, null), rotation: rotationSetup(current, null) },
	...resolvedPairs(pairs, talentPairSides, talents, rotations)
		.filter(({ pair }) => pair.checked)
		.map(({ first, second }) => ({ talents: talentsSetup(current, first), rotation: rotationSetup(current, second) })),
];

// No `settings` bump: the pairs change neither the Gear mode's combination count nor the stored BulkSettings.
const setTalentPairs = (player: Player<any>, talentPairs: BulkTalentPair[]) => {
	patchBulkState(player, { talentPairs });
	storeBulkTalentPairs(player, BulkTalentPairs.create({ pairs: talentPairs }));
};

export const addBulkTalentPair = (player: Player<any>, pair: BulkTalentPair) => {
	const talentPairs = pairsAfterAdd(bulkState(player).talentPairs, pair, talentPairSides);
	if (talentPairs) setTalentPairs(player, talentPairs);
};

export const removeBulkTalentPair = (player: Player<any>, pair: BulkTalentPair) =>
	setTalentPairs(player, pairsAfterRemove(bulkState(player).talentPairs, pair, talentPairSides));

export const setBulkTalentPairChecked = (player: Player<any>, pair: BulkTalentPair, checked: boolean) =>
	setTalentPairs(player, pairsAfterChecked(bulkState(player).talentPairs, pair, checked, talentPairSides));
