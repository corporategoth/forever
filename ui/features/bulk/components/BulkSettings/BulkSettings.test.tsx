import { BulkEnchantSlotOptions } from '@generated/proto/api';
import { APLListItem, APLRotation, APLRotation_Type as APLRotationType } from '@generated/proto/apl';
import { Encounter, type EquipmentSpec, HandType, ItemSlot, ItemType, Target } from '@generated/proto/common';
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
	SavedTalents,
	type UIEnchant,
} from '@generated/proto/ui';
import i18n from '@i18n/config';
import { BulkSimItemSlot } from '@sim/bulk/constants_auto_gen';
import { SimHostProvider } from '@sim/context/SimHostContext';
import type { Player } from '@sim/player/player';
import { PlayerSpecs } from '@sim/player/specs';
import { Gear } from '@sim/proto/gear';
import { getGearIdentityKey } from '@sim/proto/items';
import { Stats } from '@sim/proto/stats';
import { bulkState, patchBulkState, seedBulkSettings } from '@sim/settings/bulk_settings';
import { type BulkMode, createSimStore, patchSlice, PLAYER_FIELDS, seedKeyed, zeroVersions } from '@sim/state/sim_store';
import { memoryEnv } from '@testing/sim/memory_env';
import { makeEquippedItem } from '@testing/storybook/fixtures/gear';
import { makeUIEnchant } from '@testing/storybook/fixtures/protos';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import english from '../../../../../assets/locales/en/translation.json';
import { setBulkEnchantPickChecked } from '../../model/enchant_picks';
import { GearSetups } from '../GearSetups';
import type { BulkSettingsViewProps } from './BulkSettings';

const limits = vi.hoisted(() => ({ iterations: null as number | null }));

// Until the sim is ready the harness's `sim.db` is null, as the real one is; `setReady` lands it.
const init = vi.hoisted(() => ({ ready: true, listeners: new Set<() => void>() }));
vi.mock('@sim/hooks/useSimReady', async () => {
	const { useSyncExternalStore } = await import('react');
	const subscribe = (listener: () => void) => {
		init.listeners.add(listener);
		return () => init.listeners.delete(listener);
	};
	return { useSimReady: () => useSyncExternalStore(subscribe, () => init.ready) };
});
const setReady = () => {
	init.ready = true;
	init.listeners.forEach(listener => listener());
};

vi.mock('@sim/bulk/utils', async () => {
	const actual = await vi.importActual<typeof import('@sim/bulk/utils')>('@sim/bulk/utils');
	return { ...actual, getBulkPlayerCanDualWield: () => true, getBulkFreezeWeaponTypes: () => [] };
});
vi.mock('../../model/run', () => ({ runBulkBatch: vi.fn() }));
// Passing the web limit takes some hundred candidates in one run, so the warning case sets a limit of its own.
vi.mock('../../model/limits', async () => {
	const actual = await vi.importActual<typeof import('../../model/limits')>('../../model/limits');
	return { ...actual, bulkIterationsLimit: (isNative: boolean | undefined) => limits.iterations ?? actual.bulkIterationsLimit(isNative) };
});

const { BulkSettings, BulkSettingsView } = await import('./BulkSettings');

// No i18n mock: the card shows the real copy, and the test setup loads no locale, so this suite loads the English one.
beforeAll(() => {
	i18n.addResourceBundle('en', 'translation', english, true, true);
});
afterAll(() => {
	i18n.removeResourceBundle('en', 'translation');
});

const STORE_KEY = 5;
const KEYS = {
	gear: 'test-saved-gear',
	encounters: 'test-saved-encounters',
	settings: 'test-saved-settings',
	talents: 'test-saved-talents',
	rotations: 'test-saved-rotations',
};
const LIVE = '30305001302';
const ARMS = '3030500130';

const CLOAK_AGILITY = makeUIEnchant({ effectId: 849, name: 'Cloak agility', type: ItemType.ItemTypeBack });
const CLOAK_ARMOR = makeUIEnchant({ effectId: 884, name: 'Cloak armor', type: ItemType.ItemTypeBack });
const BACK_ENCHANTS = (slot: ItemSlot) => (slot === ItemSlot.ItemSlotBack ? [CLOAK_AGILITY, CLOAK_ARMOR] : []);

