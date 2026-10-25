import { saveEnchantPreset, setEnchantPresetChecked } from '@features/enchant-presets/model/enchant_presets';
import { BulkEnchantSlotOptions, BulkSettings } from '@generated/proto/api';
import { APLListItem, APLRotation, APLRotation_Type as APLRotationType } from '@generated/proto/apl';
import { Encounter, type EquipmentSpec, ItemSlot, ItemSpec, ItemType, Profession, Race, Stat, Target } from '@generated/proto/common';
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
	UIEnchant,
} from '@generated/proto/ui';
import type { BulkSimOverrides } from '@sim/bulk/types';
import { Gear } from '@sim/proto/gear';
import { getGearIdentityKey } from '@sim/proto/items';
import { Stats } from '@sim/proto/stats';
import { bulkState, patchBulkState } from '@sim/settings/bulk_settings';
import type { IndividualSimHost } from '@sim/sim_host';
import { type BulkMode, patchSlice } from '@sim/state/sim_store';
import { makeBulkPlayer } from '@testing/sim/bulk_player';
import { makeEquippedItem } from '@testing/storybook/fixtures/gear';
import { makeUIEnchant } from '@testing/storybook/fixtures/protos';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { compareMatrix } from './compare';
import { runCoreBulkSim } from './core_sim';
import { setBulkMode } from './mode';
import { bulkProgress, cancelBulkBatch, refreshBulkCombinations, runBulkBatch } from './run';

// i18n is not mocked: the test loader has no resources, so every label reads as its key.
vi.mock('./core_sim', () => ({ runCoreBulkSim: vi.fn() }));
vi.mock('../../../tracking/utils', () => ({ trackEvent: () => {} }));

const AGILITY = 10;

describe('bulk requests', () => {
	it('carry the enchant pool', async () => {
		const player = makeBulkPlayer({
			getGear: () => ({ getEquippedItem: () => null }),
			getEnchants: (slot: ItemSlot) => (slot === ItemSlot.ItemSlotBack ? [UIEnchant.create({ effectId: AGILITY })] : []),
		});
		saveEnchantPreset(player, { name: 'Undead', slots: [{ slot: ItemSlot.ItemSlotBack, effectIds: [AGILITY] }] });
		setEnchantPresetChecked(player, 'Undead', true);
		const getBulkCombinationCount = vi.fn(async (_settings: BulkSettings) => ({ combinations: 2, iterations: 1 }));

		await refreshBulkCombinations({
			player,
			sim: { getBulkCombinationCount },
			handleCrash: (e: unknown) => Promise.reject(e),
		} as unknown as IndividualSimHost<any>);

		expect(getBulkCombinationCount.mock.calls[0][0].enchants).toEqual([
			BulkEnchantSlotOptions.create({ slot: ItemSlot.ItemSlotBack, effectIds: [AGILITY] }),
		]);
	});

	it('keep a selection with no combination as its reason beside the count, not a crash, and clear it once it gives some', async () => {
		const player = makeBulkPlayer({ getGear: () => ({ getEquippedItem: () => null }) });
		const reason = 'no equippable pair of items available for grouped bulk slot 11';
		const getBulkCombinationCount = vi.fn(async () => ({ combinations: 0, iterations: 0, error: { type: 0, message: reason } }));
		const handleCrash = vi.fn();
		const host = { player, sim: { getBulkCombinationCount }, handleCrash } as unknown as IndividualSimHost<any>;

		await refreshBulkCombinations(host);
		expect(handleCrash).not.toHaveBeenCalled();
		expect(bulkState(player)).toMatchObject({ combinations: 0, iterations: 0, combinationsError: reason, combinationsPending: false });

		getBulkCombinationCount.mockResolvedValue({ combinations: 4, iterations: 2000, error: undefined } as never);
		await refreshBulkCombinations(host);
		expect(bulkState(player)).toMatchObject({ combinations: 4, combinationsError: null });
	});
});

const CORE_RESULT = { referenceDpsMetrics: { avg: 1000, stdev: 1 }, topGearResults: [], iterations: 100, metrics: {} };
const SAVED_KEY = 'saved-encounters';
const SAVED_TALENTS_KEY = 'saved-talents';
const SAVED_GEAR_KEY = 'saved-gear';
const SAVED_SETTINGS_KEY = 'saved-settings';
const SAVED_ROTATIONS_KEY = 'saved-rotations';
const LIVE = '30305001302';
const ARMS = '3030500130';
const FURY = '-0505000540501';
const FURY_EDITED = '-0505000530501';

