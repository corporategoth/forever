import type { Meta, StoryObj } from '@storybook/react-vite';
import { talentPairsProps } from '@testing/storybook/fixtures/bulk-builds';

import { TalentPairsView } from './TalentPairs';

const meta = {
	title: 'Features/Bulk/TalentPairs',
	component: TalentPairsView,
	tags: ['autodocs'],
	args: talentPairsProps(),
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
} satisfies Meta<typeof TalentPairsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CurrentOnly: Story = { args: talentPairsProps([]) };
