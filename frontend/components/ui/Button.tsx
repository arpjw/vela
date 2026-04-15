'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'buy'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
}

const variantStyles: Record<Variant, string> = {
  primary: [
    'bg-primary text-canvas',
    'hover:bg-primary-600 active:bg-primary-700',
    'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    'disabled:opacity-40',
  ].join(' '),

  buy: [
    'bg-success text-canvas',
    'hover:bg-success-dark active:bg-success-dark',
    'focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    'disabled:opacity-40',
  ].join(' '),

  secondary: [
    'bg-transparent text-primary border border-primary/40',
    'hover:bg-primary/6 hover:border-primary/60 active:bg-primary/10',
    'focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    'disabled:opacity-40',
  ].join(' '),

  ghost: [
    'bg-transparent text-stone',
    'hover:bg-neutral-100 hover:text-cream active:bg-neutral-200',
    'focus-visible:ring-2 focus-visible:ring-neutral-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    'disabled:opacity-40',
  ].join(' '),

  danger: [
    'bg-error text-cream',
    'hover:bg-error-dark active:bg-error-dark',
    'focus-visible:ring-2 focus-visible:ring-error/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    'disabled:opacity-40',
  ].join(' '),
}

const sizeStyles: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
}

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
          'inline-flex items-center justify-center font-medium',
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
