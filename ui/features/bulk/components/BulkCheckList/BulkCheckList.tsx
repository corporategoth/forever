import { BooleanPicker } from '@ui-kit/BooleanPicker';
import { useId } from 'react';

import type { SavedRef } from '../../model/saved_refs';

export interface BulkCheckRow {
	ref: SavedRef;
	name: string;
	summary: string;
	checked: boolean;
	duplicate: boolean;
}

export interface BulkCheckListProps {
	/** `presets` heads the ungrouped presets; a list with no presets leaves it out. */
	strings: { presets?: string; saved: string; empty: string; duplicate: string };
	/** The locked first row; null for a list with no current entry. */
	current: { label: string; summary: string } | null;
	presets: readonly BulkCheckRow[];
	saved: readonly BulkCheckRow[];
	onCheckedChange: (ref: SavedRef, checked: boolean) => void;
	testIds: { list: string; row: string; current?: string };
}

interface CheckRowProps {
	id: string;
	label: string;
	summary: string;
	checked: boolean;
	disabled?: boolean;
	duplicate?: boolean;
	duplicateText: string;
	onChange: (checked: boolean) => void;
	testId?: string;
}

// The summary shows as the label's hover tooltip; the sr-only copy describes the checkbox for screen readers, which
// the tooltip does not reach.
const CheckRow = ({ id, label, summary, checked, disabled, duplicate = false, duplicateText, onChange, testId }: CheckRowProps) => (
	<>
		<BooleanPicker
			id={id}
			label={label}
			labelTooltip={summary}
			layout="inline"
			density="compact"
			value={checked}
			disabled={disabled}
			invalid={duplicate}
			aria-describedby={duplicate ? `${id}-summary ${id}-duplicate` : `${id}-summary`}
			onChange={onChange}
			testId={testId}
		/>
		<span id={`${id}-summary`} className="sr-only">
			{summary}
		</span>
		{duplicate && (
			<span id={`${id}-duplicate`} className="sr-only">
				{duplicateText}
			</span>
		)}
	</>
);

// Ungrouped presets under the presets heading first, then one heading per preset group in the order the rows bring them,
// as the Gear tab groups its preset chips.
const presetGroups = (heading: string, presets: readonly BulkCheckRow[]): Array<{ heading: string; rows: BulkCheckRow[] }> => {
	const byGroup = new Map<string, BulkCheckRow[]>([['', []]]);
	for (const row of presets) {
		const group = row.ref.group ?? '';
		if (!byGroup.has(group)) byGroup.set(group, []);
		byGroup.get(group)!.push(row);
	}
	return [...byGroup].map(([group, rows]) => ({ heading: group || heading, rows }));
};

export const BulkCheckList = ({ strings, current, presets, saved, onCheckedChange, testIds }: BulkCheckListProps) => {
	const idPrefix = useId();
	// A labelled group per heading, so two rows of one name under two headings read apart.
	const group = (key: string, heading: string, rows: readonly BulkCheckRow[]) =>
		rows.length > 0 && (
			<div key={key} role="group" aria-labelledby={`${idPrefix}-${key}`} className="grid gap-1">
				<h6 id={`${idPrefix}-${key}`} className="mb-0 text-xs text-gray-400">
					{heading}
				</h6>
				{rows.map((row, index) => (
					<CheckRow
						key={row.name}
						id={`${idPrefix}-${key}-${index}`}
						label={row.name}
						summary={row.summary}
						checked={row.checked}
						duplicate={row.duplicate}
						duplicateText={strings.duplicate}
						onChange={checked => onCheckedChange(row.ref, checked)}
						testId={testIds.row}
					/>
				))}
			</div>
		);

	return (
		<div className="grid gap-2" data-testid={testIds.list}>
			{current && (
				<CheckRow
					id={`${idPrefix}-current`}
					label={current.label}
					summary={current.summary}
					checked
					disabled
					duplicateText={strings.duplicate}
					onChange={() => {}}
					testId={testIds.current}
				/>
			)}
			{presetGroups(strings.presets ?? '', presets).map(({ heading, rows }, index) => group(`preset-${index}`, heading, rows))}
			{group('saved', strings.saved, saved)}
			{!presets.length && !saved.length && <p className="mb-0 text-sm text-gray-400">{strings.empty}</p>}
		</div>
	);
};
