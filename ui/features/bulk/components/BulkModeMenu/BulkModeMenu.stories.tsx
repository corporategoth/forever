import { Tabs } from '@base-ui/react/tabs';
import type { BulkMode } from '@sim/state/sim_store';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TabNav } from '@ui-kit/TabNav';
import { expect, fn, userEvent, within } from 'storybook/test';

import { BulkModeMenuView } from './BulkModeMenu';

interface BulkModeMenuFrameProps {
	label: string;
	mode: BulkMode;
	onPick: (mode: BulkMode) => void;
}

// The batch tab in a sim tab strip, the way the top navigation places it.
const BulkModeMenuFrame = ({ label, mode, onPick }: BulkModeMenuFrameProps) => (
	<Tabs.Root defaultValue="gear-tab">
		<TabNav
			variant="sim"
			tabs={[
				{ id: 'gear-tab', label: 'Gear' },
				{ id: 'bulk-tab', label, renderTab: tab => <BulkModeMenuView tab={tab} mode={mode} onPick={onPick} /> },
			]}
		/>
	</Tabs.Root>
);

const meta = {
	title: 'Features/Bulk/BulkModeMenu',
	component: BulkModeMenuFrame,
	subcomponents: { BulkModeMenuView },
	tags: ['autodocs'],
	args: { label: 'Batch · Gear', mode: 'gear', onPick: fn() },
	argTypes: { mode: { control: 'inline-radio', options: ['gear', 'builds'] } },
} satisfies Meta<typeof BulkModeMenuFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Open: Story = {
	play: async ({ canvasElement, args }) => {
		await userEvent.click(within(canvasElement).getByRole('tab', { name: 'Batch · Gear' }));
		const body = within(canvasElement.ownerDocument.body);
		await expect((await body.findByTestId('bulk-mode-gear')).getAttribute('aria-checked')).toBe('true');
		await expect(body.getByTestId('bulk-mode-builds').getAttribute('aria-checked')).toBe('false');
		await userEvent.click(body.getByTestId('bulk-mode-builds'));
		await expect(args.onPick).toHaveBeenCalledWith('builds');
	},
};

export const BuildsChecked: Story = { args: { label: 'Batch · Builds', mode: 'builds' } };
