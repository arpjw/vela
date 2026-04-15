'use client'

import {
  useState,
  useRef,
  type ReactNode,
  type MouseEvent,
  type FocusEvent,
} from 'react'

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

export interface TooltipProps {
  content: ReactNode
  placement?: TooltipPlacement
  children: ReactNode
  className?: string
}

const placementStyles: Record<TooltipPlacement, string> = {
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left:   'right-full top-1/2 -translate-y-1/2 mr-2',
  right:  'left-full top-1/2 -translate-y-1/2 ml-2',
}

const arrowStyles: Record<TooltipPlacement, string> = {
  top:    'top-full left-1/2 -translate-x-1/2 border-t-neutral-800',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-neutral-800',
  left:   'left-full top-1/2 -translate-y-1/2 border-l-neutral-800',
  right:  'right-full top-1/2 -translate-y-1/2 border-r-neutral-800',
}

export function Tooltip({
  content,
  placement = 'top',
  children,
  className = '',
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function show() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setVisible(true)
  }

  function hide() {
    timeoutRef.current = setTimeout(() => setVisible(false), 80)
  }

  function handleMouseEnter(_e: MouseEvent) { show() }
  function handleMouseLeave(_e: MouseEvent) { hide() }
  function handleFocus(_e: FocusEvent) { show() }
  function handleBlur(_e: FocusEvent) { hide() }

  return (
    <span
      className={['relative inline-flex', className].join(' ')}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {children}

      {visible && (
        <span
          role="tooltip"
          className={[
            'absolute z-50 pointer-events-none',
            'bg-neutral-800 text-white text-xs font-medium',
            'px-2.5 py-1.5 rounded-lg whitespace-nowrap max-w-[200px]',
            'shadow-lg',
            placementStyles[placement],
          ].join(' ')}
        >
          {content}
          {/* Arrow */}
          <span
            className={[
              'absolute w-0 h-0 border-4 border-transparent',
              arrowStyles[placement],
            ].join(' ')}
          />
        </span>
      )}
    </span>
  )
}
