import i18n from '@i18n/config';

import { useBulkState } from '../../hooks/useBulkState';
import { rotationLabel } from '../../model/rotations';
import { BulkResultRow } from './BulkResultRow';
import { BulkResultTieGroup } from './BulkResultTieGroup';

export interface BulkResultsProps {
	onActivateTab: (id: string) => void;
	/** Index of the finished encounter whose ranking to show. */
	selected: number;
}

export const BulkResults = ({ onActivateTab, selected }: BulkResultsProps) => {
	const results = useBulkState(slice => slice.results);
	const started = useBulkState(slice => slice.started);

	if (!results) {
		// Starting a run empties the pane, so the invitation to run one does not come back.
		return started ? null : <div className="flex items-center justify-center p-6">{i18n.t('bulk_tab.results.run_simulation')}</div>;
	}

	const { results: shown, settings } = results[selected];
	const iterations = shown.iterations;
	const showTalents = shown.talentPairs > 1;
	// Only rows that differ in rotation name it, so a Gear-mode or talents-only batch shows none.
	const showRotation = new Set(shown.chains.flat().map(result => rotationLabel(result.rotation))).size > 1;
	return (
		<div>
			{shown.chains.map((chain, chainIdx) =>
				chain.length > 1 ? (
					<BulkResultTieGroup key={chainIdx}>
						{chain.map((result, idx) => (
							<BulkResultRow
								key={idx}
								result={result}
								baseResult={shown.originalGearResults}
								iterations={iterations}
								showTalents={showTalents}
								showRotation={showRotation}
								settings={settings}
								onActivateTab={onActivateTab}
							/>
						))}
					</BulkResultTieGroup>
				) : (
					<BulkResultRow
						key={chainIdx}
						result={chain[0]}
						baseResult={shown.originalGearResults}
						iterations={iterations}
						showTalents={showTalents}
						showRotation={showRotation}
						settings={settings}
						onActivateTab={onActivateTab}
					/>
				),
			)}
		</div>
	);
};
