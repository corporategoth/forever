import i18n from '@i18n/config';
import { SimHostProvider } from '@sim/context/SimHostContext';
import { act, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BulkProgressDialog } from './BulkProgressDialog';

type Listener = (progress: unknown) => void;

const run = vi.hoisted(() => ({ progress: null as unknown, listeners: new Set<Listener>() }));

vi.mock('../../model/run', () => ({
	bulkProgress: () => run.progress,
	subscribeBulkProgress: (_player: unknown, listener: Listener) => {
		run.listeners.add(listener);
		return () => {
			run.listeners.delete(listener);
		};
	},
	cancelBulkBatch: vi.fn(),
}));

const CURRENT = {
	encounter: 'Current encounter',
	encounterSummary: '3:00 ±5s · 1 target',
	settings: 'Current settings',
	talents: 'Current talents',
	rotation: 'Current rotation',
};
const FURY = { ...CURRENT, talents: 'Fury', rotation: 'Fury' };
const LONG_FIGHT = {
	encounter: 'Default - 60',
	encounterSummary: '5:00 ±30s · 3 targets',
	settings: 'Defaults',
	talents: 'Fury',
	rotation: 'Fury - Autocast on use',
};

const progressAt = (rows: object[], running: number) => ({ stage: 'preparing', title: '', steps: { rows, running } });

const mount = (rows: object[]) => {
	run.progress = progressAt(rows, 0);
	render(
		<SimHostProvider host={{ player: {} } as never}>
			<BulkProgressDialog />
		</SimHostProvider>,
	);
};

const runStep = (rows: object[], running: number) =>
	act(() => {
		for (const listener of run.listeners) listener(progressAt(rows, running));
	});

const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const cells = (row: HTMLElement) =>
	within(row)
		.getAllByRole('cell')
		.map(cell => cell.textContent);

describe('BulkProgressDialog', () => {
	beforeEach(() => run.listeners.clear());

	it('lists a Builds batch as a table of encounter with its length and targets, settings, talents and rotation, and marks the running step', () => {
		const rows = [CURRENT, FURY, LONG_FIGHT];
		mount(rows);

		const table = screen.getByRole('table');
		expect(
			within(table)
				.getAllByRole('columnheader')
				.map(header => header.textContent),
		).toEqual([
			i18n.t('bulk_tab.builds.pairs.encounter'),
			i18n.t('bulk_tab.builds.pairs.settings'),
			i18n.t('bulk_tab.builds.pairs.talents'),
			i18n.t('bulk_tab.builds.pairs.rotation'),
			i18n.t('bulk_tab.progress.status'),
		]);
		expect(bodyRows().map(cells)).toEqual([
			['Current encounter3:00 ±5s · 1 target', 'Current settings', 'Current talents', 'Current rotation', ''],
			['Current encounter3:00 ±5s · 1 target', 'Current settings', 'Fury', 'Fury', ''],
			['Default - 605:00 ±30s · 3 targets', 'Defaults', 'Fury', 'Fury - Autocast on use', ''],
		]);
		expect(bodyRows().map(row => row.getAttribute('aria-current'))).toEqual(['step', null, null]);

		runStep(rows, 1);

		expect(bodyRows().map(row => row.getAttribute('data-state'))).toEqual(['done', 'running', 'pending']);
		expect(bodyRows().map(row => row.getAttribute('aria-current'))).toEqual([null, 'step', null]);
		expect(within(bodyRows()[1]).getByTestId('progress-step-spinner')).toBeTruthy();
		expect(within(bodyRows()[0]).getByRole('img', { name: i18n.t('bulk_tab.progress.done') })).toBeTruthy();
		expect(within(bodyRows()[1]).getByRole('img', { name: i18n.t('bulk_tab.progress.running') })).toBeTruthy();
		expect(within(bodyRows()[2]).queryByRole('img')).toBeNull();
	});

	it('shows no step table for a batch of one step, which a Gear-mode batch always is', () => {
		mount([CURRENT]);

		expect(screen.getByRole('progressbar')).toBeTruthy();
		expect(screen.queryByRole('table')).toBeNull();
	});
});
