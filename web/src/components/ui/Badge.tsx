import type { ReactNode } from 'react'
import * as css from './Badge.css'

export function Badge({
  color,
  children,
}: {
  color: keyof typeof css.badge
  children: ReactNode
}) {
  return <span className={css.badge[color]}>{children}</span>
}
