import type { Meta, StoryObj } from '@storybook/react-vite';
import { encounterPairsProps } from '@testing/storybook/fixtures/bulk-builds';

import { EncounterPairsView } from './EncounterPairs';

const meta = {
	title: 'Features/Bulk/EncounterPairs',
	component: EncounterPairsView,
	tags: ['autodocs'],
	args: encounterPairsProps(),
	argTypes: {
		list: { control: false },
		add: { control: false },
	},
	decorators: [
		Story => (
			<div className="w-96">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof EncounterPairsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CurrentOnly: Story = { args: encounterPairsProps([]) };
