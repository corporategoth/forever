import { BulkEnchantSlotOptions } from '@generated/proto/api';
import { APLRotation } from '@generated/proto/apl';
import { Encounter, EquipmentSpec, ItemSlot, ItemSpec, Race, Target } from '@generated/proto/common';
import {
	BulkEnchantPreset,
	BulkEncounterPair,
	BulkEncounterRef,
	BulkGearSetRef,
	BulkRotationRef,
	BulkSettingsRef,
	BulkTalentPair,
	BulkTalentRef,
	SavedEncounter,
	SavedGearSet,
	SavedRotation,
	SavedSettings,
	SavedTalents,
} from '@generated/proto/ui';
import i18n from '@i18n/config';
import { SimHostProvider } from '@sim/context/SimHostContext';
import type { Player } from '@sim/player/player';
import { PlayerSpecs } from '@sim/player/specs';
import { Stats } from '@sim/proto/stats';
import {
	bulkState,
	loadStoredBulkBuildEnchantPresets,
	loadStoredBulkEncounterPairs,
	loadStoredBulkTalentPairs,
	patchBulkState,
	seedBulkSettings,
} from '@sim/settings/bulk_settings';
import { type BulkMode, createSimStore, patchSlice, PLAYER_FIELDS, seedKeyed, zeroVersions } from '@sim/state/sim_store';
import { memoryEnv } from '@testing/sim/memory_env';
import { compareGearSet } from '@testing/storybook/fixtures/bulk-compare';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import english from '../../../assets/locales/en/translation.json';
import { BulkTabBody } from './BulkTabBody';

// No i18n mock: the columns show the real copy, and the test setup loads no locale, so this suite loads the English one.
beforeAll(() => {
	i18n.addResourceBundle('en', 'translation', english, true, true);
});
afterAll(() => {
	i18n.removeResourceBundle('en', 'translation');
});

vi.mock('@sim/hooks/useSimReady', () => ({ useSimReady: () => true }));
vi.mock('@features/bulk/components/BulkItemSearch', () => ({ BulkItemSearch: () => <div data-testid="bulk-item-search-stub" /> }));
vi.mock('@features/bulk/components/BulkPickerGroups', () => ({ BulkPickerGroups: () => <div data-testid="bulk-picker-groups-stub" /> }));
vi.mock('@features/bulk/components/BulkProgress', () => ({ BulkProgressDialog: () => null }));
vi.mock('@features/bulk/components/BulkSettings', () => ({ BulkSettings: () => <div data-testid="bulk-settings-stub" /> }));
vi.mock('@features/gear/components/SelectorModal', () => ({ SelectorModal: () => null }));
vi.mock('@features/import-export', () => ({ BulkGearImporterDialog: () => null }));

const STORE_KEY = 7;
const KEYS = { gear: 'saved-gear', encounters: 'saved-encounters', settings: 'saved-settings', talents: 'saved-talents', rotations: 'saved-rotations' };

// The stubbed database turns a spec into the set wearing its first item's id as a helm, so the id stands for the set.
const spec = (id: number) => EquipmentSpec.create({ items: [ItemSpec.create({ id })] });

const encounter = (duration: number) => Encounter.create({ duration, targets: [Target.create()] });

const enchants = (name: string, effectIds: number[]) =>
	BulkEnchantPreset.create({ name, slots: [BulkEnchantSlotOptions.create({ slot: ItemSlot.ItemSlotMainHand, effectIds })] });

const PRESETS = {
	gear: [
		{ name: 'P1 Fury', gear: spec(2) },
		{ name: 'Not for this player', gear: spec(3), enableWhen: () => false },
		{ name: 'Pre-BiS', gear: spec(4) },
	],
	encounters: [{ name: 'Patchwerk', encounter: encounter(300) }],
	settings: [{ name: 'Tank healing', race: Race.RaceHuman }],
	talents: [{ name: 'Arms', data: SavedTalents.create({ talentsString: '3030500130' }) }],
	rotations: [{ name: 'Fury APL', rotation: SavedRotation.create({ rotation: APLRotation.create() }) }],
};

const SAVED: Record<keyof typeof KEYS, Record<string, unknown>> = {
	gear: { 'My raid set': SavedGearSet.toJson(SavedGearSet.create({ gear: spec(5) })) },
	encounters: { Council: SavedEncounter.toJson(SavedEncounter.create({ encounter: encounter(90) })) },
	settings: { Healer: SavedSettings.toJson(SavedSettings.create({ race: Race.RaceDwarf })) },
	talents: { 'Deep Cruelty': SavedTalents.toJson(SavedTalents.create({ talentsString: '3030500130-05' })) },
	rotations: { 'My APL': SavedRotation.toJson(SavedRotation.create({ rotation: APLRotation.create() })) },
};

