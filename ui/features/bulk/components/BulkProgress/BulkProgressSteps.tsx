import i18n from '@i18n/config';
import { Icon } from '@ui-kit/Icon';
import type { ProgressStepListHandle } from '@ui-kit/ProgressTrackerDialog';
import { Spinner } from '@ui-kit/Spinner';
import { Table, TableCell, TableHeaderCell, TableRow } from '@ui-kit/Table';
import { type Ref, useImperativeHandle, useState } from 'react';

import type { BulkBuildStep } from '../../model/builds';

export interface BulkProgressStepsProps {
	rows: readonly BulkBuildStep[];
	/** 0-based step being run; the ones before it are done. */
	running: number;
}

const COLUMNS = ['encounter', 'settings', 'talents', 'rotation'] as const;

// Every row and its status cell are there from the start, so the progress dialog keeps its height through the run. The
// wrapper scrolls sideways when the cells cannot wrap to the dialog's width.
export const BulkProgressSteps = ({ rows, running }: BulkProgressStepsProps) => (
	<div className="w-full overflow-x-auto text-left">
		<Table dense testId="bulk-progress-steps">
			<thead>
				<TableRow>
					{COLUMNS.map(column => (
						<TableHeaderCell key={column} scope="col" className="text-left">
							{i18n.t(`bulk_tab.builds.pairs.${column}`)}
						</TableHeaderCell>
					))}
					<TableHeaderCell scope="col">
						<span className="sr-only">{i18n.t('bulk_tab.progress.status')}</span>
					</TableHeaderCell>
				</TableRow>
			</thead>
			<tbody>
				{rows.map((row, index) => {
					const state = index < running ? 'done' : index === running ? 'running' : 'pending';
					return (
						<TableRow
							key={index}
							className={state === 'running' ? 'font-semibold' : undefined}
							data-state={state}
							aria-current={state === 'running' ? 'step' : undefined}
							testId="progress-step">
							{COLUMNS.map(column => (
								<TableCell key={column}>{row[column]}</TableCell>
							))}
							<TableCell className="w-4">
								{state === 'done' && <Icon name="circle-check" className="text-success" />}
								{state === 'running' && <Spinner size="xs" testId="progress-step-spinner" />}
							</TableCell>
						</TableRow>
					);
				})}
			</tbody>
		</Table>
	</div>
);

/** Takes the running step through `ref`, so a progress tick renders this leaf and never the dialog. */
export const HandleBulkProgressSteps = ({ rows, ref }: Pick<BulkProgressStepsProps, 'rows'> & { ref?: Ref<ProgressStepListHandle> }) => {
	const [running, setRunning] = useState(0);
	useImperativeHandle(ref, () => ({ setRunning }), []);
	return <BulkProgressSteps rows={rows} running={running} />;
};
