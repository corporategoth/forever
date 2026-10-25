import { BULK_TAB_ID } from '@features/hooks/useActivateTab';
import { Encounter, ItemSlot, Target } from '@generated/proto/common';
import { BulkEncounterRef } from '@generated/proto/ui';
import { SimHostProvider } from '@sim/context/SimHostContext';
import type { Player } from '@sim/player/player';
import { PlayerSpecs } from '@sim/player/specs';
import { bulkState, loadStoredBulkMode, patchBulkState, seedBulkSettings } from '@sim/settings/bulk_settings';
import { createSimStore, patchSlice, PLAYER_FIELDS, seedKeyed, zeroVersions } from '@sim/state/sim_store';
import { memoryEnv } from '@testing/sim/memory_env';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
		sim: { store, isNative: false, env: memoryEnv() },
		storeKey: STORE_KEY,
		getGear: () => gear,
		getPlayerSpec: () => PlayerSpecs.DpsWarrior,
	} as unknown as Player<any>;
	seedBulkSettings(player);
	const patchwerk = Encounter.create({ duration: 300, durationVariation: 30, targets: [Target.create()] });
	patchBulkState(player, { encounters: [BulkEncounterRef.create({ name: 'Patchwerk', preset: true })] });
	const host = {
		player,
		sim: player.sim,
		simDisabled: false,
		reforger: null,
		reforgeOptions: null,
		individualConfig: { presets: { encounters: [{ name: 'Patchwerk', encounter: patchwerk }], talents: [] } },
		getStorageKey: (key: string) => `test-${key}`,
		getSavedEncounterStorageKey: () => 'test-saved-encounters',
		getSavedTalentsStorageKey: () => 'test-saved-talents',
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
const modeItems = () => screen.queryAllByRole('menuitem').map(item => item.getAttribute('data-testid'));
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

	it('shows the mode on the tab and lists both modes under it with power tools on', async () => {
		mount({ powerTools: true });

		expect(batchTab().textContent).toBe('bulk_tab.modes.gear.tab');
		expect(batchTab().getAttribute('role')).toBe('tab');

		await click(batchTab());

		expect(modeItems()).toEqual(['bulk-mode-gear', 'bulk-mode-builds']);
		expect(batchTab().getAttribute('aria-selected')).toBe('true');
	});

	it('switches to Builds from the menu, opening the batch tab with the encounter and talent groups', async () => {
		const player = mount({ powerTools: true });
		await click(batchTab());

		await click(screen.getByTestId('bulk-mode-builds'));

		expect(bulkState(player).mode).toBe('builds');
		expect(loadStoredBulkMode(player)).toBe('builds');
		expect(batchTab().textContent).toBe('bulk_tab.modes.builds.tab');
		expect(batchTab().getAttribute('aria-selected')).toBe('true');
		expect(groups()).toEqual([
			'bulk-settings-group-encounters-trigger',
			'bulk-settings-group-talents-trigger',
			'bulk-settings-group-enchants-trigger',
			'bulk-settings-group-freezes-trigger',
		]);
	});

	it('keeps the stored mode with power tools off, and runs Gear until they are back on', () => {
		const player = mount({ powerTools: false });
		act(() => patchBulkState(player, { mode: 'builds' }));

		expect(batchTab().textContent).toBe('bulk_tab.title');
		expect(groups()).toEqual(['bulk-settings-group-enchants-trigger', 'bulk-settings-group-freezes-trigger']);

		act(() => patchSlice(player.sim.store, 'ui', { showPowerTools: true }));

		expect(batchTab().textContent).toBe('bulk_tab.modes.builds.tab');
		expect(groups()).toHaveLength(4);
	});
});
