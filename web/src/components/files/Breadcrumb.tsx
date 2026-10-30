import { useNavigate } from '@tanstack/react-router'
import type { UserSource } from '../../api/sources'
import { Menu, type MenuOption } from '../ui/Menu'
import { IconCheck, IconChevronDown, IconHome } from '../ui/Icon'
import { useStyles } from './Breadcrumb.styles'

// 文件页面包屑：存储源切换菜单 + 路径段。最后一段是当前位置，其余点击上跳。
export function Breadcrumb({
  sourceKey,
  sourceName,
  sources,
  currentPath,
  upOne,
}: {
  sourceKey: string
  sourceName: string
  sources: UserSource[]
  currentPath: string
  upOne: () => void
}) {
  const css = useStyles()
  const navigate = useNavigate()
  const segs = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean)
  const sourceItems: MenuOption[] = sources.map((source) => ({
    id: source.key,
    label: source.name,
    icon: source.key === sourceKey ? <IconCheck size={14} /> : undefined,
    current: source.key === sourceKey,
    onSelect: () => navigate({
      to: '/app/sources/$sourceKey',
      params: { sourceKey: source.key },
      search: { path: '/', page: 1 },
    }),
  }))
  return (
    <nav className={css.crumb} aria-label="面包屑">
      <Menu
        ariaLabel="存储源列表"
        triggerClassName={css.crumbSourceTrigger}
        trigger={<><IconHome size={14} /> 存储源列表 <IconChevronDown size={12} /></>}
        items={sourceItems}
      />
      <span className={css.crumbSep}>/</span>
      <span
        className={segs.length === 0 ? css.crumbCurrent : css.crumbLink}
        onClick={() => segs.length > 0 && upOne()}
      >
        {sourceName}
      </span>
      {segs.map((s, i) => {
        const isLast = i === segs.length - 1
        const upTo = '/' + segs.slice(0, i + 1).join('/')
        return (
          <span key={s + i} className={css.crumbSegment}>
            <span className={css.crumbSep}>/</span>
            {isLast ? (
              <span className={css.crumbCurrent}>{s}</span>
            ) : (
              <span className={css.crumbLink} onClick={() => navigate({
                to: '/app/sources/$sourceKey',
                params: { sourceKey },
                search: { path: upTo, page: 1 },
              })}>
                {s}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