const cloak = (enchant?: UIEnchant) => makeEquippedItem({ item: { id: 101, type: ItemType.ItemTypeBack, unique: false }, enchant });
const chest = (id: number) => makeEquippedItem({ item: { id, type: ItemType.ItemTypeChest, unique: false } });
const RING = makeEquippedItem({ item: { id: 102, type: ItemType.ItemTypeFinger, unique: false } });
const TWO_HANDER = makeEquippedItem({ item: { id: 104, handType: HandType.HandTypeTwoHand, unique: false } });

// The current gear already wears the Agility cloak enchant; the sets wear none.
const CURRENT_GEAR = new Gear({ [ItemSlot.ItemSlotBack]: cloak(CLOAK_AGILITY), [ItemSlot.ItemSlotFinger1]: RING });
const RAID_GEAR = new Gear({ [ItemSlot.ItemSlotBack]: cloak(), [ItemSlot.ItemSlotChest]: chest(103) });
const DUNGEON_GEAR = new Gear({ [ItemSlot.ItemSlotBack]: cloak(), [ItemSlot.ItemSlotChest]: chest(105) });
const TWO_HAND_GEAR = new Gear({ [ItemSlot.ItemSlotBack]: cloak(), [ItemSlot.ItemSlotMainHand]: TWO_HANDER });
const KNOWN_GEAR = [CURRENT_GEAR, RAID_GEAR, DUNGEON_GEAR, TWO_HAND_GEAR];

const enchantPreset = (name: string, effectIds: number[]) =>
	BulkEnchantPreset.create({ name, slots: [BulkEnchantSlotOptions.create({ slot: ItemSlot.ItemSlotBack, effectIds })] });

const LIVE_ROTATION = APLRotation.create({ type: APLRotationType.TypeAPL, priorityList: [APLListItem.create({ notes: 'live' })] });

// As the player's resolver: an APL goes as it is, and a Simple pick generates its list by whether the gear holds a weapon.
const resolve = ({ gear, rotation }: { gear: Gear; rotation: APLRotation }) =>
	rotation.type === APLRotationType.TypeSimple
		? APLRotation.create({ priorityList: [APLListItem.create({ notes: gear.getEquippedItem(ItemSlot.ItemSlotMainHand) ? 'two-hand' : 'no weapon' })] })
		: rotation;

const PRESETS = {
	gear: [
		{ name: 'Raid', gear: RAID_GEAR.asSpec() },
		{ name: 'Two-hand', gear: TWO_HAND_GEAR.asSpec() },
	],
	encounters: [],
	talents: [{ name: 'Arms', data: SavedTalents.create({ talentsString: ARMS }) }],
	rotations: [{ name: 'Simple', rotation: SavedRotation.create({ rotation: APLRotation.create({ type: APLRotationType.TypeSimple }) }) }],
};

const SAVED: Record<keyof typeof KEYS, Record<string, unknown>> = {
	gear: {
		'Raid copy': SavedGearSet.toJson(SavedGearSet.create({ gear: RAID_GEAR.asSpec() })),
		Dungeon: SavedGearSet.toJson(SavedGearSet.create({ gear: DUNGEON_GEAR.asSpec() })),
	},
	encounters: { Council: SavedEncounter.toJson(SavedEncounter.create({ encounter: Encounter.create({ duration: 90, targets: [Target.create()] }) })) },
	settings: {},
	talents: {},
	rotations: {},
};

const COUNCIL_PAIR = BulkEncounterPair.create({ encounter: BulkEncounterRef.create({ name: 'Council' }), settings: BulkSettingsRef.create(), checked: true });
const ARMS_SIMPLE_PAIR = BulkTalentPair.create({
	talents: BulkTalentRef.create({ name: 'Arms', preset: true }),
	rotation: BulkRotationRef.create({ name: 'Simple', preset: true }),
	checked: true,
});

const gearSet = (name: string, preset = false) => BulkGearSetRef.create({ name, preset });

interface MountOptions {
	reforger?: unknown;
	powerTools?: boolean;
	mode?: BulkMode;
	iterations?: number;
	gearSets?: BulkGearSetRef[];
	buildEnchantPresets?: string[];
	encounterPairs?: BulkEncounterPair[];
	talentPairs?: BulkTalentPair[];
	gearSetups?: boolean;
}

const db = {
	getEnchants: BACK_ENCHANTS,
	lookupEquipmentSpec: (spec: EquipmentSpec) => KNOWN_GEAR.find(known => getGearIdentityKey(known.asSpec()) === getGearIdentityKey(spec)) ?? new Gear({}),
};

