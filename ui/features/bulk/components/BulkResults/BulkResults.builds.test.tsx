// The Results pane over a real Sim and Player, with the real rows, for one finished Builds encounter pair. No i18n mock:
// with no locale loaded every string is its key.
//
// The pair ranks Raid · Undead (helm 2, +20 strength) at 1,100, with Arms and Opener (or the rotation a case passes) when
// it ran more than one talent pair, then the current gear with Undead (helm 3) with the current talent pair at 1,050,
// then the current gear as equipped at 1,000.
import { DistributionMetrics } from '@generated/proto/api';
import { APLRotation, APLRotation_Type as APLRotationType } from '@generated/proto/apl';
import { Race, Stat } from '@generated/proto/common';
import { SavedSettings } from '@generated/proto/ui';
import type { BulkEncounterResults, BulkGearSetup, BulkPlayerSettingsSetup, BulkRankedResult, BulkRotationSetup } from '@sim/bulk/types';
import { Stats } from '@sim/proto/stats';
import { patchBulkState, seedBulkSettings } from '@sim/settings/bulk_settings';
import { subscribeGated } from '@sim/state/batch';
import { renderWithHost } from '@testing/react';
import { makeIndividualSim, serveDatabase } from '@testing/sim/individual_sim';
import { compareGearSet, CURRENT_ROTATION_SETUP, CURRENT_TALENT_SETUP } from '@testing/storybook/fixtures/bulk-compare';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { toastManager } from '@ui-kit/Toast';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { BulkResults } from './BulkResults';

vi.mock('@sim/workers/worker_pool', async () => (await import('@testing/sim/worker_pool')).idleWorkerPool());
vi.mock('@sim/hooks/useActionId', () => ({
	useActionId: () => ({ iconUrl: '', name: '', href: '', ready: true }),
}));

beforeAll(() => serveDatabase());

const STRENGTH = new Stats().withStat(Stat.StatStrength, 20);
const RAID: BulkGearSetup = { gearSet: 'Raid', enchantPreset: 'Undead', gear: compareGearSet(2), bonusStats: STRENGTH };
const CURRENT_UNDEAD: BulkGearSetup = { gearSet: '', enchantPreset: 'Undead', gear: compareGearSet(3), bonusStats: new Stats() };
const ARMS = { name: 'Arms', talentsString: '3030500130', isCurrent: false };
const OPENER = {
	name: 'Opener',
	isCurrent: false,
	rotation: APLRotation.create({ type: APLRotationType.TypeSimple, simple: { specRotationJson: '{"useOpener":true}' } }),
};

const HEALER: BulkPlayerSettingsSetup = { name: 'Healer', isCurrent: false, settings: SavedSettings.create({ race: Race.RaceDwarf }) };
const CURRENT_SETTINGS: BulkPlayerSettingsSetup = { name: '', isCurrent: true, settings: null };

const ranked = (avg: number, fields: Omit<BulkRankedResult, 'dpsMetrics'>): BulkRankedResult => ({
	...fields,
	dpsMetrics: DistributionMetrics.create({ avg, stdev: 10 }),
});

const entry = (talentPairs: number, settings: BulkPlayerSettingsSetup, buildRotation: BulkRotationSetup = OPENER): BulkEncounterResults => {
	const base = ranked(1000, { gear: compareGearSet(1), talents: CURRENT_TALENT_SETUP, rotation: CURRENT_ROTATION_SETUP, gearSetup: null });
	const build = ranked(
		1100,
		talentPairs > 1
			? { gear: RAID.gear, talents: ARMS, rotation: buildRotation, gearSetup: RAID }
			: { gear: RAID.gear, talents: CURRENT_TALENT_SETUP, rotation: CURRENT_ROTATION_SETUP, gearSetup: RAID },
	);
	const currentGear = ranked(1050, { gear: CURRENT_UNDEAD.gear, talents: CURRENT_TALENT_SETUP, rotation: CURRENT_ROTATION_SETUP, gearSetup: CURRENT_UNDEAD });
	return {
		name: '',
		isCurrent: true,
		duration: 180,
		durationVariation: 5,
		settings,
		results: { chains: [[build], [currentGear], [base]], originalGearResults: base, iterations: 100, talentPairs },
	};
};

const mount = async (talentPairs: number, settings = HEALER, buildRotation?: BulkRotationSetup) => {
	const { sim, player } = await makeIndividualSim();
	seedBulkSettings(player);
	patchBulkState(player, { started: true, results: [entry(talentPairs, settings, buildRotation)] });
	const onActivateTab = vi.fn();
	renderWithHost(<BulkResults onActivateTab={onActivateTab} selected={0} />, { sim, player });
	return { sim, player, onActivateTab };
};

