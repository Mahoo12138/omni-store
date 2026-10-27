import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiRequestError } from '../api/client'
import { fetchMyFavorites, removeFavorite } from '../api/favorites'
import { downloadFileUrl } from '../api/sources'
import { AppFrame } from '../components/shell/AppFrame'
import { PageHeader } from '../components/shell/PageHeader'
import { StateView } from '../components/shell/StateView'
import { Button } from '../components/ui/Button'
import { ExternalLinkButton } from '../components/ui/LinkButton'
import { IconDownload, IconFile, IconFolder, IconStar } from '../components/ui/Icon'
import { formatBytes, formatDate } from '../utils/format'
import { useStyles } from './Favorites.styles'

export function FavoritesPage() {
  const css = useStyles()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const favorites = useQuery({ queryKey: ['my-favorites'], queryFn: fetchMyFavorites })
  const remove = useMutation({
    mutationFn: removeFavorite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-favorites'] }),
  })
  const items = favorites.data ?? []

  function open(item: { source_key: string; path: string; type: 'file' | 'dir' }) {
    const target = item.type === 'dir'
      ? `/${item.path}`
      : item.path.includes('/') ? `/${item.path.slice(0, item.path.lastIndexOf('/'))}` : '/'
    navigate({
      to: '/app/sources/$sourceKey',
      params: { sourceKey: item.source_key },
      search: { path: target, page: 1 },
    })
  }

  return (
    <AppFrame title="收藏">
      <PageHeader
        eyebrow="个人空间"
        title="收藏"
        description="收藏常用文件和文件夹，跨存储源快速返回；收藏不会复制或移动原文件。"
      />

      {favorites.isPending ? (
        <StateView kind="pending" title="正在读取收藏…" />
      ) : favorites.isError ? (
        <StateView
          kind="error"
          title="收藏加载失败"
          description={favorites.error instanceof ApiRequestError ? favorites.error.message : '请检查连接后重试。'}
          action={<Button variant="secondary" onClick={() => favorites.refetch()}>重新加载</Button>}
        />
      ) : items.length === 0 ? (
        <StateView
          kind="empty"
          icon={<IconStar size={22} />}
          title="还没有收藏"
          description="在文件列表或网格中点按星标，即可收藏文件或文件夹。"
          action={<Button variant="secondary" onClick={() => navigate({ to: '/app' })}>前往文件</Button>}
        />
      ) : (
        <section className={css.panel} aria-label="收藏列表">
          <div className={css.panelHeader}>
            <h2>已收藏</h2>
            <span>{items.length} 项</span>
          </div>
          <div className={css.list}>
            {items.map((item) => (
              <article className={css.row} key={item.id}>
                <span className={item.type === 'dir' ? css.folderIcon : css.fileIcon}>
                  {item.type === 'dir' ? <IconFolder size={19} /> : <IconFile size={19} />}
                </span>
                <div className={css.identity}>
                  <button type="button" className={css.name} onClick={() => open(item)}>{item.name}</button>
                  <button type="button" className={css.location} onClick={() => open({ ...item, type: 'file' })}>
                    {item.source_name} · /{item.path}
                  </button>
                </div>
                <div className={css.metadata}>
                  <span>{item.type === 'dir' ? '文件夹' : formatBytes(item.size)}</span>
                  <time dateTime={item.created_at}>收藏于 {formatDate(item.created_at)}</time>
                </div>
                {item.type === 'file' ? (
                  <ExternalLinkButton
                    size="large"
                    variant="ghost"
                    href={downloadFileUrl(item.source_key, `/${item.path}`)}
                    download={item.name}
                    aria-label={`下载 ${item.name}`}
                    title={`下载 ${item.name}`}
                    icon={<IconDownload size={16} />}
                  />
                ) : <span className={css.actionPlaceholder} aria-hidden="true" />}
                <Button
                  size="large"
                  variant="dangerGhost"
                  aria-label={`取消收藏 ${item.name}`}
                  title="取消收藏"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(item.id)}
                  icon={<IconStar size={16} />}
                />
              </article>
            ))}
          </div>
        </section>
      )}
    </AppFrame>
  )
}
