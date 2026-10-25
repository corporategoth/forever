import { Menu as BaseMenu } from '@base-ui/react/menu';
import { Icon } from '@ui-kit/Icon';
import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface MenuRadioGroupProps<V extends string> {
	value: V;
	/** Fires only when the value changes; an item's `onClick` also hears a click on the checked one. */
	onValueChange?: (value: V) => void;
	children: ReactNode;
}

/** The group is the list its items sit in, so the menu around it takes `popupRender={<div />}`. */
export const MenuRadioGroup = <V extends string>({ value, onValueChange, children }: MenuRadioGroupProps<V>) => (
	<BaseMenu.RadioGroup render={<ul />} className="m-0 list-none p-0" value={value} onValueChange={next => onValueChange?.(next as V)}>
		{children}
	</BaseMenu.RadioGroup>
);

export interface MenuRadioItemProps {
	value: string;
	onClick?: () => void;
	className?: string;
	testId?: string;
	children: ReactNode;
}

/** A choice announced as checked or not, with a check after the selected one's content. */
export const MenuRadioItem = ({ value, onClick, className, testId, children }: MenuRadioItemProps) => (
	<li role="none">
		<BaseMenu.RadioItem
			render={<button type="button" />}
			nativeButton
			value={value}
			onClick={onClick}
			closeOnClick
			className={clsx('ui-menu-item', 'ui-menu-item-row', 'gap-2', className)}
			data-testid={testId}>
			<span className="min-w-0 flex-1">{children}</span>
			<BaseMenu.RadioItemIndicator keepMounted className="ui-menu-radio-indicator">
				<Icon name="check" />
			</BaseMenu.RadioItemIndicator>
		</BaseMenu.RadioItem>
	</li>
);
