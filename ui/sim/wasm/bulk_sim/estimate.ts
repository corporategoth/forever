import { BulkSimStage } from '@generated/proto/api';

import { BULK_SIM_MIN_COMBINATIONS } from './constants_auto_gen';
import { bulkSimStageConfigs, getBulkSimStageMaxSurvivors, shouldRunBulkSimStage } from './stage';

export const bulkSimHighStageFloor = (): number => bulkSimStageConfigs[bulkSimStageConfigs.length - 1]!.minIterations ?? 0;

const bulkSimSingleStageIterations = (candidateCount: number): number => bulkSimHighStageFloor() * (candidateCount + 1);

export const shouldUseSingleStageBulkSim = (candidateCount: number): boolean => {
	if (candidateCount < BULK_SIM_MIN_COMBINATIONS) {
		return true;
	}

	return getBulkSimOptimisationIterationsUpperBound(candidateCount) >= bulkSimSingleStageIterations(candidateCount);
};

const getBulkSimOptimisationIterationsUpperBound = (candidateCount: number): number => {
	let remainingCandidates = candidateCount;
	let iterations = 0;

	for (const config of bulkSimStageConfigs) {
		if (config.stage === BulkSimStage.BulkSimStageHigh) {
			break;
		}
		if (!shouldRunBulkSimStage(config, remainingCandidates)) {
			continue;
		}

		iterations += (config.minIterations ?? 0) * (remainingCandidates + 1);
		remainingCandidates = Math.min(remainingCandidates, getBulkSimStageMaxSurvivors(config, remainingCandidates) ?? remainingCandidates);
	}

	return iterations + bulkSimHighStageFloor() * (remainingCandidates + 1);
};

// What a batch of candidateCount gear sets sims at each stage's minimum, the baseline included, with every culling stage
// keeping its most survivors. The error target can raise a stage above its minimum, and the adaptive passes and the finalist
// stage add iterations on top, so a run usually sims more.
export const estimateBulkSimIterations = (candidateCount: number): number => {
	const singleStageIterations = bulkSimSingleStageIterations(candidateCount);
	if (candidateCount < BULK_SIM_MIN_COMBINATIONS) {
		return singleStageIterations;
	}

	// shouldUseSingleStageBulkSim runs whichever of the two sims fewer iterations.
	return Math.min(singleStageIterations, getBulkSimOptimisationIterationsUpperBound(candidateCount));
};