const encounterPair = (name: string, preset: boolean, settings = '', settingsPreset = false, checked = true) =>
	BulkEncounterPair.create({
		encounter: BulkEncounterRef.create({ name, preset }),
		settings: BulkSettingsRef.create({ name: settings, preset: settingsPreset }),
		checked,
	});

const talentPair = (talents: string, talentsPreset: boolean, rotation: string, rotationPreset: boolean) =>
	BulkTalentPair.create({
		talents: BulkTalentRef.create({ name: talents, preset: talentsPreset }),
		rotation: BulkRotationRef.create({ name: rotation, preset: rotationPreset }),
		checked: true,
	});

interface MountOptions {
	powerTools?: boolean;
	mode?: BulkMode;
	presets?: typeof PRESETS | Record<keyof typeof PRESETS, []>;
	saved?: Partial<Record<keyof typeof KEYS, Record<string, unknown>>>;
	gearSets?: BulkGearSetRef[];
	enchantPresets?: BulkEnchantPreset[];
	buildEnchantPresets?: string[];
	encounterPairs?: BulkEncounterPair[];
	talentPairs?: BulkTalentPair[];
}

const mount = ({
	powerTools = true,
	mode = 'builds',
	presets = PRESETS,
	saved = SAVED,
	gearSets = [],
	enchantPresets = [enchants('Undead', [1898]), enchants('Outdoor', [2504])],
	buildEnchantPresets = [],
	encounterPairs = [encounterPair('Patchwerk', true)],
	talentPairs = [talentPair('Arms', true, 'Fury APL', true)],
}: MountOptions = {}) => {
	for (const [kind, key] of Object.entries(KEYS)) localStorage.setItem(key, JSON.stringify(saved[kind as keyof typeof KEYS] ?? {}));
	const store = createSimStore();
	patchSlice(store, 'ui', { showPowerTools: powerTools });
	seedKeyed(store, 'players', STORE_KEY, { gear: compareGearSet(1), bonusStats: new Stats(), talentsString: '', v: zeroVersions(PLAYER_FIELDS) } as never);
	const player = {
		sim: {
			store,
			isNative: false,
			env: memoryEnv(),
			db: { lookupEquipmentSpec: (equipment: EquipmentSpec) => compareGearSet(equipment.items[0]?.id ?? 0) },
		},
		storeKey: STORE_KEY,
		getPlayerSpec: () => PlayerSpecs.DpsWarrior,
	} as unknown as Player<any>;
	seedBulkSettings(player);
	patchBulkState(player, { mode, gearSets, enchantPresets, buildEnchantPresets, encounterPairs, talentPairs });
	const host = {
		player,
		sim: player.sim,
		individualConfig: { presets },
		getStorageKey: (key: string) => `test-${key}`,
		getSavedGearStorageKey: () => KEYS.gear,
		getSavedEncounterStorageKey: () => KEYS.encounters,
		getSavedSettingsStorageKey: () => KEYS.settings,
		getSavedTalentsStorageKey: () => KEYS.talents,
		getSavedRotationStorageKey: () => KEYS.rotations,
	} as never;
	render(
		<SimHostProvider host={host}>
			<BulkTabBody />
		</SimHostProvider>,
	);
	return player;
};

const column = (name: 'gear' | 'encounters' | 'talents') => screen.getByTestId(`bulk-builds-column-${name}`);
const box = (name: string) => screen.getByRole('checkbox', { name });
// The texts a checkbox is described by: the row's summary, then the duplicate reason when there is one.
const descriptions = (name: string) => (box(name).getAttribute('aria-describedby') ?? '').split(' ').map(id => document.getElementById(id)?.textContent);
const texts = (elements: HTMLElement[]) => elements.map(element => element.textContent);
const listRows = (list: string, row: string) =>
	within(screen.getByTestId(list))
		.getAllByTestId(new RegExp(`^${row}(-current)?$`))
		.map(element => element.querySelector('label')?.textContent);
const pick = async (scope: HTMLElement, select: string, option: string) => {
	await userEvent.click(within(scope).getByRole('combobox', { name: select }));
	await userEvent.click(screen.getByRole('option', { name: option }));
};
const addButton = (scope: HTMLElement) => within(scope).getByRole('button', { name: 'Add' }) as HTMLButtonElement;
const encounterPairsStored = (player: Player<any>) =>
	loadStoredBulkEncounterPairs(player)?.pairs.map(pair => [pair.encounter?.name, pair.settings?.name, pair.checked]);

beforeEach(() => {
	localStorage.clear();
});

