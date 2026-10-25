import { applySavedSettings } from '@features/settings/model/saved_settings';
import { DistributionMetrics } from '@generated/proto/api';
import { APLRotation, APLRotation_Type as APLRotationType } from '@generated/proto/apl';
import { Race, Stat } from '@generated/proto/common';
import { SavedSettings } from '@generated/proto/ui';
import type { BulkGearSetup, BulkPlayerSettingsSetup, BulkRankedResult, BulkRotationSetup, BulkTalentSetup, TopGearResult } from '@sim/bulk/types';
import type { Gear } from '@sim/proto/gear';
import { getGearIdentityKey } from '@sim/proto/items';
import { Stats } from '@sim/proto/stats';
import type { IndividualSimHost } from '@sim/sim_host';
import { compareGearSet, CURRENT_ROTATION_SETUP, CURRENT_TALENT_SETUP } from '@testing/storybook/fixtures/bulk-compare';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type BulkFinishedRequest, bulkResultKey, equipBulkResult, rankEncounterResults } from './results';

vi.mock('@features/settings/model/saved_settings', () => ({ applySavedSettings: vi.fn() }));

const ARMS_SETUP: BulkTalentSetup = { name: 'Arms', talentsString: '3030500130', isCurrent: false };

const current = compareGearSet(1);
const set2 = compareGearSet(2);
const set3 = compareGearSet(3);
const set4 = compareGearSet(4);
const set5 = compareGearSet(5);

const STRENGTH = new Stats().withStat(Stat.StatStrength, 20);

const setup = (gearSet: string, gear: Gear, bonusStats = STRENGTH): BulkGearSetup => ({ gearSet, enchantPreset: 'Undead', gear, bonusStats });

const RAID_2 = setup('Raid', set2);
const RAID_3 = setup('Raid', set3);
// A preset whose enchants the current gear already wears.
const RAID_CURRENT = setup('Raid', current);

const rotationNamed = (name: string, rotation: APLRotation): BulkRotationSetup => ({ name, isCurrent: false, rotation });

const simple = (specRotationJson: string) => APLRotation.create({ type: APLRotationType.TypeSimple, simple: { specRotationJson } });

const metrics = (avg: number) => DistributionMetrics.create({ avg, stdev: 10 });

const byGearKey = (...setups: BulkGearSetup[]) => new Map(setups.map(gearSetup => [getGearIdentityKey(gearSetup.gear.asSpec()), gearSetup]));

// One finished request: the current gear at `reference` DPS and the backend's top results, each with the extra fields given.
const request = (
	talents: BulkTalentSetup,
	reference: number,
	rows: Array<[Gear, number, Partial<TopGearResult>?]>,
	{
		iterations = 100,
		rotation = CURRENT_ROTATION_SETUP,
		setups = null,
	}: { iterations?: number; rotation?: BulkRotationSetup; setups?: BulkFinishedRequest['setups'] } = {},
): BulkFinishedRequest => ({
	talents,
	rotation,
	setups,
	result: {
		referenceDpsMetrics: metrics(reference),
		topGearResults: rows.map(([gear, avg, extra]) => ({ gear, dpsMetrics: metrics(avg), ...extra })),
		iterations,
		metrics: {},
	},
});

const row = (gear: Gear, overrides: Partial<BulkRankedResult> = {}): BulkRankedResult => ({
	gear,
	dpsMetrics: metrics(1100),
	talents: CURRENT_TALENT_SETUP,
	rotation: CURRENT_ROTATION_SETUP,
	gearSetup: null,
	...overrides,
});