const CURRENT = Encounter.create({ duration: 180, durationVariation: 5, targets: [Target.create()] });
const PATCHWERK = Encounter.create({ duration: 300, durationVariation: 30, useHealth: true, targets: [Target.create()] });
const COUNCIL = Encounter.create({ duration: 90, durationVariation: 10, targets: [Target.create()] });

const HEALER = SavedSettings.create({ race: Race.RaceTroll, professions: [Profession.Alchemy, Profession.Herbalism] });

const CLOAK_AGILITY = makeUIEnchant({ effectId: 849, name: 'Cloak agility', type: ItemType.ItemTypeBack });
const CLOAK_ARMOR = makeUIEnchant({ effectId: 884, name: 'Cloak armor', type: ItemType.ItemTypeBack });
const RING_STAMINA = makeUIEnchant({ effectId: 7301, name: 'Ring stamina', type: ItemType.ItemTypeFinger, requiredProfession: Profession.Enchanting });
const SLOT_ENCHANTS = (slot: ItemSlot) =>
	slot === ItemSlot.ItemSlotBack ? [CLOAK_AGILITY, CLOAK_ARMOR] : slot === ItemSlot.ItemSlotFinger1 ? [RING_STAMINA] : [];

const cloak = (enchant?: UIEnchant) => makeEquippedItem({ item: { id: 101, type: ItemType.ItemTypeBack, unique: false }, enchant });
const chest = () => makeEquippedItem({ item: { id: 102, type: ItemType.ItemTypeChest, unique: false } });
const ring = () => makeEquippedItem({ item: { id: 103, type: ItemType.ItemTypeFinger, unique: false } });

// The current gear already wears the Agility preset's cloak enchant; the Raid set does not.
const CURRENT_GEAR = new Gear({ [ItemSlot.ItemSlotBack]: cloak(CLOAK_AGILITY) });
const RAID_GEAR = new Gear({ [ItemSlot.ItemSlotBack]: cloak(), [ItemSlot.ItemSlotChest]: chest(), [ItemSlot.ItemSlotFinger1]: ring() });
const RAID_WITH_AGILITY = new Gear({ [ItemSlot.ItemSlotBack]: cloak(CLOAK_AGILITY), [ItemSlot.ItemSlotChest]: chest(), [ItemSlot.ItemSlotFinger1]: ring() });
const KNOWN_GEAR = [CURRENT_GEAR, RAID_GEAR];

const STRENGTH_BONUS = new Stats().withStat(Stat.StatStrength, 10);

const AGILITY_PRESET = BulkEnchantPreset.create({
	name: 'Agility',
	slots: [BulkEnchantSlotOptions.create({ slot: ItemSlot.ItemSlotBack, effectIds: [CLOAK_AGILITY.effectId] })],
});
const RINGS_PRESET = BulkEnchantPreset.create({
	name: 'Rings',
	slots: [BulkEnchantSlotOptions.create({ slot: ItemSlot.ItemSlotFinger1, effectIds: [RING_STAMINA.effectId] })],
});

const LIVE_ROTATION = APLRotation.create({ type: APLRotationType.TypeAPL, priorityList: [APLListItem.create({ notes: 'live' })] });
const OPENER = APLRotation.create({ type: APLRotationType.TypeAPL, priorityList: [APLListItem.create({ notes: 'opener' })] });

const resolvedFor = (notes: string) => APLRotation.create({ priorityList: [APLListItem.create({ notes })] });

const eref = (name: string, preset = false) => BulkEncounterRef.create({ name, preset });

const encounterPair = (encounter: BulkEncounterRef, settings = BulkSettingsRef.create()) => BulkEncounterPair.create({ encounter, settings, checked: true });

const talentPair = (talents: BulkTalentRef, rotation = BulkRotationRef.create()) => BulkTalentPair.create({ talents, rotation, checked: true });

