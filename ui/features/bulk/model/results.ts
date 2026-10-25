import { applySavedSettings } from '@features/settings/model/saved_settings';
import { APLRotation } from '@generated/proto/apl';
import type { BulkGearSetup, BulkPlayerSettingsSetup, BulkRankedResult, BulkResults, BulkRotationSetup, BulkTalentSetup, TopGearResult } from '@sim/bulk/types';
import type { Gear } from '@sim/proto/gear';
import { getGearIdentityKey } from '@sim/proto/items';
import type { IndividualSimHost } from '@sim/sim_host';
import { batch } from '@sim/state/batch';
import { omitDeep } from '@sim/utils/collections';
import { bulkSimHighStageFloor } from '@sim/wasm/bulk_sim/estimate';

import type { CoreBulkSimResult } from './core_sim';
import { bonusStatsKey } from './gear_setups';
import { buildTieChains } from './tie_chains';

export interface BulkFinishedRequest {
	talents: BulkTalentSetup;
	rotation: BulkRotationSetup;
	/** Null in Gear mode. In Builds, the sent gear setups by gear identity, and the one the baseline stands for, if any. */
	setups: { byGearKey: ReadonlyMap<string, BulkGearSetup>; baseline: BulkGearSetup | null } | null;
	result: CoreBulkSimResult;
}

export type BulkEquipped = 'gear' | 'gear_talents' | 'build';

/** The ranked rows per encounter besides the current gear with the current talents. */
export const BULK_RANKED_SETS = 5;

const gearKey = (gear: Gear) => getGearIdentityKey(gear.asSpec());

// The rotation as picked: two Simple picks that differ only in their settings stay apart.
const rotationKey = ({ isCurrent, rotation }: BulkRotationSetup): string => (isCurrent ? '' : APLRotation.toJsonString(omitDeep(rotation, ['uuid'])));

const talentPairKey = ({ talents, rotation }: Pick<BulkRankedResult, 'talents' | 'rotation'>): string => `${talents.talentsString}|${rotationKey(rotation)}`;

export const bulkResultKey = (result: BulkRankedResult): string =>
	`${gearKey(result.gear)}|${result.gearSetup ? bonusStatsKey(result.gearSetup.bonusStats) : ''}|${talentPairKey(result)}`;

interface NamedRow {
	row: TopGearResult;
	gearSetup: BulkGearSetup | null;
}

// `requests[0]` is the reference request, whose reference DPS is the current gear's row every delta is measured against.
// The backend's paired errors are against that request's own baseline, so rows from any other request keep only their
// gear, DPS and names, and their ties fall back to the unpaired test. With gear setups, a row no setup stands for is
// dropped.
export const rankEncounterResults = (requests: readonly BulkFinishedRequest[], baseGear: Gear): BulkResults => {
	const baseKey = gearKey(baseGear);
	const [first] = requests;
	const reference: BulkRankedResult = {
		gear: baseGear,
		dpsMetrics: first.result.referenceDpsMetrics,
		talents: first.talents,
		rotation: first.rotation,
		gearSetup: null,
	};
	const pool = requests.flatMap(({ talents, rotation, setups, result }, index): BulkRankedResult[] => {
		const candidates = result.topGearResults.flatMap((row): NamedRow[] => {
			const key = gearKey(row.gear);
			if (key === baseKey) return [];
			if (!setups) return [{ row, gearSetup: null }];
			const gearSetup = setups.byGearKey.get(key);
			return gearSetup ? [{ row, gearSetup }] : [];
		});
		if (index === 0) return candidates.map(({ row, gearSetup }) => ({ ...row, talents, rotation, gearSetup }));
		const baseline: NamedRow[] =
			setups && !setups.baseline ? [] : [{ row: { gear: baseGear, dpsMetrics: result.referenceDpsMetrics }, gearSetup: setups?.baseline ?? null }];
		return [...baseline, ...candidates].map(({ row, gearSetup }) => ({ gear: row.gear, dpsMetrics: row.dpsMetrics, talents, rotation, gearSetup }));
	});
	const best = pool.sort((a, b) => b.dpsMetrics.avg - a.dpsMetrics.avg).slice(0, BULK_RANKED_SETS);
	const ranked = [...best, reference].sort((a, b) => b.dpsMetrics.avg - a.dpsMetrics.avg);
	const iterations = Math.max(1, Math.min(...requests.map(({ result }) => result.iterations || bulkSimHighStageFloor())));
	return {
		chains: buildTieChains(ranked, reference, iterations),
		originalGearResults: reference,
		iterations,
		talentPairs: new Set(requests.map(talentPairKey)).size,
	};
};

// A Gear-mode row leaves the rotation and bonus stats alone, and a row run under the current settings leaves the settings
// alone.
export const equipBulkResult = (host: IndividualSimHost<any>, result: BulkRankedResult, settings: BulkPlayerSettingsSetup | null): BulkEquipped => {
	const { player } = host;
	const { gearSetup, talents } = result;
	const savedSettings = settings?.settings ?? null;
	const talentsChanged = player.getTalentsString() !== talents.talentsString;
	batch(() => {
		player.setGear(result.gear);
		player.setTalentsString(talents.talentsString);
		if (gearSetup) {
			player.setAplRotation(result.rotation.rotation);
			player.setBonusStats(gearSetup.bonusStats);
		}
		if (savedSettings) applySavedSettings(host, savedSettings);
	});
	if (gearSetup || savedSettings) return 'build';
	return talentsChanged ? 'gear_talents' : 'gear';
};
