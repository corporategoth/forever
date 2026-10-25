import i18n from '@i18n/config';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProgressTrackerDialog, type ProgressTrackerHandle } from '@ui-kit/ProgressTrackerDialog';

import { BulkProgressSteps } from './BulkProgressSteps';

const CURRENT = {
	encounter: i18n.t('bulk_tab.builds.pairs.current_encounter'),
	encounterSummary: '3:00 ±5s · 1 target',
	settings: i18n.t('bulk_tab.builds.pairs.current_settings'),
	talents: i18n.t('bulk_tab.results.current_talents'),
	rotation: i18n.t('bulk_tab.results.current_rotation'),
};
const DEFAULT_60 = { encounter: 'Default - 60', encounterSummary: '5:00 ±30s · 3 targets', settings: 'Defaults' };
const ROWS = [
	CURRENT,
	{ ...CURRENT, talents: 'Fury', rotation: 'Fury' },
	{ ...CURRENT, talents: 'Fury', rotation: 'Fury - Autocast on use' },
	{ ...CURRENT, ...DEFAULT_60 },
	{ ...DEFAULT_60, talents: 'Fury', rotation: 'Fury' },
	{ ...DEFAULT_60, talents: 'Fury', rotation: 'Fury - Autocast on use' },
];

const pushProgress = (handle: ProgressTrackerHandle | null) =>
	handle?.setProgress({ title: i18n.t('bulk_tab.progress.high_iteration_rounds'), current: 10, total: 26 });

const meta = {
	title: 'Features/Bulk/BulkProgressSteps',
	component: BulkProgressSteps,
	tags: ['autodocs'],
	args: { rows: ROWS, running: 1 },
} satisfies Meta<typeof BulkProgressSteps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MidRun: Story = {};

/** A Builds batch in the progress dialog, a row per encounter pair and talent pair. */
export const BuildsDialog: Story = {
	render: args => (
		<ProgressTrackerDialog
			open
			title={i18n.t('bulk_tab.progress.title')}
			state={{ stage: 'running' }}
			hasProgressBar
			belowBar={<BulkProgressSteps {...args} />}
			onCancel={() => {}}
			ref={pushProgress}
		/>
	),
};

/** A Gear-mode batch runs one step, so the dialog shows no step table. */
export const GearDialog: Story = {
	render: () => (
		<ProgressTrackerDialog
			open
			title={i18n.t('bulk_tab.progress.title')}
			state={{ stage: 'running' }}
			hasProgressBar
			onCancel={() => {}}
			ref={pushProgress}
		/>
	),
};
