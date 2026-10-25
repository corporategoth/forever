import { APLRotation, APLRotation_Type as APLRotationType } from '@generated/proto/apl';
import { BulkRotationRef, BulkTalentPair, BulkTalentRef, SavedRotation, SavedTalents } from '@generated/proto/ui';
import i18n from '@i18n/config';
import type { IndividualSimHost } from '@sim/sim_host';
import { makeBulkPlayer } from '@testing/sim/bulk_player';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import english from '../../../../assets/locales/en/translation.json';
import { pickableBulkRotations } from './rotations';
import { bulkTalentPairList, bulkTalentPairRuns, talentPairLabel, talentPairOptions } from './talent_pairs';
import { pickableBulkTalents } from './talents';

// No i18n mock: the labels are the real copy, and the test setup loads no locale, so this suite loads the English one.
beforeAll(() => {
	i18n.addResourceBundle('en', 'translation', english, true, true);
});
afterAll(() => {
	i18n.removeResourceBundle('en', 'translation');
});

const TALENTS_KEY = 'saved-talents';
const ROTATIONS_KEY = 'saved-rotations';
const ARMS = '3030500130';
const FURY = '-0505000540501';
const LIVE = '30305001302';

// One list item whose notes tell rotations apart.
const rotation = (notes: string) => APLRotation.create({ type: APLRotationType.TypeAPL, priorityList: [{ notes }] });

const talentRef = (name: string, preset = false) => BulkTalentRef.create({ name, preset });

const rotationRef = (name: string, preset = false) => BulkRotationRef.create({ name, preset });

const pair = (talentsSide: BulkTalentRef | undefined, rotationSide: BulkRotationRef | undefined, checked = true) =>
	BulkTalentPair.create({ talents: talentsSide, rotation: rotationSide, checked });

// A preset talent setup "Arms" and a saved "Fury"; a preset rotation "Single target" and a saved "Mine".
const entries = () => {
	const player = makeBulkPlayer();
	const { storage } = player.sim.env;
	storage.setItem(TALENTS_KEY, JSON.stringify({ Fury: SavedTalents.toJson(SavedTalents.create({ talentsString: FURY })) }));
	storage.setItem(ROTATIONS_KEY, JSON.stringify({ Mine: SavedRotation.toJson(SavedRotation.create({ rotation: rotation('mine') })) }));
	const host = {
		player,
		sim: player.sim,
		individualConfig: {
			presets: {
				talents: [{ name: 'Arms', data: SavedTalents.create({ talentsString: ARMS }) }],
				rotations: [{ name: 'Single target', rotation: SavedRotation.create({ rotation: rotation('st') }) }],
			},
		},
		getSavedTalentsStorageKey: () => TALENTS_KEY,
		getSavedRotationStorageKey: () => ROTATIONS_KEY,
	} as unknown as IndividualSimHost<any>;
	return { talents: pickableBulkTalents(host), rotations: pickableBulkRotations(host) };
};

describe('talent pairs', () => {
	it('lists the current talents and rotation first in each select, then the presets, then the saved entries', () => {
		const { talents, rotations } = entries();
		const options = talentPairOptions(talents, rotations);

		expect(options.talents.map(option => [option.ref.name, option.ref.preset, option.label])).toEqual([
			['', false, 'Current talents'],
			['Arms', true, 'Arms'],
			['Fury', false, 'Fury'],
		]);
		expect(options.rotations.map(option => [option.ref.name, option.ref.preset, option.label])).toEqual([
			['', false, 'Current rotation'],
			['Single target', true, 'Single target'],
			['Mine', false, 'Mine'],
		]);
	});

	it('lists the stored pairs in their order, each named by its talents and rotation', () => {
		const { talents, rotations } = entries();
		const list = bulkTalentPairList(talents, rotations, [pair(talentRef('Arms', true), undefined), pair(undefined, rotationRef('Mine'), false)]);

		expect(list.map(row => row.label)).toEqual(['Arms · Current rotation', 'Current talents · Mine']);
		expect(list.map(row => row.checked)).toEqual([true, false]);
	});

	it('runs the current pair first, then each checked pair with its talents and rotation', () => {
		const { talents, rotations } = entries();
		const runs = bulkTalentPairRuns({ talentsString: LIVE, rotation: rotation('live') }, talents, rotations, [
			pair(talentRef('Fury'), rotationRef('Single target', true)),
			pair(talentRef('Arms', true), undefined, false),
			pair(undefined, rotationRef('Mine')),
		]);

		expect(runs.map(run => talentPairLabel(run))).toEqual(['Current talents · Current rotation', 'Fury · Single target', 'Current talents · Mine']);
		expect(runs.map(run => run.talents.talentsString)).toEqual([LIVE, FURY, LIVE]);
		expect(runs.map(run => run.rotation.rotation.priorityList[0]?.notes)).toEqual(['live', 'st', 'mine']);
	});

	it('runs the current talents with the rotation it is given', () => {
		const { talents, rotations } = entries();
		const live = APLRotation.clone(rotation('live'));
		const runs = bulkTalentPairRuns({ talentsString: LIVE, rotation: live }, talents, rotations, [pair(talentRef('Fury'), undefined)]);

		expect(runs[0].rotation.rotation).toBe(live);
		expect(runs[1].rotation.rotation).toBe(live);
	});
});
