import i18n from '@i18n/config';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { encounterPairsProps, gearSetupsProps, talentPairsProps } from '@testing/storybook/fixtures/bulk-builds';
import { expect, userEvent, within } from 'storybook/test';

import { EncounterPairsView } from '../EncounterPairs';
import { GearSetupsView } from '../GearSetups';
import { TalentPairsView } from '../TalentPairs';
import { BulkBuildsColumnsView } from './BulkBuildsColumns';

const meta = {
	title: 'Features/Bulk/BulkBuildsColumns',
	component: BulkBuildsColumnsView,
	tags: ['autodocs'],
	args: {
		gear: <GearSetupsView {...gearSetupsProps()} />,
		encounters: <EncounterPairsView {...encounterPairsProps()} />,
		talents: <TalentPairsView {...talentPairsProps()} />,
	},
	argTypes: {
		gear: { control: false },
		encounters: { control: false },
		talents: { control: false },
	},
} satisfies Meta<typeof BulkBuildsColumnsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const pick = async (column: HTMLElement, select: string, option: string) => {
	await userEvent.click(within(column).getByRole('combobox', { name: select }));
	await userEvent.click(await within(column.ownerDocument.body).findByRole('option', { name: option }));
};

export const BlockedAdd: Story = {
	play: async ({ canvasElement }) => {
		const column = within(canvasElement).getByTestId('bulk-builds-column-encounters');
		await pick(column, i18n.t('bulk_tab.builds.pairs.encounter'), 'Long fight');
		await pick(column, i18n.t('bulk_tab.builds.pairs.settings'), i18n.t('bulk_tab.builds.pairs.current_settings'));
		await expect(within(column).getByText(i18n.t('bulk_tab.builds.pairs.in_list'))).toBeTruthy();
	},
};

export const EmptyLists: Story = {
	args: {
		gear: <GearSetupsView {...gearSetupsProps({ gearSets: { presets: [], saved: [] }, enchantPicks: [] })} />,
		encounters: <EncounterPairsView {...encounterPairsProps([])} />,
		talents: <TalentPairsView {...talentPairsProps([])} />,
	},
};
