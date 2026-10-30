import { useSharedStyles } from './shared.styles'

export function quotaGiBInputValue(bytes: number): string {
  if (bytes <= 0) return '0'
  return String(Number((bytes / (1024 ** 3)).toFixed(6)))
}

export function HorizontalDataRegion({
  name,
  busy,
  children,
}: {
  name: string
  busy?: boolean
  children: React.ReactNode
}) {
  const css = useSharedStyles()
  return (
    <div className={css.dataScrollFrame}>
      <div
        className={css.dataScroll}
        role="region"
        tabIndex={0}
        aria-label={name}
        aria-busy={busy}
      >
        {children}
      </div>
    </div>
  )
}