const ARMS_PAIR = talentPair(BulkTalentRef.create({ name: 'Arms', preset: true }));
const COUNCIL_PAIR = encounterPair(eref('Council'));
const COUNCIL_HEALER_PAIR = encounterPair(eref('Council'), BulkSettingsRef.create({ name: 'Healer' }));

const writeSaved = <T extends object>(host: IndividualSimHost<any>, key: string, type: { toJson: (message: T) => unknown }, record: Record<string, T>) =>
	host.sim.env.storage.setItem(key, JSON.stringify(Object.fromEntries(Object.entries(record).map(([name, data]) => [name, type.toJson(data)]))));

const writeSavedTalents = (host: IndividualSimHost<any>, record: Record<string, string>) =>
	writeSaved(
		host,
		SAVED_TALENTS_KEY,
		SavedTalents,
		Object.fromEntries(Object.entries(record).map(([name, talentsString]) => [name, SavedTalents.create({ talentsString })])),
	);

interface BatchOptions {
	mode?: BulkMode;
	powerTools?: boolean;
	encounterPairs?: BulkEncounterPair[];
	talentPairs?: BulkTalentPair[];
	gearSets?: BulkGearSetRef[];
	buildEnchantPresets?: string[];
	enchanter?: boolean;
}

// A non-enchanter unless `enchanter`, with live bonus stats of zero. The resolver gives a rotation by the talents alone.
const batchHost = ({
	mode = 'builds',
	powerTools = true,
	encounterPairs = [],
	talentPairs = [],
	gearSets = [BulkGearSetRef.create({ name: 'Raid', preset: true })],
	buildEnchantPresets = ['Agility'],
	enchanter = false,
}: BatchOptions = {}) => {
	const party = { setBuffs: vi.fn() };
	const player = makeBulkPlayer({
		getGear: () => CURRENT_GEAR,
		getTalentsString: () => LIVE,
		aplRotation: LIVE_ROTATION,
		getBonusStats: () => new Stats(),
		hasProfession: (profession: Profession) => enchanter && profession === Profession.Enchanting,
		getEnchants: SLOT_ENCHANTS,
		getResolvedAplRotationForBuild: vi.fn(({ talentsString }: { talentsString: string }) => resolvedFor(talentsString)),
		getParty: () => party,
		setGearAsync: vi.fn(async () => {}),
		setGear: vi.fn(),
		setTalentsString: vi.fn(),
		setAplRotation: vi.fn(),
		setBonusStats: vi.fn(),
		setRace: vi.fn(),
		setProfessions: vi.fn(),
		setConsumes: vi.fn(),
		setBuffs: vi.fn(),
		sim: {
			db: {
				getEnchants: SLOT_ENCHANTS,
				lookupEquipmentSpec: (spec: EquipmentSpec) =>
					KNOWN_GEAR.find(known => getGearIdentityKey(known.asSpec()) === getGearIdentityKey(spec)) ?? new Gear({}),
			},
		},
	});
	patchSlice(player.sim.store, 'ui', { showPowerTools: powerTools });
	patchBulkState(player, { mode, encounterPairs, talentPairs, gearSets, enchantPresets: [AGILITY_PRESET], buildEnchantPresets });
	const host = {
		player,
		sim: {
			store: player.sim.store,
			env: player.sim.env,
			encounter: { toProto: () => Encounter.clone(CURRENT) },
			waitForInit: async () => {},
			signalManager: { abortType: vi.fn(async () => {}) },
			getBulkCombinationCount: vi.fn(async () => ({ combinations: 1, iterations: 1 })),
			getShowPowerTools: () => player.sim.store.getState().ui.showPowerTools,
			raid: { setBuffs: vi.fn() },
		},
		individualConfig: {
			presets: {
				encounters: [{ name: 'Patchwerk', encounter: PATCHWERK }],
				talents: [{ name: 'Arms', data: SavedTalents.create({ talentsString: ARMS }) }],
				gear: [{ name: 'Raid', gear: RAID_GEAR.asSpec() }],
				rotations: [{ name: 'Opener', rotation: SavedRotation.create({ rotation: OPENER }) }],
			},
		},
		getSavedEncounterStorageKey: () => SAVED_KEY,
		getSavedTalentsStorageKey: () => SAVED_TALENTS_KEY,
		getSavedGearStorageKey: () => SAVED_GEAR_KEY,
		getSavedSettingsStorageKey: () => SAVED_SETTINGS_KEY,
		getSavedRotationStorageKey: () => SAVED_ROTATIONS_KEY,
		handleCrash: (e: unknown) => Promise.reject(e),
	} as unknown as IndividualSimHost<any>;
	writeSaved(host, SAVED_KEY, SavedEncounter, { Council: SavedEncounter.create({ encounter: COUNCIL }) });
	writeSavedTalents(host, { Fury: FURY });
	writeSaved(host, SAVED_GEAR_KEY, SavedGearSet, { Buffed: SavedGearSet.create({ gear: RAID_GEAR.asSpec(), bonusStatsStats: STRENGTH_BONUS.toProto() }) });
	writeSaved(host, SAVED_SETTINGS_KEY, SavedSettings, { Healer: HEALER });
	return host;
};

