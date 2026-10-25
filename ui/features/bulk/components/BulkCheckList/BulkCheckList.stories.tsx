import i18n from '@i18n/config';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';

import type { SavedRef } from '../../model/saved_refs';
import { BulkCheckList, type BulkCheckListProps, type BulkCheckRow } from './BulkCheckList';

const StatefulCheckList = (props: BulkCheckListProps) => {
	const [presets, setPresets] = useState(props.presets);
	const [saved, setSaved] = useState(props.saved);
	const toggle = (rows: readonly BulkCheckRow[], ref: SavedRef, checked: boolean) => rows.map(row => (row.ref === ref ? { ...row, checked } : row));
	return (
		<BulkCheckList
			{...props}
			presets={presets}
			saved={saved}
			onCheckedChange={(ref, checked) => {
				if (ref.preset) setPresets(toggle(presets, ref, checked));
				else setSaved(toggle(saved, ref, checked));
				props.onCheckedChange(ref, checked);
			}}
		/>
	);
};

const gearSetStrings: BulkCheckListProps['strings'] = {
	presets: i18n.t('bulk_tab.settings.gear_sets.presets'),
	saved: i18n.t('bulk_tab.settings.gear_sets.saved'),
	empty: i18n.t('bulk_tab.settings.gear_sets.empty'),
	duplicate: i18n.t('bulk_tab.settings.gear_sets.duplicate'),
};

const enchantPickStrings: BulkCheckListProps['strings'] = {
	presets: i18n.t('bulk_tab.settings.gear_sets.presets'),
	saved: i18n.t('bulk_tab.settings.enchant_picks.saved'),
	empty: i18n.t('bulk_tab.settings.enchant_picks.empty'),
	duplicate: i18n.t('bulk_tab.settings.enchant_picks.duplicate'),
};

const rowOf =
	(preset: boolean) =>
	(name: string, summary: string, checked = false, duplicate = false): BulkCheckRow => ({
		ref: { name, preset },
		name,
		summary,
		checked,
		duplicate,
	});
const presetRow = rowOf(true);
const savedRow = rowOf(false);

const meta = {
	title: 'Features/Bulk/BulkCheckList',
	component: BulkCheckList,
	tags: ['autodocs'],
	render: args => <StatefulCheckList {...args} />,
	args: {
		strings: gearSetStrings,
		current: { label: i18n.t('bulk_tab.settings.gear_sets.current'), summary: '16 items.' },
		presets: [presetRow('P1 Fury', '17 items.', true), presetRow('Pre-BiS', '17 items.')],
		saved: [savedRow('My raid set', '16 items.', true)],
		onCheckedChange: fn(),
		testIds: { list: 'bulk-gear-sets', row: 'bulk-gear-set', current: 'bulk-gear-set-current' },
	},
	argTypes: {
		strings: { control: false },
		testIds: { control: false },
	},
	decorators: [
		Story => (
			<div className="w-80">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof BulkCheckList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GearSets: Story = {};

export const WithoutCurrentRow: Story = {
	args: {
		strings: enchantPickStrings,
		current: null,
		presets: [],
		saved: [savedRow('Agility cloak', '1 slot.', true), savedRow('Crusader weapons', '2 slots.')],
		testIds: { list: 'bulk-enchant-picks', row: 'bulk-enchant-pick' },
	},
};

export const Duplicate: Story = {
	args: {
		saved: [savedRow('My raid set', '16 items.', true), savedRow('My raid set, saved twice', '16 items.', true, true), savedRow('Old set', '15 items.')],
	},
};

export const Empty: Story = { args: { presets: [], saved: [] } };
