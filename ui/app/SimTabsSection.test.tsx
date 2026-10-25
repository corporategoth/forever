import { BULK_TAB_ID } from '@features/hooks/useActivateTab';
import { APLRotation } from '@generated/proto/apl';
import type { ItemSlot } from '@generated/proto/common';
import { SimHostProvider } from '@sim/context/SimHostContext';
import type { Player } from '@sim/player/player';
import { PlayerSpecs } from '@sim/player/specs';
import { bulkState, loadStoredBulkMode, patchBulkState, seedBulkSettings } from '@sim/settings/bulk_settings';
import { createSimStore, patchSlice, PLAYER_FIELDS, seedKeyed, zeroVersions } from '@sim/state/sim_store';
import { memoryEnv } from '@testing/sim/memory_env';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SimHostObject } from './individual_sim_ui';
import { SimTabsPanels, SimTabsStrip } from './SimTabs';
import { SimTabsSection } from './SimTabsSection';

vi.mock('../tracking/utils', () => ({ trackPageView: () => {} }));
vi.mock('@sim/bulk/utils', async () => {
	const actual = await vi.importActual<typeof import('@sim/bulk/utils')>('@sim/bulk/utils');
	return { ...actual, getBulkPlayerCanDualWield: () => false };
});
vi.mock('@features/bulk/model/run', () => ({ runBulkBatch: vi.fn() }));
vi.mock('@features/results/components/DetailedResults', () => ({ DetailedResults: () => null }));
vi.mock('./tabs/GearTabBody', () => ({ GearTabBody: () => null }));
vi.mock('./tabs/SettingsTabBody', () => ({ SettingsTabBody: () => null }));
vi.mock('./tabs/TalentsTabBody', () => ({ TalentsTabBody: () => null }));
vi.mock('./tabs/RotationTabPane', () => ({ RotationTabPane: () => null }));
// The batch pane is its settings sidebar alone, where the mode shows.
vi.mock('./tabs/BulkTabBody', async () => {
	const { BulkSettings } = await import('@features/bulk/components/BulkSettings');
	return { BulkTabBody: () => <BulkSettings /> };
});

const STORE_KEY = 3;

const mount = ({ powerTools }: { powerTools: boolean }) => {
	const store = createSimStore();
	patchSlice(store, 'ui', { showPowerTools: powerTools });
	const gear = { getEquippedItem: (_slot: ItemSlot) => null };
	seedKeyed(store, 'players', STORE_KEY, { gear, talentsString: '', v: zeroVersions(PLAYER_FIELDS) } as never);
	const player = {
		sim: { store, isNative: false, env: memoryEnv(), waitForInit: () => Promise.resolve() },
		storeKey: STORE_KEY,
		getGear: () => gear,
		getPlayerSpec: () => PlayerSpecs.DpsWarrior,
		aplRotation: APLRotation.create(),
	} as unknown as Player<any>;
	seedBulkSettings(player);
	const host = {
		player,
		sim: player.sim,
		simDisabled: false,
		reforger: null,
		reforgeOptions: null,
		individualConfig: { presets: { gear: [], encounters: [], talents: [], rotations: [] } },
		getStorageKey: (key: string) => `test-${key}`,
		getSavedGearStorageKey: () => 'test-saved-gear',
		getSavedEncounterStorageKey: () => 'test-saved-encounters',
		getSavedSettingsStorageKey: () => 'test-saved-settings',
		getSavedTalentsStorageKey: () => 'test-saved-talents',
		getSavedRotationStorageKey: () => 'test-saved-rotations',
	} as unknown as SimHostObject<any>;
	render(
		<SimHostProvider host={host}>
			<SimTabsSection host={host}>
				<header>
					<SimTabsStrip />
				</header>
				<main>
					<SimTabsPanels />
				</main>
			</SimTabsSection>
		</SimHostProvider>,
	);
	return player;
};

const batchTab = () => within(document.querySelector('header')!).getByTestId(BULK_TAB_ID);
const click = (element: HTMLElement) => act(() => void fireEvent.click(element));
const modeItems = () => screen.queryAllByRole('menuitemradio').map(item => item.getAttribute('data-testid'));
const checkedMode = () =>
	screen
		.getAllByRole('menuitemradio')
		.find(item => item.getAttribute('aria-checked') === 'true')
		?.getAttribute('data-testid');
const groups = () =>
	[...document.querySelectorAll('[data-testid^="bulk-settings-group-"][data-testid$="-trigger"]')].map(trigger => trigger.getAttribute('data-testid'));

beforeEach(() => {
	localStorage.clear();
});

describe('SimTabsSection batch tab', () => {
	it('is a plain Batch tab with no mode menu without power tools', async () => {
		mount({ powerTools: false });

		expect(batchTab().textContent).toBe('bulk_tab.title');
		expect(batchTab().hasAttribute('aria-haspopup')).toBe(false);

		await click(batchTab());

		expect(modeItems()).toEqual([]);
		expect(batchTab().getAttribute('aria-selected')).toBe('true');
		expect(groups()).toEqual(['bulk-settings-group-enchants-trigger', 'bulk-settings-group-freezes-trigger']);
	});

	it('moves along the tab strip with ArrowLeft and ArrowRight onto and off the batch tab and its mode menu', async () => {
		mount({ powerTools: true });
		const gear = within(document.querySelector('header')!).getByTestId('gear-tab');

		// The strip loops: left of the first tab is the batch tab, the last one.
		fireEvent.keyDown(gear, { key: 'ArrowLeft' });
		await waitFor(() => expect(document.activeElement).toBe(batchTab()));
		expect(batchTab().getAttribute('aria-selected')).toBe('true');

		fireEvent.keyDown(batchTab(), { key: 'ArrowRight' });
		await waitFor(() => expect(document.activeElement).toBe(gear));
		expect(gear.getAttribute('aria-selected')).toBe('true');
	});

	it('shows the mode on the tab and lists both modes under it, the current one checked, with power tools on', async () => {
		mount({ powerTools: true });

		expect(batchTab().textContent).toBe('bulk_tab.modes.gear.tab');
		expect(batchTab().getAttribute('role')).toBe('tab');

		await click(batchTab());

		expect(modeItems()).toEqual(['bulk-mode-gear', 'bulk-mode-builds']);
		expect(checkedMode()).toBe('bulk-mode-gear');
		expect(batchTab().getAttribute('aria-selected')).toBe('true');
	});

	it('switches to Builds from the menu, opening the batch tab with the run card alone', async () => {
		const player = mount({ powerTools: true });
		await click(batchTab());

		await click(screen.getByTestId('bulk-mode-builds'));

		expect(bulkState(player).mode).toBe('builds');
		expect(loadStoredBulkMode(player)).toBe('builds');
		expect(batchTab().textContent).toBe('bulk_tab.modes.builds.tab');
		expect(batchTab().getAttribute('aria-selected')).toBe('true');
		expect(groups()).toEqual([]);
		expect(screen.getByTestId('bulk-run-card')).toBeTruthy();
	});

	it('keeps the stored mode with power tools off, and runs Gear until they are back on', () => {
		const player = mount({ powerTools: false });
		act(() => patchBulkState(player, { mode: 'builds' }));

		expect(batchTab().textContent).toBe('bulk_tab.title');
		expect(groups()).toEqual(['bulk-settings-group-enchants-trigger', 'bulk-settings-group-freezes-trigger']);

		act(() => patchSlice(player.sim.store, 'ui', { showPowerTools: true }));

		expect(batchTab().textContent).toBe('bulk_tab.modes.builds.tab');
		expect(groups()).toEqual([]);
	});
});
