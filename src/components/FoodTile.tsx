import type { CSSProperties } from 'react';
import type { Food } from '../lib/foods';
import { FOOD_COLORS } from '../lib/palette';
import { FoodIcon } from './FoodIcon';

interface Props {
  food: Pick<Food, 'icon' | 'color'>;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/** Rounded square in the food's tile colour with its icon. */
export function FoodTile({ food, size = 40, className = '', style }: Props) {
  const c = FOOD_COLORS[food.color];
  return (
    <div
      aria-hidden="true"
      className={`food-tile ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.29),
        background: c.tile,
        color: c.ink,
        ...style,
      }}
    >
      <FoodIcon icon={food.icon} size={Math.round(size * 0.54)} />
    </div>
  );
}