describe('rankEncounterResults', () => {
	it('ranks a lone current-talents run as before: the current gear spliced in at its reference DPS, paired errors kept', () => {
		const { chains, originalGearResults } = rankEncounterResults(
			[
				request(CURRENT_TALENT_SETUP, 1000, [
					[set2, 1100, { backendRank: 0, pairedErrorToBaseline: 3 }],
					[current, 1050],
					[set3, 1020],
				]),
			],
			current,
		);
		expect(chains.flat().map(r => r.dpsMetrics.avg)).toEqual([1100, 1020, 1000]);
		expect(chains.flat()[0].pairedErrorToBaseline).toBe(3);
		expect(originalGearResults.talents).toBe(CURRENT_TALENT_SETUP);
	});

	it('pools every talent setup and keeps the five best besides the reference', () => {
		const rows = rankEncounterResults(
			[
				request(CURRENT_TALENT_SETUP, 1000, [
					[set2, 1100],
					[set3, 1080],
					[set4, 1040],
					[set5, 1020],
				]),
				request(ARMS_SETUP, 1090, [
					[set2, 1110],
					[set3, 1070],
					[set4, 1030],
					[set5, 1010],
				]),
			],
			current,
		).chains.flat();
		expect(rows.map(r => [r.dpsMetrics.avg, r.talents.name])).toEqual([
			[1110, 'Arms'],
			[1100, ''],
			[1090, 'Arms'],
			[1080, ''],
			[1070, 'Arms'],
			[1000, ''],
		]);
	});

	it('keeps the current gear with another talent setup as a row of its own', () => {
		const rows = rankEncounterResults([request(CURRENT_TALENT_SETUP, 1000, []), request(ARMS_SETUP, 1080, [])], current).chains.flat();
		expect(rows.map(r => [r.dpsMetrics.avg, r.talents.name])).toEqual([
			[1080, 'Arms'],
			[1000, ''],
		]);
		expect(new Set(rows.map(bulkResultKey)).size).toBe(2);
	});

	it('drops the paired errors of rows from another talent setup, so their ties use the unpaired test', () => {
		const rows = rankEncounterResults(
			[
				request(CURRENT_TALENT_SETUP, 1000, []),
				request(ARMS_SETUP, 900, [[set2, 1001, { backendRank: 0, pairedErrorToBaseline: 0.01, pairedErrorToNextResult: 0.01 }]]),
			],
			current,
		).chains;
		const armsRow = rows.flat().find(r => r.talents === ARMS_SETUP && r.gear === set2)!;
		expect([armsRow.backendRank, armsRow.pairedErrorToBaseline, armsRow.pairedErrorToNextResult]).toEqual([undefined, undefined, undefined]);
		// Kept paired errors (0.01 against 1001) would split set2 from the reference, giving 3 chains. Dropped, 1001 against
		// 1000 at a spread of 10 over 100 iterations ties unpaired, and the Arms reference at 900 stands apart: 2 chains.
		expect(rows).toHaveLength(2);
	});

	it('takes the fewest iterations any of its talent runs reached', () => {
		const requests = [request(CURRENT_TALENT_SETUP, 1000, [], { iterations: 300 }), request(ARMS_SETUP, 1000, [], { iterations: 200 })];
		expect(rankEncounterResults(requests, current).iterations).toBe(200);
	});

	it('takes the reference from the first request’s baseline with no gear setup, even when a setup wears the current gear', () => {
		const { chains, originalGearResults } = rankEncounterResults(
			[
				request(
					CURRENT_TALENT_SETUP,
					1000,
					[
						[set2, 1100],
						[current, 1050],
					],
					{ setups: { byGearKey: byGearKey(RAID_2, RAID_CURRENT), baseline: RAID_CURRENT } },
				),
			],
			current,
		);

		expect(originalGearResults).toEqual(
			expect.objectContaining({
				gear: current,
				dpsMetrics: metrics(1000),
				talents: CURRENT_TALENT_SETUP,
				rotation: CURRENT_ROTATION_SETUP,
				gearSetup: null,
			}),
		);
		expect(chains.flat().map(r => [r.dpsMetrics.avg, r.gearSetup])).toEqual([
			[1100, RAID_2],
			[1000, null],
		]);
	});

	it('ranks a reference request with no candidates by its baseline alone', () => {
		const rows = rankEncounterResults(
			[
				request(CURRENT_TALENT_SETUP, 1000, [], { setups: { byGearKey: new Map(), baseline: null } }),
				request(CURRENT_TALENT_SETUP, 1200, [[set2, 1080]], { setups: { byGearKey: byGearKey(RAID_2), baseline: null } }),
			],
			current,
		).chains.flat();

		expect(rows.map(r => [r.dpsMetrics.avg, r.gear, r.gearSetup])).toEqual([
			[1080, set2, RAID_2],
			[1000, current, null],
		]);
	});

	it('names each candidate row’s gear setup and drops a row no setup stands for', () => {
		const rows = rankEncounterResults(
			[
				request(
					CURRENT_TALENT_SETUP,
					1000,
					[
						[set2, 1100, { backendRank: 0 }],
						[set4, 1090, { backendRank: 1 }],
						[set3, 1080, { backendRank: 2 }],
					],
					{ setups: { byGearKey: byGearKey(RAID_2, RAID_3), baseline: null } },
				),
				request(ARMS_SETUP, 900, [[set4, 1070]], { setups: { byGearKey: byGearKey(RAID_2), baseline: null } }),
			],
			current,
		).chains.flat();

		expect(rows.map(r => [r.dpsMetrics.avg, r.gearSetup, r.backendRank])).toEqual([
			[1100, RAID_2, 0],
			[1080, RAID_3, 2],
			[1000, null, undefined],
		]);
	});

	it('adds a later request’s baseline named by its setup, and none when its setups say no setup wears the current gear', () => {
		const rows = rankEncounterResults(
			[
				request(CURRENT_TALENT_SETUP, 1000, []),
				request(CURRENT_TALENT_SETUP, 1090, [], { setups: { byGearKey: byGearKey(RAID_CURRENT), baseline: RAID_CURRENT } }),
				request(ARMS_SETUP, 1200, [], { setups: { byGearKey: new Map(), baseline: null } }),
			],
			current,
		).chains.flat();

		expect(rows.map(r => [r.dpsMetrics.avg, r.gear, r.talents, r.gearSetup])).toEqual([
			[1090, current, CURRENT_TALENT_SETUP, RAID_CURRENT],
			[1000, current, CURRENT_TALENT_SETUP, null],
		]);
	});

	it('keys a row by gear, bonus stats, talents and rotation', () => {
		const condition = (uuid: string) => APLRotation.create({ priorityList: [{ action: { condition: { uuid: { value: uuid } } } }] });
		const base = row(set2, { gearSetup: RAID_2, rotation: rotationNamed('Opener', condition('a')) });
		const keyOf = (overrides: Partial<BulkRankedResult>) => bulkResultKey({ ...base, ...overrides });

		// Names, DPS and uuids are not part of the key.
		expect(keyOf({ gearSetup: setup('Saved', set2), dpsMetrics: metrics(900), rotation: rotationNamed('Renamed', condition('b')) })).toBe(
			bulkResultKey(base),
		);
		expect(
			new Set([
				bulkResultKey(base),
				keyOf({ gear: set3 }),
				keyOf({ gearSetup: setup('Raid', set2, new Stats()) }),
				keyOf({ gearSetup: null }),
				keyOf({ talents: ARMS_SETUP }),
				keyOf({ rotation: CURRENT_ROTATION_SETUP }),
				keyOf({ rotation: rotationNamed('Opener', simple('{"useOpener":true}')) }),
				keyOf({ rotation: rotationNamed('Opener', simple('{"useOpener":false}')) }),
			]).size,
		).toBe(8);
	});

	it('counts the talent pairs it ran', () => {
		const opener = rotationNamed('Opener', simple('{"useOpener":true}'));
		const { talentPairs } = rankEncounterResults(
			[
				request(CURRENT_TALENT_SETUP, 1000, []),
				request(CURRENT_TALENT_SETUP, 1000, [], { setups: { byGearKey: new Map(), baseline: null } }),
				request(ARMS_SETUP, 1000, []),
				request(CURRENT_TALENT_SETUP, 1000, [], { rotation: opener }),
				request(ARMS_SETUP, 1000, [], { rotation: opener }),
			],
			current,
		);

		expect(talentPairs).toBe(4);
	});
});

