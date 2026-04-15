import type { HTMLAttributes, ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Visual padding preset */
  padding?: 'none' | 'sm' | 'md' | 'lg'
  /** Lift the card on hover */
  hoverable?: boolean
  children: ReactNode
}

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
}

export function Card({
  padding = 'md',
  hoverable = false,
  className = '',
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={[
        'bg-white rounded-2xl border border-neutral-200 shadow-card',
        hoverable &&
          'transition-shadow duration-200 hover:shadow-card-hover cursor-pointer',
        paddingStyles[padding],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}

export interface CardHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function CardHeader({
  title,
  description,
  action,
  className = '',
}: CardHeaderProps) {
  return (
    <div className={['flex items-start justify-between gap-4 mb-4', className].join(' ')}>
      <div>
        <h3 className="font-semibold text-neutral-900">{title}</h3>
        {description && (
          <p className="mt-0.5 text-sm text-neutral-500">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export interface CardDividerProps {
  className?: string
}

export function CardDivider({ className = '' }: CardDividerProps) {
  return <hr className={['border-neutral-100 my-4', className].join(' ')} />
}
