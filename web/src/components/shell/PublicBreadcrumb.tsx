import { makeStyles, shorthands, tokens } from '@fluentui/react-components'
import { IconHome } from '../ui/Icon'

// 公开网盘的面包屑。onNavigate 传相对路径（不含 /public 前缀），空串代表根目录——
// 它是状态回调而不是 URL 跳转，所以用按钮而非 Fluent Breadcrumb。
const useStyles = makeStyles({
  breadcrumb: {
  'display': 'flex',
  'alignItems': 'center',
  'flexWrap': 'wrap',
  'gap': tokens.spacingHorizontalXXS,
  'minWidth': '0px',
  'fontSize': tokens.fontSizeBase300,
  'color': tokens.colorNeutralForeground2,
  },
  home: {
  'display': 'inline-flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  'width': '32px',
  'height': '32px',
  ...shorthands.padding('0px'),
  ...shorthands.border('0px'),
  ...shorthands.borderRadius(tokens.borderRadiusMedium),
  'backgroundColor': 'transparent',
  'color': tokens.colorNeutralForeground2,
  'cursor': 'pointer',
  '&:hover': {
    'backgroundColor': tokens.colorNeutralBackground1Hover,
    'color': tokens.colorNeutralForeground1,
  },
  '&:focus-visible': {
    'outline': `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
    'outlineOffset': '2px',
  },
  },
  link: {
  ...shorthands.border('0px'),
  ...shorthands.padding(tokens.spacingVerticalXXS, tokens.spacingHorizontalXS),
  ...shorthands.borderRadius(tokens.borderRadiusSmall),
  'backgroundColor': 'transparent',
  'color': tokens.colorBrandForeground1,
  'font': 'inherit',
  'cursor': 'pointer',
  'maxWidth': '18ch',
  ...shorthands.overflow('hidden'),
  'textOverflow': 'ellipsis',
  'whiteSpace': 'nowrap',
  '&:hover': {
    'textDecoration': 'underline',
  },
  '&:focus-visible': {
    'outline': `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
    'outlineOffset': '1px',
  },
  },
  group: {
  'display': 'inline-flex',
  'alignItems': 'center',
  'gap': tokens.spacingHorizontalXXS,
  'minWidth': '0px',
  },
  separator: {
  'color': tokens.colorNeutralForeground4,
  },
  current: {
  ...shorthands.padding(tokens.spacingVerticalXXS, tokens.spacingHorizontalXS),
  'color': tokens.colorNeutralForeground1,
  'fontWeight': tokens.fontWeightSemibold,
  'maxWidth': '24ch',
  ...shorthands.overflow('hidden'),
  'textOverflow': 'ellipsis',
  'whiteSpace': 'nowrap',
  },
})

export function PublicBreadcrumb({
  segments,
  onNavigate,
  showHome = true,
  rootLabel = '根目录',
}: {
  segments: string[]
  onNavigate: (path: string) => void
  showHome?: boolean
  rootLabel?: string
}) {
  const css = useStyles()
  return (
    <nav className={css.breadcrumb} aria-label="当前位置">
      {showHome && (
        <button
          type="button"
          className={css.home}
          onClick={() => onNavigate('')}
          aria-label="返回公开网盘首页"
          title="返回公开网盘首页"
        >
          <IconHome size={18} />
        </button>
      )}
      {segments.length === 0 ? (
        <span className={css.group}>
          <span className={css.separator}>/</span>
          <span className={css.current}>{rootLabel}</span>
        </span>
      ) : (
        <>
          <button type="button" className={css.link} onClick={() => onNavigate('')}>
            公开网盘
          </button>
          {segments.map((seg, i) => {
            const isLast = i === segments.length - 1
            return (
              <span key={`${seg}-${i}`} className={css.group}>
                <span className={css.separator}>/</span>
                {isLast ? (
                  <span className={css.current}>{seg}</span>
                ) : (
                  <button
                    type="button"
                    className={css.link}
                    onClick={() => onNavigate(segments.slice(0, i + 1).join('/'))}
                  >
                    {seg}
                  </button>
                )}
              </span>
            )
          })}
        </>
      )}
    </nav>
  )
}