const rows = () => screen.getAllByTestId('bulk-sim-result-root');
const buildLine = (row: HTMLElement) => within(row).queryByTestId('bulk-result-talents');
// The build line in order: the gear setup label as a text node, then each pill by its test id.
const lineParts = (row: HTMLElement) =>
	Array.from(buildLine(row)?.childNodes ?? []).flatMap(part => {
		if (part.nodeType === Node.TEXT_NODE) return [['text', part.textContent]];
		const testId = part instanceof Element ? part.getAttribute('data-testid') : null;
		return testId ? [[testId, part.textContent]] : [];
	});

describe('BulkResults in Builds', () => {
	it('names each row’s gear setup, the reference row reading "Current gear" with no setup label', async () => {
		await mount(1);

		const [build, currentGear, reference] = rows();
		expect(lineParts(build)).toEqual([['text', 'Raid · Undead']]);
		expect(lineParts(currentGear)).toEqual([['text', 'bulk_tab.results.current_gear · Undead']]);
		expect(within(reference).getByTestId('results-sim-dps').firstElementChild!.textContent).toBe('bulk_tab.results.current_gear');
		expect(buildLine(reference)).toBeNull();
	});

	it('shows the talent pill alone when the talent pairs all ran the same rotation', async () => {
		await mount(2, HEALER, CURRENT_ROTATION_SETUP);

		expect(lineParts(rows()[0])).toEqual([
			['text', 'Raid · Undead'],
			['bulk-result-talents-anchor', 'bulk_tab.results.talent_preset'],
		]);
		expect(screen.queryAllByTestId('bulk-result-rotation')).toEqual([]);
	});

	it('shows the talent and rotation pills when the encounter pair ran more than one talent pair', async () => {
		await mount(2);

		const [build, currentGear, reference] = rows();
		expect(lineParts(build)).toEqual([
			['text', 'Raid · Undead'],
			['bulk-result-talents-anchor', 'bulk_tab.results.talent_preset'],
			['bulk-result-rotation', 'bulk_tab.results.rotation'],
		]);
		expect(lineParts(currentGear)).toEqual([
			['text', 'bulk_tab.results.current_gear · Undead'],
			['bulk-result-talents-anchor', 'bulk_tab.results.current_talents'],
			['bulk-result-rotation', 'bulk_tab.results.current_rotation'],
		]);
		expect(lineParts(reference)).toEqual([
			['bulk-result-talents-anchor', 'bulk_tab.results.current_talents'],
			['bulk-result-rotation', 'bulk_tab.results.current_rotation'],
		]);
		const rotation = within(build).getByTestId('bulk-result-rotation');
		expect(rotation.hasAttribute('tabindex')).toBe(false);
		expect(rotation.hasAttribute('data-tooltip-id')).toBe(false);
	});

	it('shows neither pill when it ran one', async () => {
		await mount(1);

		expect(screen.queryAllByTestId('bulk-result-talents-anchor')).toEqual([]);
		expect(screen.queryAllByTestId('bulk-result-rotation')).toEqual([]);
		expect(screen.getByText('Raid · Undead')).toBeTruthy();
		expect(screen.getByText('bulk_tab.results.current_gear · Undead')).toBeTruthy();
	});

	it('equips the row’s gear setup, talents, rotation and the pair’s settings with one build toast', async () => {
		const { sim, player, onActivateTab } = await mount(2);
		player.setRace(Race.RaceOrc);
		const toast = vi.spyOn(toastManager, 'add').mockReturnValue('toast');
		let notified = 0;
		const unsubscribe = subscribeGated(
			sim.store.subscribe,
			state => state.players[player.storeKey],
			() => notified++,
		);

		act(() => {
			fireEvent.click(within(rows()[0]).getByTestId('bulk-equip-btn'));
		});
		unsubscribe();

		expect(player.getGear().equals(RAID.gear)).toBe(true);
		expect(player.getTalentsString()).toBe(ARMS.talentsString);
		expect(APLRotation.equals(player.aplRotation, OPENER.rotation)).toBe(true);
		expect(player.getBonusStats().equals(STRENGTH)).toBe(true);
		expect(player.getRace()).toBe(Race.RaceDwarf);
		expect(notified).toBe(1);
		expect(toast).toHaveBeenCalledOnce();
		expect(toast).toHaveBeenCalledWith({ variant: 'success', body: 'bulk_tab.results.build_equipped' });
		expect(onActivateTab).toHaveBeenCalledWith('gear-tab');
	});

	it('leaves the settings alone when the row ran under the current settings', async () => {
		const { player } = await mount(2, CURRENT_SETTINGS);
		player.setRace(Race.RaceOrc);
		const toast = vi.spyOn(toastManager, 'add').mockReturnValue('toast');

		act(() => {
			fireEvent.click(within(rows()[0]).getByTestId('bulk-equip-btn'));
		});

		expect(player.getGear().equals(RAID.gear)).toBe(true);
		expect(player.getRace()).toBe(Race.RaceOrc);
		expect(toast).toHaveBeenCalledWith({ variant: 'success', body: 'bulk_tab.results.build_equipped' });
	});
});