const mount = ({
	reforger = null,
	powerTools = true,
	mode = 'gear',
	iterations = 0,
	gearSets = [],
	buildEnchantPresets = [],
	encounterPairs = [],
	talentPairs = [],
	gearSetups = false,
}: MountOptions = {}) => {
	for (const [kind, key] of Object.entries(KEYS)) localStorage.setItem(key, JSON.stringify(SAVED[kind as keyof typeof KEYS]));
	const store = createSimStore();
	patchSlice(store, 'encounter', { duration: 180, durationVariation: 5, targets: [Target.create()] });
	patchSlice(store, 'ui', { showPowerTools: powerTools });
	seedKeyed(store, 'players', STORE_KEY, {
		gear: CURRENT_GEAR,
		bonusStats: new Stats(),
		talentsString: LIVE,
		profession1: 0,
		profession2: 0,
		v: zeroVersions(PLAYER_FIELDS),
	} as never);
	const player = {
		sim: {
			store,
			isNative: false,
			env: memoryEnv(),
			get db() {
				return init.ready ? db : null;
			},
		},
		storeKey: STORE_KEY,
		getGear: () => CURRENT_GEAR,
		getPlayerSpec: () => PlayerSpecs.DpsWarrior,
		aplRotation: LIVE_ROTATION,
		getResolvedAplRotationForBuild: resolve,
	} as unknown as Player<any>;
	seedBulkSettings(player);
	patchBulkState(player, {
		mode,
		iterations,
		gearSets,
		enchantPresets: [enchantPreset('Agility', [CLOAK_AGILITY.effectId]), enchantPreset('Cloaks', [CLOAK_AGILITY.effectId, CLOAK_ARMOR.effectId])],
		buildEnchantPresets,
		encounterPairs,
		talentPairs,
	});
	const host = {
		player,
		sim: player.sim,
		reforger,
		reforgeOptions: null,
		individualConfig: { presets: PRESETS },
		getStorageKey: (key: string) => `test-${key}`,
		getSavedGearStorageKey: () => KEYS.gear,
		getSavedEncounterStorageKey: () => KEYS.encounters,
		getSavedSettingsStorageKey: () => KEYS.settings,
		getSavedTalentsStorageKey: () => KEYS.talents,
		getSavedRotationStorageKey: () => KEYS.rotations,
	} as never;
	const { container } = render(
		<SimHostProvider host={host}>
			<BulkSettings />
			{gearSetups && <GearSetups />}
		</SimHostProvider>,
	);
	const pick = async (id: string, index: number) => {
		const trigger = container.querySelector<HTMLElement>(`#${id}`)!;
		await userEvent.click(trigger);
		const option = screen.getAllByRole('option')[index];
		const label = option.textContent;
		await userEvent.click(option);
		return [trigger, label] as const;
	};
	const openGroup = (group: string) => fireEvent.click(container.querySelector(`[data-testid="bulk-settings-group-${group}-trigger"]`)!);
	const groups = () =>
		[...container.querySelectorAll('[data-testid^="bulk-settings-group-"][data-testid$="-trigger"]')].map(trigger => trigger.getAttribute('data-testid'));
	return { player, container, pick, openGroup, groups };
};

const text = (testId: string) => screen.getByTestId(testId).textContent;
const simulate = () => screen.getByTestId('bulk-settings-btn') as HTMLButtonElement;

beforeEach(() => {
	localStorage.clear();
	limits.iterations = null;
	init.ready = true;
});