const calls = () => vi.mocked(runCoreBulkSim).mock.calls;

const sentEncounters = () => calls().map(call => call[3].encounter);

const sentTalents = () => calls().map(call => call[3].build?.talentsString);

const specsOf = (gears: readonly Gear[] | undefined) => (gears ?? []).map(gear => gear.asSpec());

const steps = (host: IndividualSimHost<any>) => bulkProgress(host.player)!.steps;

const step = (
	encounter = 'bulk_tab.builds.pairs.current_encounter',
	settings = 'bulk_tab.builds.pairs.current_settings',
	talents = 'bulk_tab.results.current_talents',
	rotation = 'bulk_tab.results.current_rotation',
) => ({ encounter, settings, talents, rotation });

const rowsOf = (host: IndividualSimHost<any>) => bulkState(host.player).results![0].results.chains.flat();

// The sim's rows are the candidates it was sent, each below the reference.
const echoCandidates = async (_context: unknown, _signal: unknown, _settings: unknown, overrides: BulkSimOverrides) => ({
	...CORE_RESULT,
	topGearResults: (overrides.candidates ?? []).map((gear, index) => ({ gear, dpsMetrics: { avg: 900 - index, stdev: 1 } })),
});

describe('runBulkBatch', () => {
	let consoleError: MockInstance;

	beforeEach(() => {
		vi.mocked(runCoreBulkSim).mockReset();
		consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	it('runs Gear mode as one request with the stored settings and no build or settings override', async () => {
		const host = batchHost({ mode: 'gear', encounterPairs: [COUNCIL_PAIR], talentPairs: [ARMS_PAIR] });
		patchBulkState(host.player, { items: [ItemSpec.create({ id: 5 })] });
		setEnchantPresetChecked(host.player, 'Agility', true);
		vi.mocked(runCoreBulkSim).mockResolvedValue(CORE_RESULT as never);

		await runBulkBatch(host);

		expect(calls()).toHaveLength(1);
		expect(calls()[0][3]).toEqual({ encounter: CURRENT });
		expect(calls()[0][2].items).toEqual([ItemSpec.create({ id: 5 })]);
		expect(calls()[0][2].enchants).toEqual([BulkEnchantSlotOptions.create({ slot: ItemSlot.ItemSlotBack, effectIds: [CLOAK_AGILITY.effectId] })]);
		expect(host.sim.getBulkCombinationCount).toHaveBeenCalled();
		expect(steps(host).rows).toEqual([step()]);
		const [entry] = bulkState(host.player).results!;
		expect([entry.isCurrent, entry.settings, entry.results.talentPairs]).toEqual([true, null, 1]);
		expect(entry.results.originalGearResults.rotation.rotation).toEqual(LIVE_ROTATION);
		expect(entry.results.originalGearResults.rotation.rotation).not.toBe(LIVE_ROTATION);
		expect(bulkState(host.player).encounterPairs).toEqual([COUNCIL_PAIR]);
		expect(bulkState(host.player).talentPairs).toEqual([ARMS_PAIR]);
	});

	it('sends every gear setup as a candidate with empty settings in Builds mode', async () => {
		const host = batchHost();
		vi.mocked(runCoreBulkSim).mockImplementation(echoCandidates as never);

		await runBulkBatch(host);

		expect(calls()).toHaveLength(1);
		const [call] = calls();
		expect(call[2]).toEqual(BulkSettings.create());
		expect(specsOf(call[3].candidates)).toEqual(specsOf([RAID_WITH_AGILITY]));
		expect(rowsOf(host).map(row => [row.gearSetup?.gearSet ?? null, row.gearSetup?.enchantPreset ?? null])).toEqual([
			[null, null],
			['Raid', 'Agility'],
		]);
	});

	it('runs each encounter pair × talent pair, current first, with the pair’s settings and the build override', async () => {
		const host = batchHost({ encounterPairs: [COUNCIL_HEALER_PAIR], talentPairs: [ARMS_PAIR] });
		vi.mocked(runCoreBulkSim).mockResolvedValue(CORE_RESULT as never);

		await runBulkBatch(host);

		expect(calls().map(call => [call[3].encounter?.duration, call[3].settings?.race, call[3].build?.talentsString])).toEqual([
			[180, undefined, LIVE],
			[180, undefined, ARMS],
			[90, Race.RaceTroll, LIVE],
			[90, Race.RaceTroll, ARMS],
		]);
		expect(calls()[2][3].settings).toEqual(HEALER);
		expect(calls()[1][3].build).toEqual({ talentsString: ARMS, rotation: resolvedFor(ARMS), bonusStats: new Stats().toProto() });
		const results = bulkState(host.player).results!;
		expect(results.map(entry => [entry.name, entry.isCurrent, entry.settings?.name ?? null, entry.results.talentPairs])).toEqual([
			['', true, '', 2],
			['Council', false, 'Healer', 2],
		]);
		expect(results.map(entry => [entry.duration, entry.durationVariation])).toEqual([
			[180, 5],
			[90, 10],
		]);
	});

	it('sends no settings for the current settings', async () => {
		const host = batchHost({ encounterPairs: [COUNCIL_PAIR] });
		vi.mocked(runCoreBulkSim).mockResolvedValue(CORE_RESULT as never);

		await runBulkBatch(host);

		expect(sentEncounters()).toEqual([CURRENT, COUNCIL]);
		expect(calls().map(call => call[3].settings)).toEqual([undefined, undefined]);
		expect(bulkState(host.player).results!.map(entry => entry.settings?.isCurrent)).toEqual([true, true]);
	});

	it('runs a saved talents entry with the talents it holds when the batch starts', async () => {
		const host = batchHost({ talentPairs: [talentPair(BulkTalentRef.create({ name: 'Fury' }))] });
		writeSavedTalents(host, { Fury: FURY_EDITED });
		vi.mocked(runCoreBulkSim).mockResolvedValue(CORE_RESULT as never);

		await runBulkBatch(host);

		expect(sentTalents()).toEqual([LIVE, FURY_EDITED]);
	});

	it('runs one request per split inside a run’s single step', async () => {
		const host = batchHost({ gearSets: [BulkGearSetRef.create({ name: 'Raid', preset: true }), BulkGearSetRef.create({ name: 'Buffed' })] });
		const running: number[] = [];
		vi.mocked(runCoreBulkSim).mockImplementation(async (...args) => {
			running.push(steps(host).running);
			return echoCandidates(...args) as never;
		});

		await runBulkBatch(host);

		expect(calls().map(call => call[3].build?.bonusStats)).toEqual([new Stats().toProto(), STRENGTH_BONUS.toProto()]);
		expect(specsOf(calls()[1][3].candidates)).toEqual(specsOf([RAID_WITH_AGILITY]));
		expect(running).toEqual([0, 0]);
		expect(steps(host).rows).toHaveLength(1);
		// The reference row once and with no gear setup; the split's rows named by their setups.
		expect(rowsOf(host).map(row => row.gearSetup?.gearSet ?? null)).toEqual([null, 'Raid', 'Buffed']);
	});

	it('gives a setup one Compare row when an encounter pair without Enchanting sends it without its ring enchants', async () => {
		const host = batchHost({ enchanter: true, encounterPairs: [COUNCIL_HEALER_PAIR], buildEnchantPresets: ['Rings'] });
		patchBulkState(host.player, { enchantPresets: [RINGS_PRESET] });
		vi.mocked(runCoreBulkSim).mockImplementation(echoCandidates as never);

		await runBulkBatch(host);

		const ringEnchant = (gear: Gear | undefined) => gear?.getEquippedItem(ItemSlot.ItemSlotFinger1)?.enchant?.effectId ?? null;
		expect(calls().map(call => call[3].candidates?.map(ringEnchant))).toEqual([[RING_STAMINA.effectId], [null]]);
		const { rows } = compareMatrix(bulkState(host.player).results!);
		expect(rows.map(row => [row.gearSetup?.gearSet ?? null, ringEnchant(row.set?.gear), row.cells.map(cell => cell !== null)])).toEqual([
			[null, null, [true, true]],
			['Raid', RING_STAMINA.effectId, [true, true]],
		]);
	});

	it('lists one step per encounter pair and talent pair from the start, encounter pair outer', async () => {
		const host = batchHost({ encounterPairs: [COUNCIL_PAIR], talentPairs: [ARMS_PAIR] });
		const seen: Array<[number, number]> = [];
		const record = () => {
			const { rows, running } = steps(host);
			seen.push([rows.length, running]);
		};
		// The batch is marked running before it waits for the sim, so this is what the progress dialog finds as it mounts.
		host.sim.waitForInit = async () => record();
		vi.mocked(runCoreBulkSim).mockImplementation(async () => {
			record();
			return CORE_RESULT as never;
		});

		await runBulkBatch(host);

		expect(seen).toEqual([
			[4, 0],
			[4, 0],
			[4, 1],
			[4, 2],
			[4, 3],
		]);
		expect(steps(host).rows).toEqual([step(), step(undefined, undefined, 'Arms'), step('Council'), step('Council', undefined, 'Arms')]);
	});

	it('lists every encounter pair as a step from the start, skipping a deleted entry, and moves the running one along', async () => {
		const host = batchHost({ encounterPairs: [encounterPair(eref('Patchwerk', true)), encounterPair(eref('Gone')), COUNCIL_PAIR] });
		const seen: Array<[number, number]> = [];
		const record = () => {
			const { rows, running } = steps(host);
			seen.push([rows.length, running]);
		};
		host.sim.waitForInit = async () => record();
		vi.mocked(runCoreBulkSim).mockImplementation(async () => {
			record();
			return CORE_RESULT as never;
		});

		await runBulkBatch(host);

		expect(sentEncounters()).toEqual([CURRENT, PATCHWERK, COUNCIL]);
		expect(seen).toEqual([
			[3, 0],
			[3, 0],
			[3, 1],
			[3, 2],
		]);
		expect(steps(host).rows[1]).toEqual(step('Patchwerk'));
	});

	it('never writes the player, party or raid while running', async () => {
		const host = batchHost({
			encounterPairs: [COUNCIL_HEALER_PAIR],
			talentPairs: [talentPair(BulkTalentRef.create({ name: 'Arms', preset: true }), BulkRotationRef.create({ name: 'Opener', preset: true }))],
			gearSets: [BulkGearSetRef.create({ name: 'Raid', preset: true }), BulkGearSetRef.create({ name: 'Buffed' })],
		});
		vi.mocked(runCoreBulkSim).mockImplementation(echoCandidates as never);

		await runBulkBatch(host);

		expect(calls()).toHaveLength(8);
		const { player } = host;
		for (const write of [
			player.setGear,
			player.setTalentsString,
			player.setAplRotation,
			player.setBonusStats,
			player.setRace,
			player.setProfessions,
			player.setConsumes,
			player.setBuffs,
			player.getParty()!.setBuffs,
			host.sim.raid.setBuffs,
		]) {
			expect(write).not.toHaveBeenCalled();
		}
		expect(player.setGearAsync).toHaveBeenCalledExactlyOnceWith(CURRENT_GEAR);
	});

	it('does not count Gear-mode combinations in Builds mode', async () => {
		const host = batchHost();
		vi.mocked(runCoreBulkSim).mockResolvedValue(CORE_RESULT as never);

		await runBulkBatch(host);

		expect(host.sim.getBulkCombinationCount).not.toHaveBeenCalled();
		expect(bulkState(host.player).combinationsPending).toBe(false);
	});

	it('runs nothing in Builds mode without a gear setup', async () => {
		const host = batchHost({ buildEnchantPresets: [] });

		await runBulkBatch(host);

		expect(runCoreBulkSim).not.toHaveBeenCalled();
		expect(bulkState(host.player)).toMatchObject({ isRunning: false, started: false, results: null });
	});

	it('runs only the current encounter with power tools off, keeping the stored pairs for when they are back on', async () => {
		const host = batchHost({ powerTools: false, encounterPairs: [encounterPair(eref('Patchwerk', true)), COUNCIL_PAIR], talentPairs: [ARMS_PAIR] });
		vi.mocked(runCoreBulkSim).mockResolvedValue(CORE_RESULT as never);

		await runBulkBatch(host);

		expect(calls().map(call => call[3])).toEqual([{ encounter: CURRENT }]);
		expect(steps(host).rows).toHaveLength(1);
		expect(bulkState(host.player).encounterPairs).toHaveLength(2);
		expect(bulkState(host.player).talentPairs).toEqual([ARMS_PAIR]);

		vi.mocked(runCoreBulkSim).mockClear();
		patchSlice(host.player.sim.store, 'ui', { showPowerTools: true });
		await runBulkBatch(host);

		expect(sentEncounters()).toEqual([CURRENT, CURRENT, PATCHWERK, PATCHWERK, COUNCIL, COUNCIL]);
		expect(sentTalents()).toEqual([LIVE, ARMS, LIVE, ARMS, LIVE, ARMS]);
	});

	it('runs the stored pairs once Gear mode turns to Builds', async () => {
		const host = batchHost({ mode: 'gear', encounterPairs: [COUNCIL_PAIR], talentPairs: [ARMS_PAIR] });
		vi.mocked(runCoreBulkSim).mockResolvedValue(CORE_RESULT as never);

		await runBulkBatch(host);
		expect(sentEncounters()).toEqual([CURRENT]);

		vi.mocked(runCoreBulkSim).mockClear();
		setBulkMode(host.player, 'builds');
		await runBulkBatch(host);

		expect(sentEncounters()).toEqual([CURRENT, CURRENT, COUNCIL, COUNCIL]);
	});

	it('keeps the finished encounter pairs when cancelled', async () => {
		const host = batchHost({ encounterPairs: [COUNCIL_PAIR] });
		vi.mocked(runCoreBulkSim)
			.mockResolvedValueOnce(CORE_RESULT as never)
			.mockImplementationOnce(async () => {
				await cancelBulkBatch(host);
				throw new Error('Bulk Sim Aborted');
			});

		await runBulkBatch(host);

		expect(bulkState(host.player).results!.map(entry => entry.isCurrent)).toEqual([true]);
		expect(bulkState(host.player).isRunning).toBe(false);
	});

	it('keeps the finished encounter pairs when a later one fails', async () => {
		const host = batchHost({ encounterPairs: [COUNCIL_PAIR] });
		vi.mocked(runCoreBulkSim)
			.mockResolvedValueOnce(CORE_RESULT as never)
			.mockRejectedValueOnce(new Error('worker crashed'));

		await runBulkBatch(host);

		expect(consoleError).toHaveBeenCalled();
		expect(bulkState(host.player).results!.map(entry => entry.isCurrent)).toEqual([true]);
	});

	it('leaves no results when the first encounter pair fails', async () => {
		const host = batchHost({ encounterPairs: [COUNCIL_PAIR] });
		vi.mocked(runCoreBulkSim).mockRejectedValueOnce(new Error('worker crashed'));

		await runBulkBatch(host);

		expect(consoleError).toHaveBeenCalled();
		expect(bulkState(host.player).results).toBeNull();
	});

	it('drops an encounter pair whose requests did not all finish', async () => {
		const host = batchHost({ encounterPairs: [COUNCIL_PAIR], talentPairs: [ARMS_PAIR] });
		vi.mocked(runCoreBulkSim)
			.mockResolvedValueOnce(CORE_RESULT as never)
			.mockResolvedValueOnce(CORE_RESULT as never)
			.mockResolvedValueOnce(CORE_RESULT as never)
			.mockImplementationOnce(async () => {
				await cancelBulkBatch(host);
				throw new Error('Bulk Sim Aborted');
			});

		await runBulkBatch(host);

		expect(calls()).toHaveLength(4);
		expect(bulkState(host.player).results!.map(entry => entry.isCurrent)).toEqual([true]);
	});
});