describe('equipBulkResult', () => {
	const HEALER: BulkPlayerSettingsSetup = { name: 'Healer', isCurrent: false, settings: SavedSettings.create({ race: Race.RaceDwarf }) };
	const CURRENT_SETTINGS: BulkPlayerSettingsSetup = { name: '', isCurrent: true, settings: null };

	const hostWith = () => {
		const player = { setGear: vi.fn(), setTalentsString: vi.fn(), setAplRotation: vi.fn(), setBonusStats: vi.fn() };
		return { player, host: { player } as unknown as IndividualSimHost<any> };
	};

	beforeEach(() => {
		vi.mocked(applySavedSettings).mockClear();
	});

	it('sets gear, talents, rotation, bonus stats and the pair’s settings for a Builds row and says it equipped a build', () => {
		const opener = rotationNamed('Opener', simple('{"useOpener":true}'));
		const build = row(set2, { talents: ARMS_SETUP, rotation: opener, gearSetup: RAID_2 });
		const { player, host } = hostWith();

		expect(equipBulkResult(host, build, HEALER)).toBe('build');
		expect(player.setGear).toHaveBeenCalledWith(set2);
		expect(player.setTalentsString).toHaveBeenCalledWith(ARMS_SETUP.talentsString);
		expect(player.setAplRotation).toHaveBeenCalledWith(opener.rotation);
		expect(player.setBonusStats).toHaveBeenCalledWith(STRENGTH);
		expect(applySavedSettings).toHaveBeenCalledOnce();
		expect(applySavedSettings).toHaveBeenCalledWith(host, HEALER.settings);

		// A row run under the current settings is still a build, and the settings stay as they are.
		expect(equipBulkResult(host, build, CURRENT_SETTINGS)).toBe('build');
		expect(applySavedSettings).toHaveBeenCalledOnce();
	});

	it('sets only the gear for a Gear-mode row and says it equipped gear', () => {
		const { player, host } = hostWith();

		expect(equipBulkResult(host, row(set2, { talents: ARMS_SETUP }), null)).toBe('gear');
		expect(player.setGear).toHaveBeenCalledWith(set2);
		expect(player.setTalentsString).not.toHaveBeenCalled();
		expect(player.setAplRotation).not.toHaveBeenCalled();
		expect(player.setBonusStats).not.toHaveBeenCalled();
		expect(applySavedSettings).not.toHaveBeenCalled();
	});

	it('says gear for the Builds reference row under the current settings, which no gear setup stands for', () => {
		const { player, host } = hostWith();

		expect(equipBulkResult(host, row(current), CURRENT_SETTINGS)).toBe('gear');
		expect(player.setGear).toHaveBeenCalledWith(current);
		expect(player.setTalentsString).toHaveBeenCalledWith(CURRENT_TALENT_SETUP.talentsString);
		expect(player.setBonusStats).not.toHaveBeenCalled();
		expect(applySavedSettings).not.toHaveBeenCalled();
	});
});
