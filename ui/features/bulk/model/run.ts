import { enchantPresetPool } from '@features/enchant-presets/model/enchant_presets';
import { BulkSettings, ProgressMetrics } from '@generated/proto/api';
import { APLRotation } from '@generated/proto/apl';
import { Profession } from '@generated/proto/common';
import i18n from '@i18n/config';
import { BulkEncounterResults, BulkEncounterSetup, BulkPlayerSettingsSetup, BulkSimOverrides, BulkSimProgressConfig } from '@sim/bulk/types';
import type { Player } from '@sim/player/player';
import { getGearIdentityKey } from '@sim/proto/items';
import { bulkState, patchBulkState } from '@sim/settings/bulk_settings';
import type { IndividualSimHost } from '@sim/sim_host';
import { RequestTypes } from '@sim/sim_signal_manager';
import { toastManager } from '@ui-kit/Toast';

import { trackEvent } from '../../../tracking/utils';
import { bulkBuildRuns, type BulkBuildStep, bulkBuildStep } from './builds';
import { type CoreBulkSimResult, runCoreBulkSim as runCoreBulkSimImpl } from './core_sim';
import { bulkEnchantPickEntries, bulkEnchantPickRuns } from './enchant_picks';
import { bulkEncounterPairRuns, pickableBulkSettings } from './encounter_pairs';
import { encounterLength, pickableBulkEncounters } from './encounters';
import { bulkGearSetRuns, pickableBulkGearSets } from './gear_sets';
import { bulkGearSetups } from './gear_setups';
import { bulkRunsBuilds } from './mode';
import { BulkProgress, candidateGearProgress, simProgress } from './progress';
import { type BulkFinishedRequest, rankEncounterResults } from './results';
import { pickableBulkRotations } from './rotations';
import { createBulkSettingsProto } from './settings';
import { bulkTalentPairRuns } from './talent_pairs';
import { pickableBulkTalents } from './talents';

// The stored settings plus the enchant pool, which is derived from the presets and never stored.
const bulkRequestSettings = (player: Player<any>): BulkSettings => ({ ...createBulkSettingsProto(player), enchants: enchantPresetPool(player) });

/**
 * A batch in flight, per player. None of it belongs in the store: an abort controller and a
 * promise are not state a selector can compare, and the progress ticks are kept out on purpose,
 * so a tick renders the one leaf that shows it instead of every reader of the slice.
 */
interface BulkRun {
	simStart: number;
	isCancelling: boolean;
	abortController: AbortController | null;
	abortPromise: Promise<void> | null;
	combinationsRequestVersion: number;
	progress: BulkRunProgress | null;
	listeners: Set<(progress: BulkRunProgress) => void>;
	steps: BulkEncounterSteps;
}

interface BulkEncounterSteps {
	/** One per encounter pair and talent pair the batch runs, encounter pair outer, one array for the whole run. */
	rows: readonly BulkBuildStep[];
	/** 0-based index into `rows` of the run in progress. */
	running: number;
}

/** A stage's progress with the batch's encounter steps; the run emits a first one before it is marked running. */
interface BulkRunProgress extends BulkProgress {
	steps: BulkEncounterSteps;
}

const runs = new WeakMap<Player<any>, BulkRun>();

const runOf = (player: Player<any>): BulkRun => {
	let run = runs.get(player);
	if (!run) {
		run = {
			simStart: 0,
			isCancelling: false,
			abortController: null,
			abortPromise: null,
			combinationsRequestVersion: 0,
			progress: null,
			listeners: new Set(),
			steps: { rows: [], running: 0 },
		};
		runs.set(player, run);
	}
	return run;
};

export const bulkProgress = (player: Player<any>): BulkRunProgress | null => runOf(player).progress;

