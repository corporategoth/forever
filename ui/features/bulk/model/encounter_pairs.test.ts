import { Encounter, Race, Target } from '@generated/proto/common';
import { BulkEncounterPair, BulkEncounterRef, BulkSettingsRef, SavedEncounter, SavedSettings } from '@generated/proto/ui';
import i18n from '@i18n/config';
import { bulkState, loadStoredBulkEncounterPairs } from '@sim/settings/bulk_settings';
import type { IndividualSimHost } from '@sim/sim_host';
import { makeBulkPlayer } from '@testing/sim/bulk_player';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import english from '../../../../assets/locales/en/translation.json';
import {
	addBulkEncounterPair,
	bulkEncounterPairList,
	bulkEncounterPairRuns,
	bulkEntryLabel,
	encounterPairLabel,
	encounterPairOptions,
	encounterPairSides,
	pickableBulkSettings,
	removeBulkEncounterPair,
	setBulkEncounterPairChecked,
} from './encounter_pairs';
import { pickableBulkEncounters } from './encounters';
import { pairInList } from './pairs';

// No i18n mock: the labels are the real copy, and the test setup loads no locale, so this suite loads the English one.
beforeAll(() => {
	i18n.addResourceBundle('en', 'translation', english, true, true);
});
afterAll(() => {
	i18n.removeResourceBundle('en', 'translation');
});

const ENCOUNTERS_KEY = 'saved-encounters';
const SETTINGS_KEY = 'saved-settings';

const encounter = (duration: number) => Encounter.create({ duration, targets: [Target.create()] });

const CURRENT = encounter(180);
const HEALER = SavedSettings.create({ race: Race.RaceDwarf, reactionTimeMs: 250 });

const encounterRef = (name: string, preset = false) => BulkEncounterRef.create({ name, preset });

const settingsRef = (name: string, preset = false) => BulkSettingsRef.create({ name, preset });

const pair = (encounterSide: BulkEncounterRef | undefined, settingsSide: BulkSettingsRef | undefined, checked = true) =>
	BulkEncounterPair.create({ encounter: encounterSide, settings: settingsSide, checked });

// A preset encounter "Raid" and a saved "Council"; a preset settings entry "Tank" and the saved ones given.
const hostWith = (savedSettings: Record<string, unknown> = { Healer: SavedSettings.toJson(HEALER) }) => {
	const player = makeBulkPlayer();
	const { storage } = player.sim.env;
	storage.setItem(ENCOUNTERS_KEY, JSON.stringify({ Council: SavedEncounter.toJson(SavedEncounter.create({ encounter: encounter(90) })) }));
	storage.setItem(SETTINGS_KEY, JSON.stringify(savedSettings));
	const host = {
		player,
		sim: player.sim,
		individualConfig: {
			presets: {
				encounters: [{ name: 'Raid', encounter: encounter(300) }],
				settings: [{ name: 'Tank', race: Race.RaceHuman, playerOptions: { inFrontOfTarget: true } }],
			},
		},
		getSavedEncounterStorageKey: () => ENCOUNTERS_KEY,
		getSavedSettingsStorageKey: () => SETTINGS_KEY,
	} as unknown as IndividualSimHost<any>;
	return { player, host, encounters: pickableBulkEncounters(host), settings: pickableBulkSettings(host) };
};

const pairsOf = (player: ReturnType<typeof makeBulkPlayer>) =>
	bulkState(player).encounterPairs.map(stored => [stored.encounter?.name ?? '', stored.settings?.name ?? '', stored.checked]);

