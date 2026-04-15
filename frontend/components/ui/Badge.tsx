import type { ReactNode } from 'react'

type BadgeVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'error'
  | 'neutral'

type BadgeSize = 'sm' | 'md'

export interface BadgeProps {
  variant?: BadgeVariant
  size?: BadgeSize
  dot?: boolean
  children: ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  primary:   'bg-primary-50 text-primary-700 ring-primary-200',
  secondary: 'bg-secondary-50 text-secondary-700 ring-secondary-200',
  success:   'bg-success-light text-success-dark ring-green-200',
  warning:   'bg-warning-light text-warning-dark ring-yellow-200',
  error:     'bg-error-light text-error-dark ring-red-200',
  neutral:   'bg-neutral-100 text-neutral-600 ring-neutral-200',
}

const dotColors: Record<BadgeVariant, string> = {
  primary:   'bg-primary',
  secondary: 'bg-secondary',
  success:   'bg-success',
  warning:   'bg-warning',
  error:     'bg-error',
  neutral:   'bg-neutral-400',
}

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
}

export function Badge({
  variant = 'neutral',
  size = 'md',
  dot = false,
  children,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 font-medium rounded-full ring-1',
        variantStyles[variant],
        sizeStyles[size],
        className,
      ].join(' ')}
    >
      {dot && (
        <span
          className={[
            'inline-block w-1.5 h-1.5 rounded-full shrink-0',
            dotColors[variant],
          ].join(' ')}
        />
      )}
      {children}
    </span>
  )
}
