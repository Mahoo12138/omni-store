import { Tooltip as BaseTooltip } from '@base-ui-components/react/tooltip'
import type { ReactNode } from 'react'
import * as css from './Tooltip.css'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
}

/** Base UI Tooltip 包装：触发器保持可聚焦，适合包裹 disabled 控件。 */
export function Tooltip({ content, children }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger
        render={<span className={css.trigger} tabIndex={0} />}
      >
        {children}
      </BaseTooltip.Trigger>
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side="top" align="end" sideOffset={8}>
          <BaseTooltip.Popup className={css.popup} role="tooltip">
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  )
}
