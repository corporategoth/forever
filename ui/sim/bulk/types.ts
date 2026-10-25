import { DistributionMetrics } from '@generated/proto/api';
import type { APLRotation } from '@generated/proto/apl';
import type { Encounter, UnitStats } from '@generated/proto/common';
import type { SavedSettings } from '@generated/proto/ui';

import type { EquippedItem } from '../proto/equipped_item';
import { Gear } from '../proto/gear';
import type { Stats } from '../proto/stats';

export const WEB_ITERATIONS_LIMIT = 1_000_000;
export const NATIVE_ITERATIONS_LIMIT = 10_000_000;

export const WEB_COMBINATIONS_LIMIT = 5_000;
export const NATIVE_COMBINATIONS_LIMIT = 100_000;

export type OptimisationStage = 'low' | 'medium' | 'high';

export interface TopGearResult {
	gear: Gear;
	dpsMetrics: DistributionMetrics;
	backendRank?: number;
	pairedErrorToNextResult?: number;
	pairedErrorToBaseline?: number;
}

/** A gear set and the talent pair it ran with. Only rows from the reference request carry the backend rank and paired errors. */
export interface BulkRankedResult extends TopGearResult {
	talents: BulkTalentSetup;
	rotation: BulkRotationSetup;
	/** Null on Gear-mode rows and on the reference row. */
	gearSetup: BulkGearSetup | null;
}

export interface BulkPickerEntry {
	/** Index into the batch's item array, or -1/-2 for the two equipped slots this group covers. */
	index: number;
	item: EquippedItem;
}

export interface BulkResults {
	chains: BulkRankedResult[][];
	originalGearResults: BulkRankedResult;
	/** Frozen at run end: the tie brackets were built with it, so the per-row margins have to agree. */
	iterations: number;
	/** How many talent pairs the encounter pair ran; rows name theirs when it is more than one. */
	talentPairs: number;
}

export interface BulkTalentSetup {
	/** Empty for the current talents, which the views label themselves. */
	name: string;
	talentsString: string;
	isCurrent: boolean;
}

export interface BulkGearSetup {
	/** Empty for the current gear, which the views label themselves. */
	gearSet: string;
	enchantPreset: string;
	gear: Gear;
	/** Set on a setup a request sends without its ring enchants: the gear it holds, which its result rows carry. */
	ownGear?: Gear;
	bonusStats: Stats;
}

export interface BulkRotationSetup {
	/** Empty for the current rotation, which the views label themselves. */
	name: string;
	isCurrent: boolean;
	/** As picked, before a Simple or Auto rotation is resolved for a gear set and talents. */
	rotation: APLRotation;
}

export interface BulkTalentPairSetup {
	talents: BulkTalentSetup;
	rotation: BulkRotationSetup;
}

export interface BulkEncounterSetup {
	/** Empty for the current encounter, which the views label themselves. */
	name: string;
	isCurrent: boolean;
	encounter: Encounter;
}

export interface BulkPlayerSettingsSetup {
	/** Empty for the current settings, which the views label themselves. */
	name: string;
	isCurrent: boolean;
	/** Null for the current settings, which send none. */
	settings: SavedSettings | null;
}

export interface BulkEncounterPairSetup {
	encounter: BulkEncounterSetup;
	settings: BulkPlayerSettingsSetup;
}

export interface BulkBuildOverride {
	talentsString: string;
	rotation: APLRotation;
	bonusStats: UnitStats;
}

export interface BulkSimOverrides {
	encounter?: Encounter;
	/** The Settings tab's saved settings the request runs under; absent for the current settings. */
	settings?: SavedSettings;
	build?: BulkBuildOverride;
	/** Sent as they are in place of the generated ones; a candidate that repeats the baseline is dropped. */
	candidates?: readonly Gear[];
}

export interface BulkEncounterResults {
	/** Empty for the current encounter, which the views label themselves. */
	name: string;
	isCurrent: boolean;
	/** Seconds; null for a health-based encounter, which has no set length. */
	duration: number | null;
	durationVariation: number | null;
	/** The encounter pair's settings; null in Gear mode. */
	settings: BulkPlayerSettingsSetup | null;
	results: BulkResults;
}

export interface BulkSimRoundConfig {
	currentRound: number;
	totalRounds: number;
	title?: string;
	stageCurrentRound?: number;
	stageRounds?: number;
}

export interface BulkSimProgressConfig extends BulkSimRoundConfig {
	aggregateCompletedIterations?: number;
	aggregateTotalIterations?: number;
	aggregateStartedAt?: number;
	useSimCountProgress?: boolean;
}