describe('BulkTabBody in Builds mode', () => {
	it('shows the three columns in place of the item search and slot pickers in Builds mode', () => {
		mount();

		expect(texts((['gear', 'encounters', 'talents'] as const).map(name => within(column(name)).getByRole('heading', { level: 5 })))).toEqual([
			'Gear',
			'Encounters & settings',
			'Talents & rotations',
		]);
		expect(within(column('gear')).getByText('Each gear set runs with each enchant preset.')).toBeTruthy();
		expect(within(column('encounters')).getByText('Each pair gets its own ranking.')).toBeTruthy();
		expect(
			within(column('talents')).getByText('Every gear setup runs with each pair. Simple and Auto rotations follow each gear set and its talents.'),
		).toBeTruthy();
		expect(screen.queryByTestId('bulk-item-search-stub')).toBeNull();
		expect(screen.queryByTestId('bulk-picker-groups-stub')).toBeNull();
		expect(screen.queryByTestId('bulk-gear-actions')).toBeNull();
		expect(screen.getByTestId('bulk-settings-stub')).toBeTruthy();
	});

	it.each<[string, MountOptions]>([
		['in Gear mode', { mode: 'gear' }],
		['with power tools off', { powerTools: false }],
	])('shows the item search and slot pickers and no columns %s', (_case, options) => {
		mount(options);

		expect(screen.getByTestId('bulk-item-search-stub')).toBeTruthy();
		expect(screen.getByTestId('bulk-picker-groups-stub')).toBeTruthy();
		expect(screen.getByTestId('bulk-gear-actions')).toBeTruthy();
		expect(screen.queryByTestId(/^bulk-builds-column-/)).toBeNull();
	});

	it('lists the current gear locked, then the preset gear sets whose condition passes, then the saved sets', () => {
		mount();

		expect(listRows('bulk-gear-sets', 'bulk-gear-set')).toEqual(['Current gear', 'P1 Fury', 'Pre-BiS', 'My raid set']);
		expect(texts(within(screen.getByTestId('bulk-gear-sets')).getAllByRole('heading', { level: 6 }))).toEqual(['Presets', 'Saved']);
		expect(box('Current gear').getAttribute('aria-checked')).toBe('true');
		expect(box('Current gear').getAttribute('aria-disabled')).toBe('true');
		expect(descriptions('Current gear')).toEqual(['1 item.']);
	});

	it('lists the enchant presets with no current row, and stores a pick without checking the preset for Gear mode', () => {
		const player = mount();

		expect(listRows('bulk-enchant-picks', 'bulk-enchant-pick')).toEqual(['Undead', 'Outdoor']);
		expect(within(screen.getByTestId('bulk-builds-column-gear')).getByRole('heading', { level: 6, name: 'Enchant presets' })).toBeTruthy();

		fireEvent.click(box('Outdoor'));

		expect(box('Outdoor').getAttribute('aria-checked')).toBe('true');
		expect(bulkState(player).buildEnchantPresets).toEqual(['Outdoor']);
		expect(loadStoredBulkBuildEnchantPresets(player)?.names).toEqual(['Outdoor']);
		expect(bulkState(player).enchantPresets.map(preset => preset.checked)).toEqual([false, false]);
	});

	it('shows the current pair ticked and locked first in each pair column', () => {
		mount();

		expect(listRows('bulk-encounter-pairs', 'bulk-encounter-pair')).toEqual(['Current encounter · Current settings', 'Patchwerk · Current settings']);
		expect(listRows('bulk-talent-pairs', 'bulk-talent-pair')).toEqual(['Current talents · Current rotation', 'Arms · Fury APL']);
		for (const name of ['Current encounter · Current settings', 'Current talents · Current rotation']) {
			expect(box(name).getAttribute('aria-checked')).toBe('true');
			expect(box(name).getAttribute('aria-disabled')).toBe('true');
		}
	});

	it('adds a pair from the two selects, checked, at the end of the list, and stores it', async () => {
		const player = mount();
		const encounters = column('encounters');

		expect(addButton(encounters).disabled).toBe(true);
		await pick(encounters, 'Encounter', 'Council');
		expect(addButton(encounters).disabled).toBe(true);
		await pick(encounters, 'Settings', 'Healer');
		await userEvent.click(addButton(encounters));

		expect(listRows('bulk-encounter-pairs', 'bulk-encounter-pair')).toEqual([
			'Current encounter · Current settings',
			'Patchwerk · Current settings',
			'Council · Healer',
		]);
		expect(box('Council · Healer').getAttribute('aria-checked')).toBe('true');
		expect(encounterPairsStored(player)).toEqual([
			['Patchwerk', '', true],
			['Council', 'Healer', true],
		]);
		expect(texts(within(encounters).getAllByRole('combobox'))).toEqual(['Encounter', 'Settings']);
		expect(addButton(encounters).disabled).toBe(true);
	});

	it.each<[string, string, string]>([
		['the current pair', 'Current encounter', 'Current settings'],
		['a stored pair', 'Patchwerk', 'Current settings'],
	])('blocks adding %s: both selects invalid, "Already in the list", Add disabled', async (_case, encounterName, settingsName) => {
		const player = mount();
		const encounters = column('encounters');

		await pick(encounters, 'Encounter', encounterName);
		expect(within(encounters).queryByText('Already in the list')).toBeNull();
		await pick(encounters, 'Settings', settingsName);

		expect(
			within(encounters)
				.getAllByRole('combobox')
				.map(select => select.getAttribute('aria-invalid')),
		).toEqual(['true', 'true']);
		expect(within(encounters).getByText('Already in the list')).toBeTruthy();
		expect(addButton(encounters).disabled).toBe(true);
		expect(bulkState(player).encounterPairs).toHaveLength(1);
	});

	it('removes a pair with its ✕, reachable by keyboard', async () => {
		const player = mount();
		const remove = within(column('talents')).getByRole('button', { name: 'Remove Arms · Fury APL' });

		act(() => box('Arms · Fury APL').focus());
		await userEvent.tab();
		expect(document.activeElement).toBe(remove);
		await userEvent.keyboard('{Enter}');

		expect(listRows('bulk-talent-pairs', 'bulk-talent-pair')).toEqual(['Current talents · Current rotation']);
		expect(bulkState(player).talentPairs).toEqual([]);
		expect(loadStoredBulkTalentPairs(player)?.pairs).toEqual([]);
	});

	it('unchecks a pair and keeps it in the list', () => {
		const player = mount();

		fireEvent.click(box('Patchwerk · Current settings'));

		expect(box('Patchwerk · Current settings').getAttribute('aria-checked')).toBe('false');
		expect(listRows('bulk-encounter-pairs', 'bulk-encounter-pair')).toHaveLength(2);
		expect(encounterPairsStored(player)).toEqual([['Patchwerk', '', false]]);
	});

	it('lists current, presets and saved entries in each select', async () => {
		mount();
		const optionsOf = async (scope: HTMLElement, select: string) => {
			await userEvent.click(within(scope).getByRole('combobox', { name: select }));
			const options = screen.getAllByRole('option');
			const labels = texts(options);
			await userEvent.click(options[0]);
			return labels;
		};

		expect(await optionsOf(column('encounters'), 'Encounter')).toEqual(['Current encounter', 'Patchwerk', 'Council']);
		expect(await optionsOf(column('encounters'), 'Settings')).toEqual(['Current settings', 'Tank healing', 'Healer']);
		expect(await optionsOf(column('talents'), 'Talents')).toEqual(['Current talents', 'Arms', 'Deep Cruelty']);
		expect(await optionsOf(column('talents'), 'Rotation')).toEqual(['Current rotation', 'Fury APL', 'My APL']);
	});

	it.each<[string, MountOptions, string, string, string]>([
		[
			'gear sets',
			{
				saved: { ...SAVED, gear: { 'P1 copy': SavedGearSet.toJson(SavedGearSet.create({ gear: spec(2) })) } },
				gearSets: [BulkGearSetRef.create({ name: 'P1 Fury', preset: true }), BulkGearSetRef.create({ name: 'P1 copy' })],
			},
			'P1 Fury',
			'P1 copy',
			'Same as another gear set, skipped',
		],
		[
			'enchant presets',
			{ enchantPresets: [enchants('Undead', [1898]), enchants('Undead copy', [1898])], buildEnchantPresets: ['Undead', 'Undead copy'] },
			'Undead',
			'Undead copy',
			'Same enchants as another preset, skipped',
		],
	])('marks the checkbox of a checked row equal to an earlier checked one, for %s', (_case, options, earlier, later, reason) => {
		mount(options);

		expect([earlier, later].map(name => box(name).getAttribute('aria-invalid'))).toEqual([null, 'true']);
		expect(descriptions(later)[1]).toBe(reason);
		expect(descriptions(earlier)).toHaveLength(1);
	});

	it('points to where each kind is saved when there is nothing to pick', () => {
		mount({ presets: { gear: [], encounters: [], settings: [], talents: [], rotations: [] }, saved: {}, enchantPresets: [] });

		expect(listRows('bulk-gear-sets', 'bulk-gear-set')).toEqual(['Current gear']);
		expect(within(column('gear')).getByText('No saved gear sets yet. Save one in Gear → Saved Gear Sets to run it too.')).toBeTruthy();
		expect(within(column('gear')).getByText('No enchant presets yet. Make one under Enchants in Batch · Gear.')).toBeTruthy();
	});
});
