'use client'

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string
  hint?: string
  error?: string
  /** Node rendered before the input (e.g. currency symbol, icon) */
  startAdornment?: ReactNode
  /** Node rendered after the input (e.g. asset ticker, unit) */
  endAdornment?: ReactNode
  /** @deprecated use startAdornment */
  prefix?: never
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input(
    { label, hint, error, startAdornment, endAdornment, className = '', id, ...props },
    ref,
  ) {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    const hasError = Boolean(error)

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-neutral-700"
          >
            {label}
          </label>
        )}

        <div
          className={[
            'flex items-center gap-2 h-10 px-3',
            'bg-white border rounded-xl transition-colors duration-150',
            'focus-within:ring-2 focus-within:ring-offset-0',
            hasError
              ? 'border-error focus-within:ring-error/30'
              : 'border-neutral-200 focus-within:border-primary focus-within:ring-primary/20',
          ].join(' ')}
        >
          {startAdornment && (
            <span className="shrink-0 text-neutral-400 text-sm">{startAdornment}</span>
          )}

          <input
            ref={ref}
            id={inputId}
            className={[
              'flex-1 min-w-0 bg-transparent text-sm text-neutral-900 outline-none',
              'placeholder:text-neutral-400',
              'disabled:text-neutral-400 disabled:cursor-not-allowed',
              className,
            ].join(' ')}
            {...props}
          />

          {endAdornment && (
            <span className="shrink-0 text-neutral-400 text-sm">{endAdornment}</span>
          )}
        </div>

        {(error ?? hint) && (
          <p
            className={[
              'text-xs',
              hasError ? 'text-error' : 'text-neutral-500',
            ].join(' ')}
          >
            {error ?? hint}
          </p>
        )}
      </div>
    )
  },
)
