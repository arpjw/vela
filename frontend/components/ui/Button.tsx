'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Spinner } from './Spinner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
}

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const variantStyles: Record<Variant, string> = {
  primary: [
    'bg-primary text-white',
    'hover:bg-primary-600 active:bg-primary-700',
    'focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2',
    'disabled:bg-primary-200 disabled:text-primary-400',
  ].join(' '),

  secondary: [
    'bg-white text-primary border border-primary/30',
    'hover:bg-primary-50 hover:border-primary/50 active:bg-primary-100',
    'focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2',
    'disabled:opacity-50',
  ].join(' '),

  ghost: [
    'bg-transparent text-neutral-700',
    'hover:bg-neutral-100 active:bg-neutral-200',
    'focus-visible:ring-2 focus-visible:ring-neutral-300 focus-visible:ring-offset-2',
    'disabled:opacity-50',
  ].join(' '),

  danger: [
    'bg-error text-white',
    'hover:bg-error-dark active:bg-red-700',
    'focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2',
    'disabled:bg-red-200 disabled:text-red-400',
  ].join(' '),
}

const sizeStyles: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconPosition = 'left',
      disabled,
      className = '',
      children,
      ...props
    },
    ref,
  ) {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          'inline-flex items-center justify-center font-medium rounded-xl',
          'transition-all duration-150 outline-none select-none',
          'cursor-pointer disabled:cursor-not-allowed',
          variantStyles[variant],
          sizeStyles[size],
          className,
        ].join(' ')}
        {...props}
      >
        {loading ? (
          <>
            <Spinner size={size === 'lg' ? 'md' : 'sm'} className="opacity-80" />
            {children && <span className="opacity-70">{children}</span>}
          </>
        ) : (
          <>
            {icon && iconPosition === 'left' && <span className="shrink-0">{icon}</span>}
            {children}
            {icon && iconPosition === 'right' && <span className="shrink-0">{icon}</span>}
          </>
        )}
      </button>
    )
  },
)
