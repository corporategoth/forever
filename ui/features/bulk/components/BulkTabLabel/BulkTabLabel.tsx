import i18n from '@i18n/config';
import type { BulkMode } from '@sim/state/sim_store';

import { useBulkMode } from '../../hooks/useBulkMode';

export interface BulkTabLabelViewProps {
	powerTools: boolean;
	mode: BulkMode;
}

export const BulkTabLabelView = ({ powerTools, mode }: BulkTabLabelViewProps) => {
	if (!powerTools) return i18n.t('bulk_tab.title');
	return mode === 'builds' ? i18n.t('bulk_tab.modes.builds.tab') : i18n.t('bulk_tab.modes.gear.tab');
};

export const BulkTabLabel = () => {
	const { powerTools, mode } = useBulkMode();
	return <BulkTabLabelView powerTools={powerTools} mode={mode} />;
};
