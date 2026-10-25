import { APLRotation, APLRotation_Type as APLRotationType } from '@generated/proto/apl';
import { BulkRotationRef, SavedRotation } from '@generated/proto/ui';
import type { PresetRotation } from '@sim/presets/types';
import { bulkState, loadStoredBulkRotations } from '@sim/settings/bulk_settings';
import type { IndividualSimHost } from '@sim/sim_host';
import { makeBulkPlayer } from '@testing/sim/bulk_player';
import { describe, expect, it, vi } from 'vitest';

import {
	bulkRotationEntries,
	bulkRotationList,
	bulkRotationRuns,
	formatRotationSummary,
	pickableBulkRotations,
	rotationLabel,
	setBulkRotationChecked,
} from './rotations';

vi.mock('@i18n/config', () => ({
	default: {
		t: (key: string) =>
			(
				({
					'rotation_tab.common.rotation_type.auto': 'Auto',
					'rotation_tab.common.rotation_type.simple': 'Simple',
					'rotation_tab.common.rotation_type.apl': 'APL',
				}) as Record<string, string>
			)[key] ?? key,
	},
}));

const SAVED_KEY = 'saved-rotations';

// One list item whose notes tell rotations apart, with a uuid on its condition as the editor sets one.
const rotation = (notes: string, uuid?: string, type = APLRotationType.TypeAPL) =>
	APLRotation.create({
		type,
		priorityList: [{ notes, action: { condition: { uuid: uuid === undefined ? undefined : { value: uuid } } } }],
	});

const ref = (name: string, preset = false) => BulkRotationRef.create({ name, preset });

const entry = (name: string, proto: APLRotation, preset = false) => ({ ref: ref(name, preset), name, rotation: proto });

const presetRotation = (name: string, proto: APLRotation | undefined, extra: Partial<PresetRotation> = {}): PresetRotation => ({
	name,
	rotation: SavedRotation.create({ rotation: proto }),
	...extra,
});

describe('bulkRotationEntries', () => {
	it('lists every preset rotation, then the saved ones', () => {
		const entries = bulkRotationEntries(
			[
				presetRotation('Single target', rotation('st')),
				presetRotation('Gated', rotation('gated'), { enableWhen: () => false }),
				presetRotation('Empty', undefined),
			],
			[{ name: 'Mine', data: SavedRotation.create({ rotation: rotation('mine') }) }],
		);

		expect(entries.map(e => [e.name, e.ref.preset, e.rotation.priorityList[0]?.notes])).toEqual([
			['Single target', true, 'st'],
			['Gated', true, 'gated'],
			['Empty', true, undefined],
			['Mine', false, 'mine'],
		]);
		expect(APLRotation.equals(entries[2].rotation, APLRotation.create())).toBe(true);
	});
});

describe('pickableBulkRotations', () => {
	it('reads the saved rotations the Saved Rotations panel stores, without their uuids', () => {
		const player = makeBulkPlayer();
		player.sim.env.storage.setItem(
			SAVED_KEY,
			JSON.stringify({ Mine: SavedRotation.toJson(SavedRotation.create({ rotation: rotation('mine', 'uuid-1') })) }),
		);
		const host = {
			player,
			sim: player.sim,
			individualConfig: { presets: { rotations: [presetRotation('Single target', rotation('st'))] } },
			getSavedRotationStorageKey: () => SAVED_KEY,
		} as unknown as IndividualSimHost<any>;

		const entries = pickableBulkRotations(host);

		expect(entries.map(e => e.name)).toEqual(['Single target', 'Mine']);
		expect(APLRotation.equals(entries[1].rotation, rotation('mine'))).toBe(true);
	});
});

describe('bulkRotationList', () => {
	it('hides a rotation equal to the current one, ignoring uuids', () => {
		const list = bulkRotationList(
			rotation('live', 'uuid-1'),
			[entry('Same, other uuid', rotation('live', 'uuid-2'), true), entry('Same, no uuid', rotation('live')), entry('Other', rotation('other'))],
			[],
		);

		expect(list.map(item => item.name)).toEqual(['Other']);
	});

	it('flags a checked rotation equal to an earlier checked one, ignoring uuids', () => {
		const list = bulkRotationList(
			rotation('live'),
			[entry('AoE', rotation('aoe', 'uuid-1'), true), entry('AoE copy', rotation('aoe', 'uuid-2'))],
			[ref('AoE', true), ref('AoE copy')],
		);

		expect(list.map(item => [item.name, item.checked, item.duplicate])).toEqual([
			['AoE', true, false],
			['AoE copy', true, true],
		]);
	});
});

describe('bulkRotationRuns', () => {
	it('runs the current rotation first, then each checked rotation as picked', () => {
		const current = rotation('live', 'uuid-1');
		const simple = rotation('simple', undefined, APLRotationType.TypeSimple);
		const entries = [entry('Simple', simple, true), entry('Mine', rotation('mine'))];

		const runs = bulkRotationRuns(current, entries, [ref('Mine'), ref('Simple', true)]);

		expect(runs.map(run => [run.name, run.isCurrent])).toEqual([
			['', true],
			['Simple', false],
			['Mine', false],
		]);
		expect(runs[0].rotation).toBe(current);
		expect(runs[1].rotation).toBe(simple);
	});
});

describe('setBulkRotationChecked', () => {
	it('stores the checked refs in list order so they load back, dropping refs no longer pickable', () => {
		const player = makeBulkPlayer();
		const pickable = [ref('Single target', true), ref('Mine')];
		const { settings } = bulkState(player).v;

		setBulkRotationChecked(player, ref('Mine'), true, pickable);
		setBulkRotationChecked(player, ref('Single target', true), true, pickable);

		expect(loadStoredBulkRotations(player)?.rotations).toEqual([ref('Single target', true), ref('Mine')]);
		expect(bulkState(player).v.settings).toBe(settings);

		setBulkRotationChecked(player, ref('Other'), true, [ref('Single target', true), ref('Other')]);

		expect(bulkState(player).rotations).toEqual([ref('Single target', true), ref('Other')]);
	});
});

describe('labels', () => {
	it('labels the current rotation and names every other one', () => {
		expect(rotationLabel({ isCurrent: true, name: '' })).toBe('bulk_tab.results.current_rotation');
		expect(rotationLabel({ isCurrent: false, name: 'Mine' })).toBe('Mine');
	});

	it('names a rotation by its type', () => {
		expect(formatRotationSummary(APLRotation.create({ type: APLRotationType.TypeAuto }))).toBe('Auto');
		expect(formatRotationSummary(APLRotation.create({ type: APLRotationType.TypeSimple }))).toBe('Simple');
		expect(formatRotationSummary(APLRotation.create({ type: APLRotationType.TypeAPL }))).toBe('APL');
	});

	it('names a rotation with no type an APL, as it runs', () => {
		expect(formatRotationSummary(APLRotation.create())).toBe('APL');
	});
});
