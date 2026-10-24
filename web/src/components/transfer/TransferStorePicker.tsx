import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMySources, listFiles } from '../../api/sources'
import { Button } from '../ui/Button'
import { DialogWrap } from '../ui/Dialog'
import { Field } from '../ui/Field'
import { Select } from '../ui/Select'
import { formatBytes } from '../../utils/format'
import { useStyles } from '../../pages/TransferCenter.styles'

export function StoreBrowserDialog({ onAdd, onClose }: {
  onAdd: (sourceKey: string, paths: string[]) => Promise<void>
  onClose: () => void
}) {
  const css = useStyles()
  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources })
  const usable = sources.data ?? []
  const [sourceKey, setSourceKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const source = usable.find((item) => item.key === sourceKey)
  const [path, setPath] = useState('')
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const listing = useQuery({
    queryKey: ['store-browser', sourceKey, path],
    queryFn: () => listFiles(sourceKey, { path: '/' + path, page: 1, pageSize: 200 }),
    enabled: sourceKey !== '',
  })

  const entries = listing.data?.items ?? []
  const selected = useMemo(() => Object.keys(checked).filter((key) => checked[key]), [checked])
  function open(entryPath: string, type: string) {
    if (type === 'dir') {
      setPath(entryPath)
      setChecked({})
    }
  }
  function breadcrumb(): ReactNode {
    const segments = path.split('/').filter(Boolean)
    return (
      <div className={css.breadcrumb}>
        <button type="button" disabled={busy} onClick={() => { setPath(''); setChecked({}) }}>{source?.name ?? '存储源'}</button>
        {segments.map((segment, index) => (
          <button
            key={segment}
            type="button"
            disabled={busy}
            onClick={() => {
              setPath(segments.slice(0, index + 1).join('/'))
              setChecked({})
            }}
          >
            / {segment}
          </button>
        ))}
      </div>
    )
  }

  return (
    <DialogWrap
      open
      onOpenChange={(open) => { if (!open && !busy) onClose() }}
      title="从已有文件添加"
      description="勾选文件或文件夹；复制进发件包的是快照，之后修改原文件不影响交付内容。"
      wide
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>取消</Button>
          <Button
            disabled={busy || selected.length === 0}
            onClick={() => {
              if (!sourceKey) return
              setBusy(true); setError('')
              void onAdd(sourceKey, selected).catch((cause) => setError(cause instanceof Error ? cause.message : '添加失败，请重试。')).finally(() => setBusy(false))
            }}
          >
            添加所选（{selected.length}）
          </Button>
        </>
      }
    >
      <Field label="存储源">
        <Select
          value={sourceKey ? String(usable.findIndex((item) => item.key === sourceKey)) : ''}
          disabled={busy}
          onValueChange={(index) => {
            setSourceKey(usable[Number(index)]?.key ?? '')
            setPath('')
            setChecked({})
          }}
          options={usable.map((item, index) => ({ value: String(index), label: item.name }))}
          ariaLabel="选择存储源"
          placeholder="选择存储源…"
        />
      </Field>
      {error ? <p role="alert">{error}</p> : null}
      {sources.isError || listing.isError ? <p role="alert">文件列表加载失败，请重新选择存储源或目录。</p> : null}
      {sourceKey ? breadcrumb() : null}
      <div className={css.browserList} role="listbox" aria-label="文件列表">
        {sourceKey && listing.isPending ? <div className={css.browserEmpty}>加载中…</div> : null}
        {listing.isSuccess && entries.length === 0 ? <div className={css.browserEmpty}>目录为空</div> : null}
        {entries.map((entry) => {
          const entryPath = path ? `${path}/${entry.name}` : entry.name
          return (
            <label key={entry.name} className={css.browserRow}>
              <input
                type="checkbox"
                disabled={busy}
                checked={checked[entryPath] ?? false}
                onChange={(event) => setChecked((prev) => ({ ...prev, [entryPath]: event.target.checked }))}
              />
              {entry.type === 'dir' ? (
                <button type="button" disabled={busy} className={css.browserDirButton} onClick={() => open(entryPath, entry.type)}>
                  {entry.name}/
                </button>
              ) : (
                <span className={css.browserName}>{entry.name} <small>{formatBytes(entry.size)}</small></span>
              )}
            </label>
          )
        })}
      </div>
    </DialogWrap>
  )
}
