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
  primary:   'bg-primary/10 text-primary ring-primary/20',
  secondary: 'bg-secondary/10 text-secondary ring-secondary/20',
  success:   'bg-success/10 text-success ring-success/20',
  warning:   'bg-warning/10 text-warning ring-warning/20',
  error:     'bg-error/10 text-error ring-error/20',
  neutral:   'bg-neutral-100 text-stone ring-neutral-200',
}

const dotColors: Record<BadgeVariant, string> = {
  primary:   'bg-primary',
  secondary: 'bg-secondary',
  success:   'bg-success',
  warning:   'bg-warning',
  error:     'bg-error',
  neutral:   'bg-neutral-500',
}

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
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
        'inline-flex items-center gap-1 font-medium ring-1 tracking-caps uppercase',
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
