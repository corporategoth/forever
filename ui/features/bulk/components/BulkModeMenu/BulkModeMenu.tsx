import { BULK_TAB_ID, useActivateTab } from '@features/hooks/useActivateTab';
import i18n from '@i18n/config';
import { usePlayer } from '@sim/context/SimHostContext';
import type { BulkMode } from '@sim/state/sim_store';
import { Menu, MenuItem } from '@ui-kit/Menu';
import type { ReactElement } from 'react';

import { useBulkMode } from '../../hooks/useBulkMode';
import { setBulkMode } from '../../model/mode';

export interface BulkModeMenuViewProps {
	/** The batch tab, which opens the menu on mouseover and on a tap; a click on it still opens the tab. */
	tab: ReactElement;
	onPick: (mode: BulkMode) => void;
}

export const BulkModeMenuView = ({ tab, onPick }: BulkModeMenuViewProps) => {
	const modes: ReadonlyArray<{ mode: BulkMode; label: string; description: string }> = [
		{ mode: 'gear', label: i18n.t('bulk_tab.modes.gear.label'), description: i18n.t('bulk_tab.modes.gear.description') },
		{ mode: 'builds', label: i18n.t('bulk_tab.modes.builds.label'), description: i18n.t('bulk_tab.modes.builds.description') },
	];

	// `nativeButton`: the tab renders a native button, which the kit cannot tell from the element, and a non-native
	// trigger's role="button" would replace role="tab".
	return (
		<Menu
			surface="menu"
			triggerRender={tab}
			triggerProps={{ openOnHover: true, delay: 0, nativeButton: true, className: 'data-popup-open:text-white' }}
			align="start"
			sideOffset={-1}>
			{modes.map(({ mode, label, description }) => (
				<MenuItem key={mode} layout="block" testId={`bulk-mode-${mode}`} onClick={() => onPick(mode)}>
					<span className="block text-sm font-medium">{label}</span>
					<span className="block text-xs text-muted">{description}</span>
				</MenuItem>
			))}
		</Menu>
	);
};

export const BulkModeMenu = ({ tab }: Pick<BulkModeMenuViewProps, 'tab'>) => {
	const player = usePlayer();
	const activate = useActivateTab();
	const { powerTools } = useBulkMode();
	if (!powerTools) return tab;

	return (
		<BulkModeMenuView
			tab={tab}
			onPick={mode => {
				setBulkMode(player, mode);
				activate(BULK_TAB_ID);
			}}
		/>
	);
};
