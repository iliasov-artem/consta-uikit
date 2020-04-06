import './ChoiceGroup.css';

import React from 'react';
import { cn } from '../../utils/bem';
import { IIcon } from '../Icon';
import {
  BaseCheckGroupField,
  IBaseCheckGroupField,
  BaseCheckGroupFieldPropGetAdditionalPropsForItem,
} from '../BaseCheckGroupField/BaseCheckGroupField';
import { ChoiceGroupItem } from './Item/ChoiceGroup__item';

export type ChoiceGroupPropSize = 'xs' | 's' | 'm' | 'l';
export type ChoiceGroupPropForm = 'default' | 'brick' | 'round';
export type ChoiceGroupPropView = 'primary';

export type ChoiceGroupProps<T> = {
  size?: ChoiceGroupPropSize;
  form?: ChoiceGroupPropForm;
  view?: ChoiceGroupPropView;
  getItemIcon?: (item: T) => React.FC<IIcon> | undefined;
};

export type IChoiceGroupProps<T> = ChoiceGroupProps<T> &
  Omit<IBaseCheckGroupField<T>, 'componentItem'>;

export const cnChoiceGroup = cn('choice-group');

export function ChoiceGroup<T>(props: IChoiceGroupProps<T>): React.ReactElement {
  const {
    size = 'm',
    form = 'default',
    className,
    view = 'primary',
    getItemIcon,
    ...otherProps
  } = props;

  const getAdditionalPropsForItem: BaseCheckGroupFieldPropGetAdditionalPropsForItem<T> = (item) => {
    return {
      ...(getItemIcon ? { icon: getItemIcon(item) } : {}),
    };
  };

  return (
    <BaseCheckGroupField<T>
      className={cnChoiceGroup({ size, form, view }, [className])}
      componentItem={ChoiceGroupItem}
      getAdditionalPropsForItem={getAdditionalPropsForItem}
      {...otherProps}
    />
  );
}
