import { memo } from 'react';
import { classNames } from '~/utils/classNames';

type IconSize = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

interface BaseIconButtonProps {
  size?: IconSize;
  className?: string;
  iconClassName?: string;
  disabledClassName?: string;
  title?: string;
  disabled?: boolean;
  icon?: string;
  variant?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  children?: string | JSX.Element | JSX.Element[];
}

type IconButtonProps = BaseIconButtonProps;

export const IconButton = memo(
  ({
    icon,
    size = 'xl',
    className,
    iconClassName,
    disabledClassName,
    disabled = false,
    title,
    onClick,
    children,
    variant,
  }: IconButtonProps) => {
    const isSecondary = variant === 'secondary';
    
    return (
      <button
        className={classNames(
          'flex items-center text-conformity-elements-item-contentDefault bg-transparent enabled:hover:text-conformity-elements-item-contentActive rounded-md p-1 enabled:hover:bg-conformity-elements-item-backgroundActive disabled:cursor-not-allowed',
          {
            [classNames('opacity-30', disabledClassName)]: disabled,
            'bg-conformity-elements-item-backgroundSecondary hover:bg-conformity-elements-item-backgroundSecondaryHover': isSecondary,
          },
          className,
        )}
        title={title}
        disabled={disabled}
        onClick={(event) => {
          if (disabled) {
            return;
          }

          onClick?.(event);
        }}
      >
        {icon && <div className={classNames(icon, getIconSize(size), iconClassName)}></div>}
        {children}
      </button>
    );
  },
);

function getIconSize(size: IconSize) {
  if (size === 'sm') {
    return 'text-sm';
  } else if (size === 'md') {
    return 'text-md';
  } else if (size === 'lg') {
    return 'text-lg';
  } else if (size === 'xl') {
    return 'text-xl';
  } else {
    return 'text-2xl';
  }
}
