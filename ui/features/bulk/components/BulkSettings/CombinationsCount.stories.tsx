import type { Meta, StoryObj } from '@storybook/react-vite';

import { CombinationsCountView, type CombinationsCountViewProps } from './CombinationsCount';

const BUILDS: NonNullable<CombinationsCountViewProps['builds']> = {
	setups: 6,
	encounterPairs: 2,
	talentPairs: 2,
	runs: 6,
	totalIterations: 240000,
	largestRequestIterations: 60000,
};

const meta = {
	title: 'Features/Bulk/BulkSettings/Components/CombinationsCount',
	component: CombinationsCountView,
	tags: ['autodocs'],
	args: { pending: false, combinations: 48, iterations: 96000, iterationsLimit: 1000000, builds: null },
} satisfies Meta<typeof CombinationsCountView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Single: Story = { args: { combinations: 1, iterations: 2000 } };

export const Pending: Story = { args: { pending: true } };

export const OverTheLimit: Story = { args: { combinations: 1200, iterations: 2400000 } };

export const Builds: Story = { args: { builds: BUILDS } };

export const BuildsWithoutGearSetups: Story = {
	args: { builds: { setups: 0, encounterPairs: 2, talentPairs: 2, runs: 0, totalIterations: 0, largestRequestIterations: 0 } },
};

export const BuildsOverTheLimit: Story = { args: { builds: { ...BUILDS, totalIterations: 2400000, largestRequestIterations: 1200000 } } };
