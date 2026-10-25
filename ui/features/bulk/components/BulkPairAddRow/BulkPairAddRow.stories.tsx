import i18n from '@i18n/config';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { sameRef, type SavedRef } from '../../model/saved_refs';
import { BulkPairAddRow } from './BulkPairAddRow';

const ref = (name: string, preset = false): SavedRef => ({ name, preset });

const CURRENT = ref('');

const LISTED: ReadonlyArray<readonly [SavedRef, SavedRef]> = [
	[CURRENT, CURRENT],
	[ref('Long fight', true), CURRENT],
];

const meta = {
	title: 'Features/Bulk/BulkPairAddRow',
	component: BulkPairAddRow,
	tags: ['autodocs'],
	args: {
		first: {
			label: i18n.t('bulk_tab.builds.pairs.encounter'),
			options: [
				{ value: CURRENT, label: i18n.t('bulk_tab.builds.pairs.current_encounter') },
				{ value: ref('Long fight', true), label: 'Long fight' },
				{ value: ref('Short fight'), label: 'Short fight' },
			],
		},
		second: {
			label: i18n.t('bulk_tab.builds.pairs.settings'),
			options: [
				{ value: CURRENT, label: i18n.t('bulk_tab.builds.pairs.current_settings') },
				{ value: ref('Tank healing'), label: 'Tank healing' },
			],
		},
		inList: (first, second) => LISTED.some(([a, b]) => sameRef(a, first) && sameRef(b, second)),
		onAdd: fn(),
		testId: 'bulk-encounter-pair-add',
	},
	argTypes: {
		first: { control: false },
		second: { control: false },
	},
	decorators: [
		Story => (
			<div className="w-96">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof BulkPairAddRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

const pick = async (canvasElement: HTMLElement, select: string, option: string) => {
	await userEvent.click(within(canvasElement).getByRole('combobox', { name: select }));
	await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole('option', { name: option }));
};

export const AlreadyInTheList: Story = {
	play: async ({ canvasElement }) => {
		await pick(canvasElement, i18n.t('bulk_tab.builds.pairs.encounter'), 'Long fight');
		await pick(canvasElement, i18n.t('bulk_tab.builds.pairs.settings'), i18n.t('bulk_tab.builds.pairs.current_settings'));
		await expect(within(canvasElement).getByText(i18n.t('bulk_tab.builds.pairs.in_list'))).toBeTruthy();
	},
};
