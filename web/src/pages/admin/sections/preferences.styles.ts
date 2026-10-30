import { useSharedStyles } from '../shared.styles'

// 这一分区只使用共享骨架样式。
export function useStyles() {
  return useSharedStyles()
}
