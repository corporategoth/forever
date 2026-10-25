import i18n from '@i18n/config';
import { useSim } from '@sim/context/SimHostContext';
import { formatToNumber } from '@sim/utils/format';
import { Button } from '@ui-kit/Button';
import { Icon } from '@ui-kit/Icon';
import { Spinner } from '@ui-kit/Spinner';
import { Tooltip, tooltipAnchorProps } from '@ui-kit/Tooltip';
import { TooltipButton } from '@ui-kit/TooltipButton';
import clsx from 'clsx';
import { useId } from 'react';

import { useBulkState } from '../../hooks/useBulkState';
import type { BulkBuildsCount } from '../../model/builds';
import { bulkIterationsLimit } from '../../model/limits';

export type CombinationsCountBuilds = Pick<
	BulkBuildsCount,
	'setups' | 'encounterPairs' | 'talentPairs' | 'runs' | 'totalIterations' | 'largestRequestIterations'
>;

export interface CombinationsCountViewProps {
	pending: boolean;
	combinations: number;
	iterations: number;
	iterationsLimit: number;
	/** Null in Gear mode, which counts the combinations and iterations of its one run. */
	builds: CombinationsCountBuilds | null;
	// Why the selection gives no combination, shown under the numbers.
	error?: string | null;
}

export const CombinationsCountView = ({ pending, combinations, iterations, iterationsLimit, builds, error }: CombinationsCountViewProps) => {
	const tooltipId = useId();
	const countPending = pending && !builds;
	// A Builds batch sends its runs one at a time, so the limit is per run.
	const overLimit = builds ? builds.largestRequestIterations > iterationsLimit : !pending && iterations > iterationsLimit;
	const warningText = i18n.t('bulk_tab.warning.iterations_limit', { limit: formatToNumber(iterationsLimit) });

	return (
		<dl className="mb-0 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2" data-testid="bulk-combinations-count">
			{builds ? (
				<>
					<dt className="font-normal">{i18n.t('bulk_tab.settings.gear_setups')}</dt>
					<dd className="mb-0 text-right font-bold tabular-nums" data-testid="bulk-gear-setups">
						{formatToNumber(builds.setups)}
					</dd>
				</>
			) : (
				<>
					<dt className="font-normal">{i18n.t('bulk_tab.settings.combinations')}</dt>
					<dd className="mb-0 text-right font-bold tabular-nums" data-testid="bulk-combinations">
						{pending ? <Spinner size="sm" /> : formatToNumber(combinations)}
					</dd>
				</>
			)}
			{builds && builds.setups > 0 && (
				<>
					<dt className="font-normal" data-testid="bulk-runs-label">
						{`${i18n.t('bulk_tab.settings.runs.encounters', { count: builds.encounterPairs })} × ${i18n.t('bulk_tab.settings.runs.talents', { count: builds.talentPairs })}`}
					</dt>
					<dd className="mb-0 text-right font-bold tabular-nums" data-testid="bulk-runs-count">
						{i18n.t('bulk_tab.settings.runs.total', { count: builds.runs, runs: formatToNumber(builds.runs) })}
					</dd>
				</>
			)}
			<dt className="flex items-center gap-1 font-normal">
				{i18n.t('bulk_tab.settings.total_iterations')}
				<TooltipButton
					tooltip={i18n.t('bulk_tab.settings.total_iterations_tooltip')}
					label={i18n.t('common.help')}
					testId="bulk-total-iterations-help"
				/>
			</dt>
			<dd
				className={clsx('mb-0 flex items-center justify-end gap-2 font-bold tabular-nums', overLimit && 'text-danger')}
				data-testid="bulk-total-iterations"
				data-over-limit={overLimit ? '' : undefined}>
				{overLimit && (
					<>
						<Button
							variant="unstyled"
							aria-label={warningText}
							className="text-link-warning"
							data-testid="warning"
							{...tooltipAnchorProps(tooltipId)}>
							<Icon name="triangle-exclamation" />
						</Button>
						<Tooltip id={tooltipId} place="left" content={warningText} />
					</>
				)}
				{countPending ? <Spinner size="sm" /> : formatToNumber(builds ? builds.totalIterations : iterations)}
			</dd>
			{builds?.setups === 0 && (
				<dd className="col-span-2 mb-0" data-testid="bulk-no-gear-setups">
					{i18n.t('bulk_tab.settings.no_gear_setups')}
				</dd>
			)}
			{!builds && !pending && error && (
				<dd className="col-span-2 mb-0 text-danger" role="alert" data-testid="bulk-combinations-error">
					{error}
				</dd>
			)}
		</dl>
	);
};

export const CombinationsCount = ({ builds }: Pick<CombinationsCountViewProps, 'builds'>) => {
	const sim = useSim();
	const pending = useBulkState(slice => slice.combinationsPending);
	const combinations = useBulkState(slice => slice.combinations);
	const iterations = useBulkState(slice => slice.iterations);
	const error = useBulkState(slice => slice.combinationsError);

	return (
		<CombinationsCountView
			pending={pending}
			combinations={combinations}
			iterations={iterations}
			iterationsLimit={bulkIterationsLimit(sim.isNative)}
			builds={builds}
			error={error}
		/>
	);
};
