import { makeStyles, shorthands, tokens } from '@fluentui/react-components'

// Fluent Menu 已接管弹层/选项样式，这里只保留无样式触发器按钮与危险项前景色。
export const useStyles = makeStyles({
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...shorthands.padding(0),
    ...shorthands.border(0),
    backgroundColor: 'transparent',
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer',
  },
  /** 危险操作项：图标与文字用红色（悬停底色沿用 Fluent 中性层） */
  danger: { color: tokens.colorPaletteRedForeground1 },
})