describe('BulkSettings', () => {
	// Both selects list None, then the pair's first slot (Finger 1, Main Hand), then its second.
	it.each<[string, (player: Player<any>) => unknown, unknown]>([
		['freeze-ring', player => bulkState(player).frozenItems.get(BulkSimItemSlot.ItemSlotFinger), RING],
		['freeze-weapon', player => bulkState(player).frozenWeaponSlot, ItemSlot.ItemSlotMainHand],
	])('keeps the picked slot in the %s select', async (id, stored, expected) => {
		const { player, pick, openGroup } = mount();
		openGroup('freezes');

		const [select, picked] = await pick(id, 1);

		expect(stored(player)).toBe(expected);
		expect(select.textContent).toBe(picked);
	});

	it('opens no group before anything is stored', () => {
		const { container } = mount();

		expect(container.querySelector('#freeze-ring')).toBeNull();
	});

	it('remembers an opened group in local storage', () => {
		const { openGroup } = mount();

		openGroup('freezes');

		expect(JSON.parse(localStorage.getItem('test-__bulkSettingsGroups')!)).toEqual(['freezes']);
	});

	it('shows the enchant and frozen slot groups and no encounter or talent group in Gear mode, even for a spec with the gear optimizer', () => {
		const { groups } = mount({ reforger: { settings: {} }, encounterPairs: [COUNCIL_PAIR], talentPairs: [ARMS_SIMPLE_PAIR] });

		expect(groups()).toEqual(['bulk-settings-group-enchants-trigger', 'bulk-settings-group-freezes-trigger']);
	});

	it('shows only the run card in Builds mode', () => {
		const { groups } = mount({ mode: 'builds' });

		expect(screen.getByTestId('bulk-run-card')).toBeTruthy();
		expect(screen.queryByTestId('bulk-settings-group-enchants')).toBeNull();
		expect(groups()).toEqual([]);
	});

	it('shows combinations and iterations only with power tools off, and keeps the stored pairs as they are', () => {
		const { player, groups } = mount({
			powerTools: false,
			mode: 'builds',
			iterations: 100,
			buildEnchantPresets: ['Cloaks'],
			encounterPairs: [COUNCIL_PAIR],
			talentPairs: [ARMS_SIMPLE_PAIR],
		});

		expect(text('bulk-combinations')).toBe('0');
		expect(text('bulk-total-iterations')).toBe('100');
		expect(screen.queryByTestId('bulk-gear-setups')).toBeNull();
		expect(screen.queryByTestId('bulk-runs-count')).toBeNull();
		expect(groups()).toEqual(['bulk-settings-group-enchants-trigger', 'bulk-settings-group-freezes-trigger']);

		act(() => patchSlice(player.sim.store, 'ui', { showPowerTools: true }));

		expect(text('bulk-gear-setups')).toBe('2');
		expect(groups()).toEqual([]);
		expect(bulkState(player).encounterPairs).toEqual([COUNCIL_PAIR]);
		expect(bulkState(player).talentPairs).toEqual([ARMS_SIMPLE_PAIR]);
	});

	it('counts the gear setups as gear sets × enchant presets after duplicates drop', () => {
		// The current gear, Raid and Dungeon, each with either cloak enchant; Raid copy holds the Raid set and drops.
		mount({ mode: 'builds', gearSets: [gearSet('Raid', true), gearSet('Raid copy'), gearSet('Dungeon')], buildEnchantPresets: ['Cloaks'] });

		expect(text('bulk-gear-setups')).toBe('6');
	});

	it('counts the planned runs after splits and collapses', () => {
		// The current talent pair runs both setups in one request; Arms with a Simple rotation resolves otherwise for the
		// two-hand set, so its setups split into two requests: 2 encounter pairs × (1 + 2).
		mount({
			mode: 'builds',
			gearSets: [gearSet('Two-hand', true)],
			buildEnchantPresets: ['Agility'],
			encounterPairs: [COUNCIL_PAIR],
			talentPairs: [ARMS_SIMPLE_PAIR],
		});

		expect(text('bulk-gear-setups')).toBe('2');
		expect(text('bulk-runs-label')).toBe('2 encounter setups × 2 talent setups');
		expect(text('bulk-runs-count')).toBe('= 6 runs');
	});

	it('shows the minimum iterations of every run', () => {
		// The current gear with the Agility enchant is the baseline; the other three setups are one request's candidates.
		mount({ mode: 'builds', gearSets: [gearSet('Raid', true)], buildEnchantPresets: ['Cloaks'] });

		expect(text('bulk-total-iterations')).toBe('40,000');
	});

	it('disables Simulate with a hint while no enchant preset is ticked', () => {
		const { player } = mount({ mode: 'builds' });

		expect(text('bulk-gear-setups')).toBe('0');
		expect(text('bulk-no-gear-setups')).toBe('Tick an enchant preset to make gear setups.');
		expect(screen.queryByTestId('bulk-runs-count')).toBeNull();
		expect(simulate().disabled).toBe(true);

		act(() => setBulkEnchantPickChecked(player, 'Cloaks', true, ['Agility', 'Cloaks']));

		expect(text('bulk-gear-setups')).toBe('2');
		expect(screen.queryByTestId('bulk-no-gear-setups')).toBeNull();
		expect(simulate().disabled).toBe(false);
	});

	it('keeps Simulate off in Gear mode until the sim is ready', () => {
		init.ready = false;
		const { player } = mount();
		act(() => patchBulkState(player, { combinations: 2 }));

		expect(text('bulk-combinations')).toBe('2');
		expect(simulate().disabled).toBe(true);

		act(setReady);

		expect(simulate().disabled).toBe(false);
	});

	it('lists no gear set and shows spinners for the counts, not the no-setups hint, in Builds mode until the sim is ready', () => {
		init.ready = false;
		mount({ mode: 'builds', gearSetups: true, gearSets: [gearSet('Raid', true)], buildEnchantPresets: ['Cloaks'] });

		expect(screen.queryAllByTestId('bulk-gear-set')).toHaveLength(0);
		expect(screen.getByTestId('bulk-gear-setups').querySelector('[data-testid="loader"]')).not.toBeNull();
		expect(screen.getByTestId('bulk-total-iterations').querySelector('[data-testid="loader"]')).not.toBeNull();
		expect(screen.queryByTestId('bulk-no-gear-setups')).toBeNull();
		expect(simulate().disabled).toBe(true);

		act(setReady);

		// Raid, Two-hand, Raid copy and Dungeon; none wears the current gear.
		expect(screen.queryAllByTestId('bulk-gear-set')).toHaveLength(4);
		expect(text('bulk-gear-setups')).toBe('4');
		expect(simulate().disabled).toBe(false);
	});

	it('judges the warning on the largest request’s iterations in Builds mode', () => {
		// Each encounter pair runs one request with one candidate: 20,000 iterations each, 40,000 in all.
		const options = { mode: 'builds' as const, buildEnchantPresets: ['Cloaks'], encounterPairs: [COUNCIL_PAIR] };
		limits.iterations = 30_000;
		mount(options);

		expect(text('bulk-total-iterations')).toBe('40,000');
		expect(screen.queryByTestId('warning')).toBeNull();
		cleanup();

		limits.iterations = 19_999;
		mount(options);

		expect(screen.getByTestId('warning')).toBeTruthy();
	});
});

