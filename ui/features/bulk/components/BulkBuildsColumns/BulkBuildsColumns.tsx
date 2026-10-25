import i18n from '@i18n/config';
import { Box } from '@ui-kit/Box';
import type { ReactNode } from 'react';

import { EncounterPairs } from '../EncounterPairs';
import { GearSetups } from '../GearSetups';
import { TalentPairs } from '../TalentPairs';

export interface BulkBuildsColumnsViewProps {
	gear: ReactNode;
	encounters: ReactNode;
	talents: ReactNode;
}

type Column = keyof BulkBuildsColumnsViewProps;

const COLUMNS: readonly Column[] = ['gear', 'encounters', 'talents'];

export const BulkBuildsColumnsView = (props: BulkBuildsColumnsViewProps) => (
	<div className="grid gap-6 xl:grid-cols-3">
		{COLUMNS.map(column => (
			<Box key={column} className="grid content-start gap-4" testId={`bulk-builds-column-${column}`}>
				<div className="grid gap-2">
					<h5 className="mb-0">{i18n.t(`bulk_tab.builds.columns.${column}.title`)}</h5>
					<p className="mb-0 text-xs">{i18n.t(`bulk_tab.builds.columns.${column}.hint`)}</p>
				</div>
				{props[column]}
			</Box>
		))}
	</div>
);

export const BulkBuildsColumns = () => <BulkBuildsColumnsView gear={<GearSetups />} encounters={<EncounterPairs />} talents={<TalentPairs />} />;
