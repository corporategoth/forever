import type { BulkCheckRow } from '@features/bulk/components/BulkCheckList';
import type { EncounterPairsViewProps } from '@features/bulk/components/EncounterPairs';
import type { GearSetupsViewProps } from '@features/bulk/components/GearSetups';
import type { TalentPairsViewProps } from '@features/bulk/components/TalentPairs';
import { sameRef, type SavedRef } from '@features/bulk/model/saved_refs';
import i18n from '@i18n/config';
import { fn } from 'storybook/test';

const ref = (name: string, preset = false): SavedRef => ({ name, preset });

const CURRENT = ref('');

const pairsText = (key: string, options?: Record<string, unknown>) => i18n.t(`bulk_tab.builds.pairs.${key}`, options);

const checkRow = (name: string, summary: string, preset: boolean, checked: boolean, duplicate = false): BulkCheckRow => ({
	ref: ref(name, preset),
	name,
	summary,
	checked,
	duplicate,
});

export const gearSetupsProps = (overrides: Partial<GearSetupsViewProps> = {}): GearSetupsViewProps => ({
	currentGearSummary: '16 items.',
	gearSets: {
		presets: [checkRow('P1 Fury', '17 items.', true, true), checkRow('Pre-BiS', '17 items.', true, false)],
		saved: [checkRow('My raid set', '16 items.', false, true)],
	},
	enchantPicks: [checkRow('Agility cloak', '1 slot.', false, true), checkRow('Crusader weapons', '2 slots.', false, false)],
	onGearSetCheckedChange: fn(),
	onEnchantPickCheckedChange: fn(),
	...overrides,
});

type PairRow = readonly [first: SavedRef, second: SavedRef, label: string, checked: boolean];

const pairColumn = (
	current: string,
	first: { label: string; options: ReadonlyArray<{ value: SavedRef; label: string }> },
	second: { label: string; options: ReadonlyArray<{ value: SavedRef; label: string }> },
	pairs: readonly PairRow[],
	testIds: { list: string; row: string; current: string; add: string },
) => ({
	list: {
		current,
		rows: pairs.map(([, , label, checked]) => ({ key: label, label, checked })),
		onCheckedChange: fn(),
		onRemove: fn(),
		removeLabel: (label: string) => pairsText('remove', { pair: label }),
		testIds: { list: testIds.list, row: testIds.row, current: testIds.current },
	},
	add: {
		first,
		second,
		inList: (a: SavedRef, b: SavedRef) =>
			(sameRef(a, CURRENT) && sameRef(b, CURRENT)) || pairs.some(([listedFirst, listedSecond]) => sameRef(listedFirst, a) && sameRef(listedSecond, b)),
		onAdd: fn(),
		testId: testIds.add,
	},
});

const LONG_FIGHT = ref('Long fight', true);
const SHORT_FIGHT = ref('Short fight');
const TANK_HEALING = ref('Tank healing');

export const ENCOUNTER_PAIRS: readonly PairRow[] = [
	[LONG_FIGHT, CURRENT, `Long fight · ${pairsText('current_settings')}`, true],
	[LONG_FIGHT, TANK_HEALING, 'Long fight · Tank healing', true],
	[SHORT_FIGHT, CURRENT, `Short fight · ${pairsText('current_settings')}`, false],
];

export const encounterPairsProps = (pairs: readonly PairRow[] = ENCOUNTER_PAIRS): EncounterPairsViewProps =>
	pairColumn(
		`${pairsText('current_encounter')} · ${pairsText('current_settings')}`,
		{
			label: pairsText('encounter'),
			options: [
				{ value: CURRENT, label: pairsText('current_encounter') },
				{ value: LONG_FIGHT, label: 'Long fight' },
				{ value: SHORT_FIGHT, label: 'Short fight' },
			],
		},
		{
			label: pairsText('settings'),
			options: [
				{ value: CURRENT, label: pairsText('current_settings') },
				{ value: TANK_HEALING, label: 'Tank healing' },
			],
		},
		pairs,
		{ list: 'bulk-encounter-pairs', row: 'bulk-encounter-pair', current: 'bulk-encounter-pair-current', add: 'bulk-encounter-pair-add' },
	);

const FURY = ref('Fury', true);
const ARMS = ref('Arms', true);
const MY_APL = ref('My APL');

export const TALENT_PAIRS: readonly PairRow[] = [
	[FURY, FURY, 'Fury · Fury', true],
	[ARMS, ARMS, 'Arms · Arms', true],
	[FURY, MY_APL, 'Fury · My APL', false],
];

export const talentPairsProps = (pairs: readonly PairRow[] = TALENT_PAIRS): TalentPairsViewProps =>
	pairColumn(
		`${i18n.t('bulk_tab.results.current_talents')} · ${i18n.t('bulk_tab.results.current_rotation')}`,
		{
			label: pairsText('talents'),
			options: [
				{ value: CURRENT, label: i18n.t('bulk_tab.results.current_talents') },
				{ value: FURY, label: 'Fury' },
				{ value: ARMS, label: 'Arms' },
			],
		},
		{
			label: pairsText('rotation'),
			options: [
				{ value: CURRENT, label: i18n.t('bulk_tab.results.current_rotation') },
				{ value: FURY, label: 'Fury' },
				{ value: ARMS, label: 'Arms' },
				{ value: MY_APL, label: 'My APL' },
			],
		},
		pairs,
		{ list: 'bulk-talent-pairs', row: 'bulk-talent-pair', current: 'bulk-talent-pair-current', add: 'bulk-talent-pair-add' },
	);
