import type { Meta, StoryObj } from '@storybook/react-vite';

import { BulkTabLabelView } from './BulkTabLabel';

const meta = {
	title: 'Features/Bulk/BulkTabLabel',
	component: BulkTabLabelView,
	tags: ['autodocs'],
	args: { powerTools: true, mode: 'gear' },
	argTypes: { mode: { control: 'inline-radio', options: ['gear', 'builds'] } },
} satisfies Meta<typeof BulkTabLabelView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gear: Story = {};

export const Builds: Story = { args: { mode: 'builds' } };

export const WithoutPowerTools: Story = { args: { powerTools: false } };
