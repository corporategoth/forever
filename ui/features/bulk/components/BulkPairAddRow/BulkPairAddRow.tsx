import i18n from '@i18n/config';
import { Button } from '@ui-kit/Button';
import { ChoiceField } from '@ui-kit/ChoiceField';
import { useState } from 'react';

import { sameRef, type SavedRef } from '../../model/saved_refs';

interface PairSelect {
	label: string;
	options: ReadonlyArray<{ value: SavedRef; label: string }>;
}

export interface BulkPairAddRowProps {
	first: PairSelect;
	second: PairSelect;
	inList(first: SavedRef, second: SavedRef): boolean;
	onAdd(first: SavedRef, second: SavedRef): void;
	testId: string;
}

const samePick = (a: SavedRef | null, b: SavedRef | null) => (a === null || b === null ? a === b : sameRef(a, b));

// Both selects start empty, so nothing is marked until a whole pair is picked; after an add they are empty again.
export const BulkPairAddRow = ({ first, second, inList, onAdd, testId }: BulkPairAddRowProps) => {
	const [firstPick, setFirstPick] = useState<SavedRef | null>(null);
	const [secondPick, setSecondPick] = useState<SavedRef | null>(null);
	const blocked = firstPick !== null && secondPick !== null && inList(firstPick, secondPick);
	const select = (side: PairSelect, value: SavedRef | null, onChange: (next: SavedRef | null) => void) => (
		<ChoiceField<SavedRef | null>
			className="flex-1"
			ariaLabel={side.label}
			placeholder={side.label}
			options={side.options}
			value={value}
			equals={samePick}
			invalid={blocked}
			onChange={onChange}
		/>
	);

	return (
		<div className="grid gap-2" data-testid={testId}>
			<div className="flex items-center gap-2">
				{select(first, firstPick, setFirstPick)}
				{select(second, secondPick, setSecondPick)}
				<Button
					variant="primary"
					disabled={firstPick === null || secondPick === null || blocked}
					onClick={() => {
						if (firstPick === null || secondPick === null) return;
						onAdd(firstPick, secondPick);
						setFirstPick(null);
						setSecondPick(null);
					}}>
					{i18n.t('bulk_tab.builds.pairs.add')}
				</Button>
			</div>
			{blocked && <p className="mb-0 text-xs text-danger">{i18n.t('bulk_tab.builds.pairs.in_list')}</p>}
		</div>
	);
};
