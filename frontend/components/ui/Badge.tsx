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
  primary:   'bg-[rgba(196,148,58,0.15)] text-ochre border border-[rgba(196,148,58,0.3)]',
  secondary: 'bg-[rgba(74,109,156,0.15)] text-fresco border border-[rgba(74,109,156,0.3)]',
  success:   'bg-[rgba(107,140,82,0.15)] text-sage border border-[rgba(107,140,82,0.3)]',
  warning:   'bg-[rgba(196,148,58,0.15)] text-ochre border border-[rgba(196,148,58,0.3)]',
  error:     'bg-[rgba(160,64,42,0.15)] text-terra border border-[rgba(160,64,42,0.3)]',
  neutral:   'bg-[rgba(101,72,42,0.08)] text-brown border border-border',
}

const dotColors: Record<BadgeVariant, string> = {
  primary:   'bg-ochre',
  secondary: 'bg-fresco',
  success:   'bg-sage',
  warning:   'bg-ochre',
  error:     'bg-terra',
  neutral:   'bg-brown',
}

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[0.6rem]',
  md: 'px-2 py-0.5 text-[0.65rem]',
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
        'inline-flex items-center gap-1 font-medium uppercase tracking-[0.1em]',
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
