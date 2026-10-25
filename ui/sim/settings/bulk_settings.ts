// The bulk tab's store slice and its persisted settings blob, so the UI neither writes the
// store directly nor owns a localStorage key. Everything is derived from the player: the slice
// is `bulk[player.storeKey]` and the key is the player's spec prefix.
import { BulkSettings as BulkSettingsProto } from '@generated/proto/api';
import { ItemSlot } from '@generated/proto/common';
import {
	BulkEnchantPresets,
	BulkEnchantPresetSelection,
	BulkEncounterPairs,
	BulkEncounterSelection,
	BulkGearSetSelection,
	BulkRotationSelection,
	BulkTalentPairs,
	BulkTalentSelection,
} from '@generated/proto/ui';
import type { IMessageType } from '@protobuf-ts/runtime';

import { BulkSimItemSlot } from '../bulk/constants_auto_gen';
import type { Player } from '../player/player';
import { type BulkMode, BulkSlice, patchKeyed, seedKeyed } from '../state/sim_store';
import { specStorageKey } from '../state/storage_keys';

const BULK_SETTINGS_STORAGE_KEY = 'bulk-settings.v2';
const LEGACY_BULK_SETTINGS_STORAGE_KEY = 'bulk-settings.v1';
const BULK_ENCHANT_PRESETS_STORAGE_KEY = 'bulk-enchant-presets.v1';
const BULK_ENCOUNTERS_STORAGE_KEY = 'bulk-encounters.v1';
const BULK_TALENTS_STORAGE_KEY = 'bulk-talents.v1';
const BULK_GEAR_SETS_STORAGE_KEY = 'bulk-gear-sets.v1';
const BULK_BUILD_ENCHANT_PRESETS_STORAGE_KEY = 'bulk-build-enchant-presets.v1';
const BULK_ROTATIONS_STORAGE_KEY = 'bulk-rotations.v1';
const BULK_ENCOUNTER_PAIRS_STORAGE_KEY = 'bulk-encounter-pairs.v1';
const BULK_TALENT_PAIRS_STORAGE_KEY = 'bulk-talent-pairs.v1';
const BULK_MODE_STORAGE_KEY = 'bulk-mode.v1';

const initialBulkSlice = (): BulkSlice => ({
	items: [],
	pickerGroups: new Map(),
	frozenItems: new Map([
		[BulkSimItemSlot.ItemSlotFinger, null],
		[BulkSimItemSlot.ItemSlotTrinket, null],
	]),
	frozenWeaponSlot: undefined,
	weaponTypeFilters: new Map([
		[ItemSlot.ItemSlotMainHand, []],
		[ItemSlot.ItemSlotOffHand, []],
	]),
	enchantPresets: [],
	encounters: [],
	talents: [],
	gearSets: [],
	buildEnchantPresets: [],
	rotations: [],
	encounterPairs: [],
	talentPairs: [],
	mode: 'gear',
	combinations: 0,
	iterations: 0,
	combinationsError: null,
	combinationsPending: false,
	isRunning: false,
	started: false,
	results: null,
	runGear: null,
	v: { settings: 0, items: 0 },
});

// Seeds the slice before any subscriber exists (emit-less).
export const seedBulkSettings = (player: Player<any>) => seedKeyed(player.sim.store, 'bulk', player.storeKey, initialBulkSlice());

export const bulkState = (player: Player<any>): BulkSlice => player.sim.store.getState().bulk[player.storeKey];

// A bump with an empty patch is a bare emit; a patch with no bumps is a silent field write.
export const patchBulkState = (player: Player<any>, patch: Partial<Omit<BulkSlice, 'v'>>, bumps: ReadonlyArray<keyof BulkSlice['v']> = []) =>
	patchKeyed(player.sim.store, 'bulk', player.storeKey, patch, bumps);

// Null when nothing is stored, empty defaults when the blob is unparseable.
const loadStoredProto = <T extends object>(player: Player<any>, key: string, type: IMessageType<T>): T | null => {
	const stored = player.sim.env.storage.getItem(specStorageKey(player.getPlayerSpec(), key));
	if (stored == null) return null;
	try {
		return type.fromJsonString(stored, { ignoreUnknownFields: true });
	} catch {
		return type.create();
	}
};

// Over the quota the previously stored value stays, rather than the key being dropped with it.
const storeProto = <T extends object>(player: Player<any>, key: string, type: IMessageType<T>, value: T) => {
	try {
		player.sim.env.storage.setItem(specStorageKey(player.getPlayerSpec(), key), type.toJsonString(value, { enumAsInteger: true }));
	} catch {}
};

// Drops the v1 key on the way.
export const loadStoredBulkSettings = (player: Player<any>): BulkSettingsProto | null => {
	player.sim.env.storage.removeItem(specStorageKey(player.getPlayerSpec(), LEGACY_BULK_SETTINGS_STORAGE_KEY));
	return loadStoredProto(player, BULK_SETTINGS_STORAGE_KEY, BulkSettingsProto);
};

