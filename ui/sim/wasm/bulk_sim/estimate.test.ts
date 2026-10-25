import { describe, expect, it } from 'vitest';

import { bulkSimHighStageFloor, estimateBulkSimIterations } from './estimate';

describe('estimateBulkSimIterations', () => {
	it('sims a run under 20 candidates in one stage at the high-stage floor per gear set and the baseline', () => {
		expect(estimateBulkSimIterations(0)).toBe(bulkSimHighStageFloor());
		expect(estimateBulkSimIterations(19)).toBe(bulkSimHighStageFloor() * 20);
	});

	it('takes the staged estimate from 20 candidates on when it sims fewer', () => {
		expect(estimateBulkSimIterations(5000)).toBeLessThan(bulkSimHighStageFloor() * 5001);
	});
});
