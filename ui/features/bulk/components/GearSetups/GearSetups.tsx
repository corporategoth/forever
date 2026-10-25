import i18n from '@i18n/config';
import { usePlayer } from '@sim/context/SimHostContext';
import { useMemo } from 'react';

import { useBulkEnchantPicks } from '../../hooks/useBulkEnchantPicks';
import { useBulkGearSets } from '../../hooks/useBulkGearSets';
import { bulkEnchantPickList, formatEnchantPickSummary, setBulkEnchantPickChecked } from '../../model/enchant_picks';
import { bulkGearSetList, formatGearSetSummary, setBulkGearSetChecked } from '../../model/gear_sets';
import type { SavedRef } from '../../model/saved_refs';
import { BulkCheckList, type BulkCheckRow } from '../BulkCheckList';

export interface GearSetupsViewProps {
	currentGearSummary: string;
	gearSets: { presets: readonly BulkCheckRow[]; saved: readonly BulkCheckRow[] };
	enchantPicks: readonly BulkCheckRow[];
	onGearSetCheckedChange(ref: SavedRef, checked: boolean): void;
	onEnchantPickCheckedChange(name: string, checked: boolean): void;
}

const gearSetsText = (key: string) => i18n.t(`bulk_tab.settings.gear_sets.${key}`);

const enchantPicksText = (key: string) => i18n.t(`bulk_tab.settings.enchant_picks.${key}`);

// Enchant presets are the user's own, so they all list under "Saved"; the presets heading never shows.
export const GearSetupsView = ({ currentGearSummary, gearSets, enchantPicks, onGearSetCheckedChange, onEnchantPickCheckedChange }: GearSetupsViewProps) => (
	<>
		<div className="grid gap-2">
			<h6 className="mb-0">{gearSetsText('heading')}</h6>
			<BulkCheckList
				strings={{ presets: gearSetsText('presets'), saved: gearSetsText('saved'), empty: gearSetsText('empty'), duplicate: gearSetsText('duplicate') }}
				current={{ label: gearSetsText('current'), summary: currentGearSummary }}
				presets={gearSets.presets}
				saved={gearSets.saved}
				onCheckedChange={onGearSetCheckedChange}
				testIds={{ list: 'bulk-gear-sets', row: 'bulk-gear-set', current: 'bulk-gear-set-current' }}
			/>
		</div>
		<div className="grid gap-2">
			<h6 className="mb-0">{enchantPicksText('heading')}</h6>
			<BulkCheckList
				strings={{
					presets: gearSetsText('presets'),
					saved: enchantPicksText('saved'),
					empty: enchantPicksText('empty'),
					duplicate: enchantPicksText('duplicate'),
				}}
				current={null}
				presets={[]}
				saved={enchantPicks}
				onCheckedChange={(ref, checked) => onEnchantPickCheckedChange(ref.name, checked)}
				testIds={{ list: 'bulk-enchant-picks', row: 'bulk-enchant-pick' }}
			/>
		</div>
	</>
);

export const GearSetups = () => {
	const player = usePlayer();
	const { current: currentGear, entries: gearSetEntries, checked: checkedGearSets } = useBulkGearSets();
	const { entries: enchantPickEntries, checked: checkedEnchantPicks } = useBulkEnchantPicks();

	const gearSetRows = useMemo(() => {
		const list = bulkGearSetList(currentGear, gearSetEntries, checkedGearSets).map((item): BulkCheckRow => ({
			ref: item.ref,
			name: item.name,
			summary: formatGearSetSummary(item.gear),
			checked: item.checked,
			duplicate: item.duplicate,
		}));
		return { presets: list.filter(row => row.ref.preset), saved: list.filter(row => !row.ref.preset) };
	}, [currentGear, gearSetEntries, checkedGearSets]);

	const enchantPickRows = useMemo(
		() =>
			bulkEnchantPickList(enchantPickEntries, checkedEnchantPicks).map((item): BulkCheckRow => ({
				ref: item.ref,
				name: item.name,
				summary: formatEnchantPickSummary(item.preset),
				checked: item.checked,
				duplicate: item.duplicate,
			})),
		[enchantPickEntries, checkedEnchantPicks],
	);

	return (
		<GearSetupsView
			currentGearSummary={formatGearSetSummary(currentGear.gear)}
			gearSets={gearSetRows}
			enchantPicks={enchantPickRows}
			onGearSetCheckedChange={(ref, checked) =>
				setBulkGearSetChecked(
					player,
					ref,
					checked,
					gearSetEntries.map(entry => entry.ref),
				)
			}
			onEnchantPickCheckedChange={(name, checked) =>
				setBulkEnchantPickChecked(
					player,
					name,
					checked,
					enchantPickEntries.map(entry => entry.name),
				)
			}
		/>
	);
};