export const subscribeBulkProgress = (player: Player<any>, listener: (progress: BulkRunProgress) => void): (() => void) => {
	const { listeners } = runOf(player);
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

const emitProgress = (player: Player<any>, next: BulkProgress | null) => {
	if (!next) return;
	const run = runOf(player);
	const progress = { ...next, steps: run.steps };
	run.progress = progress;
	for (const listener of run.listeners) listener(progress);
};

const setCandidateGearProgress = (player: Player<any>) => {
	emitProgress(player, candidateGearProgress({ now: new Date().getTime() }));
};

const setSimProgress = (player: Player<any>, metrics: ProgressMetrics, config: BulkSimProgressConfig) => {
	emitProgress(player, simProgress(metrics, config, runOf(player).simStart, new Date().getTime()));
};

const calculateBulkCombinations = async (host: IndividualSimHost<any>) => {
	const { sim, player } = host;
	try {
		const bulkSettings = bulkRequestSettings(player);
		const combinationCountResult = await sim.getBulkCombinationCount(bulkSettings);

		// A selection that gives no combination is the user's to change, shown beside the count, not a crash: the count
		// runs again on every edit, so a crash here would alert on each one.
		if (combinationCountResult.error) {
			patchBulkState(player, {
				combinations: 0,
				iterations: 0,
				combinationsError: combinationCountResult.error.message || i18n.t('bulk_tab.notifications.combinations_failed'),
			});
			return;
		}

		patchBulkState(player, {
			combinations: combinationCountResult.combinations,
			iterations: combinationCountResult.iterations,
			combinationsError: null,
		});
	} catch (e) {
		host.handleCrash(e);
	}
};

export const refreshBulkCombinations = async (host: IndividualSimHost<any>) => {
	const run = runOf(host.player);
	const requestVersion = ++run.combinationsRequestVersion;
	patchBulkState(host.player, { combinationsPending: true });
	await calculateBulkCombinations(host);
	if (requestVersion !== run.combinationsRequestVersion) {
		return;
	}
	patchBulkState(host.player, { combinationsPending: false });
};

const throwIfBulkAborted = (player: Player<any>, signal: AbortSignal) => {
	if (signal.aborted || runOf(player).isCancelling) {
		throw new Error(i18n.t('bulk_tab.notifications.bulk_sim_aborted'));
	}
};

const runWithBulkAbort = async <T>(player: Player<any>, promise: Promise<T>, signal: AbortSignal): Promise<T> => {
	throwIfBulkAborted(player, signal);

	let abortHandler: (() => void) | null = null;
	const abortPromise = new Promise<never>((_, reject) => {
		abortHandler = () => reject(new Error(i18n.t('bulk_tab.notifications.bulk_sim_aborted')));
		signal.addEventListener('abort', abortHandler, { once: true });
	});

	try {
		return await Promise.race([promise, abortPromise]);
	} finally {
		if (abortHandler) {
			signal.removeEventListener('abort', abortHandler);
		}
	}
};

const runCoreBulkSim = async (
	host: IndividualSimHost<any>,
	signal: AbortSignal,
	bulkSettings: BulkSettings,
	overrides: BulkSimOverrides,
): Promise<CoreBulkSimResult> => {
	const { player } = host;
	return runCoreBulkSimImpl(
		{
			simUI: host,
			throwIfBulkAborted: abortSignal => throwIfBulkAborted(player, abortSignal),
			runWithBulkAbort: (promise, abortSignal) => runWithBulkAbort(player, promise, abortSignal),
			setSimProgress: (metrics, config) => setSimProgress(player, metrics, config),
			debugOptimisationRound: (message, data) => console.debug(`[bulk-core] ${message}`, data ?? ''),
		},
		signal,
		bulkSettings,
		overrides,
	);
};

const abortBulkSimWork = async (host: IndividualSimHost<any>) => {
	const run = runOf(host.player);
	if (run.abortPromise) {
		return run.abortPromise;
	}

	const abortController = run.abortController;
	if (!abortController) return;

	run.abortController = null;
	if (!abortController.signal.aborted) {
		abortController.abort();
	}

	run.abortPromise = (async () => {
		// Narrower than `All`: cancelling a batch must not also cancel a stat-weights or enchants
		// optimizer run, which is the whole point of bulk having its own type.
		await host.sim.signalManager.abortType(RequestTypes.BulkSim);
	})();

	try {
		await run.abortPromise;
	} finally {
		run.abortPromise = null;
	}
};

export const cancelBulkBatch = async (host: IndividualSimHost<any>) => {
	const run = runOf(host.player);
	if (!bulkState(host.player).isRunning || run.isCancelling) return;

	run.isCancelling = true;
	await abortBulkSimWork(host);
};

interface BulkRequestPlan {
	request: Omit<BulkFinishedRequest, 'result'>;
	overrides: BulkSimOverrides;
}

// An encounter pair and its steps, in run order. A step's requests are one run's splits.
interface BulkEncounterPlan {
	encounter: BulkEncounterSetup;
	settings: BulkPlayerSettingsSetup | null;
	steps: Array<{ row: BulkBuildStep; requests: BulkRequestPlan[] }>;
}

interface CurrentTalentPair {
	talentsString: string;
	rotation: APLRotation;
}

const gearModePlan = (host: IndividualSimHost<any>, current: CurrentTalentPair): BulkEncounterPlan[] => {
	const encounter: BulkEncounterSetup = { name: '', isCurrent: true, encounter: host.sim.encounter.toProto() };
	const [talentPair] = bulkTalentPairRuns(current, [], [], []);
	return [
		{
			encounter,
			settings: null,
			steps: [
				{
					row: bulkBuildStep({ encounterPair: { encounter, settings: { isCurrent: true, name: '' } }, talentPair }),
					requests: [{ request: { ...talentPair, setups: null }, overrides: { encounter: encounter.encounter } }],
				},
			],
		},
	];
};

// Empty with no gear setups. A request's setups are keyed by the gear as sent, which is the gear the sim's rows carry.
const buildsModePlan = (host: IndividualSimHost<any>, current: CurrentTalentPair): BulkEncounterPlan[] => {
	const { sim, player } = host;
	const slice = bulkState(player);
	const reference = { gear: player.getGear(), bonusStats: player.getBonusStats(), isEnchanter: player.hasProfession(Profession.Enchanting) };
	const setups = bulkGearSetups(
		player,
		bulkGearSetRuns({ gear: reference.gear, bonusStats: reference.bonusStats }, pickableBulkGearSets(host), slice.gearSets),
		bulkEnchantPickRuns(bulkEnchantPickEntries(slice.enchantPresets), slice.buildEnchantPresets),
	);
	const encounterPairs = bulkEncounterPairRuns(sim.encounter.toProto(), pickableBulkEncounters(host), pickableBulkSettings(host), slice.encounterPairs);
	const talentPairs = bulkTalentPairRuns(current, pickableBulkTalents(host), pickableBulkRotations(host), slice.talentPairs);
	const runs = bulkBuildRuns(setups, reference, encounterPairs, talentPairs, build => player.getResolvedAplRotationForBuild(build));
	return encounterPairs.flatMap(encounterPair => {
		const steps = runs
			.filter(run => run.encounterPair === encounterPair)
			.map(run => ({
				row: bulkBuildStep(run),
				requests: run.requests.map((request): BulkRequestPlan => ({
					request: {
						talents: run.talentPair.talents,
						rotation: run.talentPair.rotation,
						setups: {
							byGearKey: new Map(request.candidates.map(setup => [getGearIdentityKey(setup.gear.asSpec()), setup])),
							baseline: request.baselineSetup,
						},
					},
					overrides: {
						encounter: encounterPair.encounter.encounter,
						settings: encounterPair.settings.settings ?? undefined,
						build: request.override,
						candidates: request.candidates.map(setup => setup.gear),
					},
				})),
			}));
		return steps.length ? [{ encounter: encounterPair.encounter, settings: encounterPair.settings, steps }] : [];
	});
};

export const runBulkBatch = async (host: IndividualSimHost<any>) => {
	const { sim, player } = host;
	const run = runOf(player);
	if (bulkState(player).isRunning) return;

	const builds = bulkRunsBuilds(sim.getShowPowerTools(), bulkState(player).mode);
	const current = { talentsString: player.getTalentsString(), rotation: APLRotation.clone(player.aplRotation) };
	const plan = builds ? buildsModePlan(host, current) : gearModePlan(host, current);
	if (!plan.length) return;

	trackEvent({
		action: 'sim',
		category: 'simulate',
		label: 'batch',
		value: bulkState(player).combinations,
	});

	run.isCancelling = false;
	run.steps = { rows: plan.flatMap(encounterPlan => encounterPlan.steps.map(step => step.row)), running: 0 };
	// The progress dialog mounts on `isRunning` and takes the steps from the progress there, before the first stage reports.
	setCandidateGearProgress(player);
	patchBulkState(player, { isRunning: true, started: true });
	run.abortController = new AbortController();
	run.abortPromise = null;
	const abortSignal = run.abortController.signal;

	await sim.waitForInit();
	// Empty in Builds: given the Gear-mode settings, a request whose candidates all repeat the baseline would have the sim
	// generate Gear-mode combinations.
	const bulkSettings = builds ? BulkSettings.create() : bulkRequestSettings(player);
	const entries: BulkEncounterResults[] = [];
	let runError: unknown = null;

	try {
		// Bulk owns its own request type now, so this has to name both: a batch still replaces an
		// in-flight single sim, and it still replaces a previous batch, which naming one would drop.
		await sim.signalManager.abortType(RequestTypes.IndividualSim | RequestTypes.BulkSim);
		run.simStart = new Date().getTime();
		const baseGear = player.getGear();
		patchBulkState(player, { runGear: baseGear, results: null });

		if (!builds) await refreshBulkCombinations(host);

		let stepIndex = 0;
		for (const encounterPlan of plan) {
			const finished: BulkFinishedRequest[] = [];
			for (const { requests } of encounterPlan.steps) {
				for (const { request, overrides } of requests) {
					throwIfBulkAborted(player, abortSignal);
					run.steps = { ...run.steps, running: stepIndex };
					setCandidateGearProgress(player);
					run.simStart = new Date().getTime();
					finished.push({ ...request, result: await runCoreBulkSim(host, abortSignal, bulkSettings, overrides) });
				}
				stepIndex++;
			}
			// Pushed only once every request finished, so a cancel or error mid-pair drops the encounter pair.
			entries.push({
				name: encounterPlan.encounter.name,
				isCurrent: encounterPlan.encounter.isCurrent,
				...encounterLength(encounterPlan.encounter.encounter),
				settings: encounterPlan.settings,
				results: rankEncounterResults(finished, baseGear),
			});
		}
	} catch (error) {
		runError = error;
		console.error(error);
		const errorMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;
		if (!run.isCancelling && errorMessage) {
			toastManager.add({
				variant: 'error',
				body: errorMessage,
			});
		}
	} finally {
		const wasCancelling = run.isCancelling;
		if (wasCancelling || runError) {
			await abortBulkSimWork(host);
		}
		await player.setGearAsync(bulkState(player).runGear!);
		if (wasCancelling) {
			toastManager.add({
				variant: 'error',
				body: i18n.t('bulk_tab.notifications.bulk_sim_cancelled'),
			});
		}
		run.isCancelling = false;
		patchBulkState(player, entries.length ? { isRunning: false, results: entries } : { isRunning: false });
	}
};
