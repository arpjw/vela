'use client'

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string
  hint?: string
  error?: string
  startAdornment?: ReactNode
  endAdornment?: ReactNode
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
            className="text-[10px] font-medium text-stone uppercase tracking-caps"
          >
            {label}
          </label>
        )}

        <div
          className={[
            'flex items-center gap-2 h-10 px-3',
            'bg-raised border transition-colors duration-150',
            'focus-within:ring-1 focus-within:ring-offset-0',
            hasError
              ? 'border-error focus-within:ring-error/40'
              : 'border-neutral-200 focus-within:border-primary focus-within:ring-primary/30',
          ].join(' ')}
        >
          {startAdornment && (
            <span className="shrink-0 text-stone text-sm">{startAdornment}</span>
          )}

          <input
            ref={ref}
            id={inputId}
            className={[
              'flex-1 min-w-0 bg-transparent text-sm text-cream font-mono outline-none',
              'placeholder:text-neutral-400',
              'disabled:text-neutral-400 disabled:cursor-not-allowed',
              className,
            ].join(' ')}
            {...props}
          />

          {endAdornment && (
            <span className="shrink-0 text-stone text-xs font-medium uppercase tracking-caps">{endAdornment}</span>
          )}
        </div>

        {(error ?? hint) && (
          <p
            className={[
              'text-xs',
              hasError ? 'text-error' : 'text-stone',
            ].join(' ')}
          >
            {error ?? hint}
          </p>
        )}
      </div>
    )
  },
)
