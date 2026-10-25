import type { Meta, StoryObj } from '@storybook/react-vite';
import { encounterPairsProps } from '@testing/storybook/fixtures/bulk-builds';

import { BulkPairList } from './BulkPairList';

const meta = {
	title: 'Features/Bulk/BulkPairList',
	component: BulkPairList,
	tags: ['autodocs'],
	args: encounterPairsProps().list,
	argTypes: {
		rows: { control: false },
		testIds: { control: false },
	},
	decorators: [
		Story => (
			<div className="w-96">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof BulkPairList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CurrentOnly: Story = { args: { rows: [] } };