describe('encounter pairs', () => {
	it('lists the current encounter and settings first in each select, then the presets, then the saved entries', () => {
		const { encounters, settings } = hostWith();
		const options = encounterPairOptions(encounters, settings);

		expect(options.encounters.map(option => [option.ref.name, option.ref.preset, option.label])).toEqual([
			['', false, 'Current encounter'],
			['Raid', true, 'Raid'],
			['Council', false, 'Council'],
		]);
		expect(options.settings.map(option => [option.ref.name, option.ref.preset, option.label])).toEqual([
			['', false, 'Current settings'],
			['Tank', true, 'Tank'],
			['Healer', false, 'Healer'],
		]);
	});

	it('lists the stored pairs in their order, each named by its encounter and settings', () => {
		const { encounters, settings } = hostWith();
		const list = bulkEncounterPairList(encounters, settings, [pair(encounterRef('Raid', true), undefined), pair(undefined, settingsRef('Healer'), false)]);

		expect(list.map(row => row.label)).toEqual(['Raid · Current settings', 'Current encounter · Healer']);
		expect(list.map(row => row.checked)).toEqual([true, false]);
	});

	it('blocks a pair already in the list, the current pair included', () => {
		const { player } = hostWith();
		addBulkEncounterPair(player, pair(encounterRef('Raid', true), settingsRef('Healer')));
		const stored = bulkState(player).encounterPairs;
		const currentPair = pair(encounterRef(''), settingsRef(''));

		expect(pairInList(stored, currentPair, encounterPairSides)).toBe(true);
		expect(pairInList(stored, pair(undefined, undefined), encounterPairSides)).toBe(true);
		expect(pairInList(stored, pair(encounterRef('Raid'), settingsRef('Healer')), encounterPairSides)).toBe(false);

		addBulkEncounterPair(player, pair(encounterRef('Raid', true), settingsRef('Healer'), false));
		addBulkEncounterPair(player, currentPair);

		expect(bulkState(player).encounterPairs).toEqual(stored);
	});

	it('adds a pair checked at the end and stores it so it loads back', () => {
		const { player } = hostWith();
		addBulkEncounterPair(player, pair(encounterRef('Raid', true), undefined, false));
		addBulkEncounterPair(player, pair(encounterRef('Council'), settingsRef('Healer'), false));

		expect(pairsOf(player)).toEqual([
			['Raid', '', true],
			['Council', 'Healer', true],
		]);
		expect(loadStoredBulkEncounterPairs(player)?.pairs).toEqual(bulkState(player).encounterPairs);
	});

	it('removes a pair, and unchecks one without removing it', () => {
		const { player } = hostWith();
		addBulkEncounterPair(player, pair(encounterRef('Raid', true), undefined));
		addBulkEncounterPair(player, pair(encounterRef('Council'), settingsRef('Healer')));

		setBulkEncounterPairChecked(player, pair(encounterRef('Raid', true), settingsRef('')), false);
		expect(pairsOf(player)).toEqual([
			['Raid', '', false],
			['Council', 'Healer', true],
		]);

		removeBulkEncounterPair(player, pair(encounterRef('Council'), settingsRef('Healer')));
		expect(pairsOf(player)).toEqual([['Raid', '', false]]);
		expect(loadStoredBulkEncounterPairs(player)?.pairs).toEqual(bulkState(player).encounterPairs);
	});

	it('runs the current pair first with no settings to send, then each checked pair with its saved settings', () => {
		const { encounters, settings } = hostWith();
		const runs = bulkEncounterPairRuns(CURRENT, encounters, settings, [
			pair(undefined, settingsRef('Healer')),
			pair(encounterRef('Council'), settingsRef('Healer'), false),
			pair(encounterRef('Raid', true), settingsRef('Tank', true)),
		]);

		expect(runs.map(run => encounterPairLabel(run))).toEqual(['Current encounter · Current settings', 'Current encounter · Healer', 'Raid · Tank']);
		expect(runs[0].encounter.encounter).toBe(CURRENT);
		expect(runs.map(run => run.encounter.encounter.duration)).toEqual([180, 180, 300]);
		expect(runs[0].settings.settings).toBeNull();
		expect(runs[1].settings.settings).toEqual(HEALER);
		expect(runs[2].settings.settings).toEqual(expect.objectContaining({ race: Race.RaceHuman, inFrontOfTarget: true }));
	});

	it('hides and skips a pair whose encounter or settings no longer exist, and keeps it stored', () => {
		const { player, host, encounters, settings } = hostWith({});
		addBulkEncounterPair(player, pair(encounterRef('Council'), settingsRef('Healer')));
		addBulkEncounterPair(player, pair(encounterRef('Gone'), undefined));
		addBulkEncounterPair(player, pair(encounterRef('Raid', true), undefined));
		const stored = bulkState(player).encounterPairs;

		expect(bulkEncounterPairList(encounters, settings, stored).map(row => row.label)).toEqual(['Raid · Current settings']);
		expect(bulkEncounterPairRuns(CURRENT, encounters, settings, stored).map(run => encounterPairLabel(run))).toEqual([
			'Current encounter · Current settings',
			'Raid · Current settings',
		]);
		expect(loadStoredBulkEncounterPairs(player)?.pairs).toHaveLength(3);

		player.sim.env.storage.setItem(SETTINGS_KEY, JSON.stringify({ Healer: SavedSettings.toJson(HEALER) }));
		expect(bulkEncounterPairList(encounters, pickableBulkSettings(host), stored).map(row => row.label)).toEqual([
			'Council · Healer',
			'Raid · Current settings',
		]);
	});

	it('names a finished entry by its encounter in Gear mode and by its encounter pair in Builds', () => {
		const healer = { name: 'Healer', isCurrent: false, settings: HEALER };
		const currentSettings = { name: '', isCurrent: true, settings: null };

		expect([
			bulkEntryLabel({ name: '', isCurrent: true, settings: null }),
			bulkEntryLabel({ name: 'Raid', isCurrent: false, settings: null }),
			bulkEntryLabel({ name: 'Raid', isCurrent: false, settings: healer }),
			bulkEntryLabel({ name: '', isCurrent: true, settings: currentSettings }),
		]).toEqual(['Current', 'Raid', 'Raid · Healer', 'Current encounter · Current settings']);
	});

	it('reads a saved settings entry holding fields the protos no longer list', () => {
		const { settings } = hostWith({ Healer: { race: 'RaceDwarf', reactionTimeMs: 250, retiredField: 3 } });

		expect(settings.find(entry => entry.name === 'Healer')?.settings).toEqual(HEALER);
	});
});