const RING_VIEW = {
	id: 'freeze-ring',
	label: 'Freeze ring',
	options: [
		{ value: -1, label: 'None' },
		{ value: ItemSlot.ItemSlotFinger1, label: 'Finger 1' },
	],
	value: -1,
	onChange: () => {},
};

const renderSettings = (props: Partial<BulkSettingsViewProps> = {}) => {
	const handlers = { onRun: vi.fn(), onOpenGroupsChange: vi.fn(), onFrozenWeaponSlotChange: vi.fn() };
	const { container } = render(
		<BulkSettingsView
			combinationsCount={<span data-testid="count" />}
			canRun
			openGroups={['freezes']}
			groups
			enchants={null}
			frozenItems={[RING_VIEW]}
			weaponFreeze={null}
			{...handlers}
			{...props}
		/>,
	);
	return { container, ...handlers };
};

describe('BulkSettingsView', () => {
	it('runs the batch from its button, which is disabled while it cannot run', () => {
		const { onRun } = renderSettings();

		fireEvent.click(screen.getByTestId('bulk-settings-btn'));
		expect(onRun).toHaveBeenCalledOnce();
		expect(screen.getByTestId('count')).toBeTruthy();
	});

	it('disables the run button while the batch cannot run', () => {
		renderSettings({ canRun: false });

		expect((screen.getByTestId('bulk-settings-btn') as HTMLButtonElement).disabled).toBe(true);
	});

	it('renders one freeze select per paired slot', () => {
		const { container } = renderSettings();

		expect(container.querySelector('#freeze-ring')).not.toBeNull();
		expect(container.querySelector('#freeze-weapon')).toBeNull();
	});

	it('offers the weapon freeze and its weapon type filters to a dual wielder', async () => {
		const { container, onFrozenWeaponSlotChange } = renderSettings({
			weaponFreeze: { value: -1, weaponTypes: <span data-testid="weapon-types" /> },
		});

		await userEvent.click(container.querySelector<HTMLElement>('#freeze-weapon')!);
		await userEvent.click(screen.getAllByRole('option')[1]);

		expect(onFrozenWeaponSlotChange).toHaveBeenCalledWith(ItemSlot.ItemSlotMainHand);
		expect(screen.getByTestId('weapon-types')).toBeTruthy();
	});
});