// A batch's item list can outgrow the storage quota; drop the key rather than leave a
// half-written blob behind, matching what the pre-React bulk tab did.
export const storeBulkSettings = (player: Player<any>, settings: BulkSettingsProto) => {
	const { storage } = player.sim.env;
	const key = specStorageKey(player.getPlayerSpec(), BULK_SETTINGS_STORAGE_KEY);
	try {
		storage.setItem(key, BulkSettingsProto.toJsonString(settings, { enumAsInteger: true }));
	} catch (e) {
		if (e instanceof DOMException && e.name === 'QuotaExceededError') {
			storage.removeItem(key);
		}
	}
};

export const loadStoredEnchantPresets = (player: Player<any>): BulkEnchantPresets | null =>
	loadStoredProto(player, BULK_ENCHANT_PRESETS_STORAGE_KEY, BulkEnchantPresets);

export const storeEnchantPresets = (player: Player<any>, presets: BulkEnchantPresets) =>
	storeProto(player, BULK_ENCHANT_PRESETS_STORAGE_KEY, BulkEnchantPresets, presets);

export const loadStoredBulkEncounters = (player: Player<any>): BulkEncounterSelection | null =>
	loadStoredProto(player, BULK_ENCOUNTERS_STORAGE_KEY, BulkEncounterSelection);

export const storeBulkEncounters = (player: Player<any>, selection: BulkEncounterSelection) =>
	storeProto(player, BULK_ENCOUNTERS_STORAGE_KEY, BulkEncounterSelection, selection);

export const loadStoredBulkTalents = (player: Player<any>): BulkTalentSelection | null =>
	loadStoredProto(player, BULK_TALENTS_STORAGE_KEY, BulkTalentSelection);

export const storeBulkTalents = (player: Player<any>, selection: BulkTalentSelection) =>
	storeProto(player, BULK_TALENTS_STORAGE_KEY, BulkTalentSelection, selection);

export const loadStoredBulkGearSets = (player: Player<any>): BulkGearSetSelection | null =>
	loadStoredProto(player, BULK_GEAR_SETS_STORAGE_KEY, BulkGearSetSelection);

export const storeBulkGearSets = (player: Player<any>, selection: BulkGearSetSelection) =>
	storeProto(player, BULK_GEAR_SETS_STORAGE_KEY, BulkGearSetSelection, selection);

export const loadStoredBulkBuildEnchantPresets = (player: Player<any>): BulkEnchantPresetSelection | null =>
	loadStoredProto(player, BULK_BUILD_ENCHANT_PRESETS_STORAGE_KEY, BulkEnchantPresetSelection);

export const storeBulkBuildEnchantPresets = (player: Player<any>, selection: BulkEnchantPresetSelection) =>
	storeProto(player, BULK_BUILD_ENCHANT_PRESETS_STORAGE_KEY, BulkEnchantPresetSelection, selection);

export const loadStoredBulkRotations = (player: Player<any>): BulkRotationSelection | null =>
	loadStoredProto(player, BULK_ROTATIONS_STORAGE_KEY, BulkRotationSelection);

export const storeBulkRotations = (player: Player<any>, selection: BulkRotationSelection) =>
	storeProto(player, BULK_ROTATIONS_STORAGE_KEY, BulkRotationSelection, selection);

export const loadStoredBulkEncounterPairs = (player: Player<any>): BulkEncounterPairs | null =>
	loadStoredProto(player, BULK_ENCOUNTER_PAIRS_STORAGE_KEY, BulkEncounterPairs);

export const storeBulkEncounterPairs = (player: Player<any>, pairs: BulkEncounterPairs) =>
	storeProto(player, BULK_ENCOUNTER_PAIRS_STORAGE_KEY, BulkEncounterPairs, pairs);

export const loadStoredBulkTalentPairs = (player: Player<any>): BulkTalentPairs | null =>
	loadStoredProto(player, BULK_TALENT_PAIRS_STORAGE_KEY, BulkTalentPairs);

export const storeBulkTalentPairs = (player: Player<any>, pairs: BulkTalentPairs) => storeProto(player, BULK_TALENT_PAIRS_STORAGE_KEY, BulkTalentPairs, pairs);

// Null when nothing or an unknown mode is stored.
export const loadStoredBulkMode = (player: Player<any>): BulkMode | null => {
	const stored = player.sim.env.storage.getItem(specStorageKey(player.getPlayerSpec(), BULK_MODE_STORAGE_KEY));
	return stored === 'gear' || stored === 'builds' ? stored : null;
};

export const storeBulkMode = (player: Player<any>, mode: BulkMode) => {
	try {
		player.sim.env.storage.setItem(specStorageKey(player.getPlayerSpec(), BULK_MODE_STORAGE_KEY), mode);
	} catch {}
};
