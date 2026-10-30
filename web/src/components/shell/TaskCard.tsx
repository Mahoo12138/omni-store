import type { ReactNode } from 'react'
import { ProgressBar } from '@fluentui/react-components'
import { useStyles } from './TaskCard.styles'

// 常驻任务卡（上传 / 粘贴 / 批量删除）的统一外观。
// 三处任务原本各写一套卡片与 ErrorList；这里只保留「状态 + 进度 + 失败项 + 动作」。
export interface TaskCardAction {
  label: string
  onClick: () => void
}

export function TaskCard({
  label,
  title,
  meta,
  percent,
  progressLabel,
  errors,
  actions,
  onClose,
}: {
  /** role=status 的可访问名（e2e 与读屏都依赖它） */
  label: string
  title: ReactNode
  /** 标题下的若干行说明 */
  meta?: string[]
  /** 0–100 */
  percent: number
  progressLabel: string
  errors?: string[]
  actions?: TaskCardAction[]
  onClose?: () => void
}) {
  const css = useStyles()
  return (
    <section className={css.root} role="status" aria-live="polite" aria-label={label}>
      <div className={css.header}>
        <div className={css.titleGroup}>
          <strong>{title}</strong>
          {meta?.map((line) => (
            <span key={line} className={css.meta}>{line}</span>
          ))}
        </div>
        {onClose ? (
          <button className={css.close} type="button" onClick={onClose}>关闭</button>
        ) : null}
      </div>
      <ProgressBar aria-label={`${progressLabel} ${percent}%`} value={percent / 100} />
      {errors && errors.length > 0 ? (
        <ul className={css.errors}>
          {errors.slice(0, 3).map((error) => <li key={error}>{error}</li>)}
          {errors.length > 3 ? <li>还有 {errors.length - 3} 个失败项</li> : null}
        </ul>
      ) : null}
      {actions && actions.length > 0 ? (
        <div className={css.actions}>
          {actions.map((action) => (
            <button key={action.label} type="button" className={css.action} onClick={action.onClick}>
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
