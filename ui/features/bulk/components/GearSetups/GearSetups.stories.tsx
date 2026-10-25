import type { Meta, StoryObj } from '@storybook/react-vite';
import { gearSetupsProps } from '@testing/storybook/fixtures/bulk-builds';

import { GearSetupsView } from './GearSetups';

const meta = {
	title: 'Features/Bulk/GearSetups',
	component: GearSetupsView,
	tags: ['autodocs'],
	args: gearSetupsProps(),
	argTypes: {
		gearSets: { control: false },
		enchantPicks: { control: false },
	},
	decorators: [
		Story => (
			<div className="grid w-80 gap-4">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof GearSetupsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Duplicate: Story = {
	args: gearSetupsProps({
		gearSets: {
			presets: [],
			saved: [
				{ ref: { name: 'My raid set', preset: false }, name: 'My raid set', summary: '16 items', checked: true, duplicate: false },
				{ ref: { name: 'Raid set copy', preset: false }, name: 'Raid set copy', summary: '16 items', checked: true, duplicate: true },
			],
		},
	}),
};

export const Empty: Story = { args: gearSetupsProps({ gearSets: { presets: [], saved: [] }, enchantPicks: [] }) };
