import type { BulkSlice } from '@sim/state/sim_store';

import type { BulkBuildsCount } from './builds';

export const canRunBatch = (slice: BulkSlice, combinationsLimit: number): boolean =>
	!slice.combinationsPending && !slice.isRunning && slice.combinations > 1 && slice.combinations <= combinationsLimit;

export const canRunBuildsBatch = (isRunning: boolean, count: BulkBuildsCount, combinationsLimit: number): boolean =>
	!isRunning && count.setups > 0 && count.largestRequestCandidates <= combinationsLimit;
