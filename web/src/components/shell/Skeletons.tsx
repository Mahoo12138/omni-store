import { Skeleton, SkeletonItem } from '@fluentui/react-components'
import { useShellStyles } from './shell.styles'

// 加载骨架。语义上不含文本，父级 StateView 负责 role="status" / aria-busy。
export function SkeletonRows({ count = 4 }: { count?: number }) {
  const css = useShellStyles()
  return (
    <div className={css.skeletonRows} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} animation="wave" appearance="translucent" className={css.skeletonRow}>
          <SkeletonItem shape="rectangle" className={css.skeletonLine} />
          <SkeletonItem shape="rectangle" className={css.skeletonLine} />
        </Skeleton>
      ))}
    </div>
  )
}

export function SkeletonGrid({ count = 8 }: { count?: number }) {
  const css = useShellStyles()
  return (
    <div className={css.skeletonGrid} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} animation="wave" appearance="translucent" className={css.skeletonCard}>
          <SkeletonItem shape="rectangle" className={css.skeletonThumb} />
          <SkeletonItem shape="rectangle" className={css.skeletonLine} />
        </Skeleton>
      ))}
    </div>
  )
}
