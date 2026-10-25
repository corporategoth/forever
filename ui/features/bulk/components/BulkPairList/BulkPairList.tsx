import { BooleanPicker } from '@ui-kit/BooleanPicker';
import { Button } from '@ui-kit/Button';
import { Icon } from '@ui-kit/Icon';
import { useId } from 'react';

export interface BulkPairListProps {
	current: string;
	rows: ReadonlyArray<{ key: string; label: string; checked: boolean }>;
	onCheckedChange(key: string, checked: boolean): void;
	onRemove(key: string): void;
	removeLabel(label: string): string;
	testIds: { list: string; row: string; current: string };
}

export const BulkPairList = ({ current, rows, onCheckedChange, onRemove, removeLabel, testIds }: BulkPairListProps) => {
	const idPrefix = useId();
	return (
		<div className="grid gap-2" data-testid={testIds.list}>
			<BooleanPicker
				id={`${idPrefix}-current`}
				label={current}
				layout="inline"
				density="compact"
				value
				disabled
				onChange={() => {}}
				testId={testIds.current}
			/>
			{rows.map((row, index) => (
				<div key={row.key} className="group flex items-center gap-2" data-testid={testIds.row}>
					<BooleanPicker
						id={`${idPrefix}-${index}`}
						className="min-w-0 flex-1"
						label={row.label}
						layout="inline"
						density="compact"
						value={row.checked}
						onChange={checked => onCheckedChange(row.key, checked)}
					/>
					<Button
						iconOnly
						variant="link-danger"
						className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
						aria-label={removeLabel(row.label)}
						onClick={() => onRemove(row.key)}>
						<Icon name="xmark" />
					</Button>
				</div>
			))}
		</div>
	);
};
