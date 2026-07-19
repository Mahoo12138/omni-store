import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ApiRequestError } from '../api/client'
import { fetchAuthStatus } from '../api/auth'
import { fetchAnonymousStatus, uploadAnonymousImage } from '../api/imagebed'
import { PublicShell } from '../components/layout/PublicShell'
import {
  IconCheck,
  IconChevronLeft,
  IconCopy,
  IconExternalLink,
  IconImage,
  IconRefresh,
  IconUpload,
  LogoMark,
} from '../components/ui/Icon'
import * as css from './AnonymousUpload.css'

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_CONCURRENT_UPLOADS = 3

type UploadState = 'queued' | 'uploading' | 'success' | 'error'
type LinkFormat = 'direct' | 'markdown' | 'html' | 'bbcode'

interface UploadItem {
  id: string
  file: File
  previewUrl: string
  state: UploadState
  url?: string
  error?: string
}

interface LinkOption {
  key: LinkFormat
  label: string
  value: string
}

function createUploadId(file: File, index: number) {
  const randomPart = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
  return `${randomPart}-${index}-${file.name}-${file.lastModified}`
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function cleanAltText(filename: string) {
  return filename.replace(/[\[\]<>"']/g, '').trim() || 'image'
}

function getLinkOptions(item: UploadItem): LinkOption[] {
  if (!item.url) return []
  const alt = cleanAltText(item.file.name)
  return [
    { key: 'direct', label: '直链', value: item.url },
    { key: 'markdown', label: 'Markdown', value: `![${alt}](${item.url})` },
    { key: 'html', label: 'HTML', value: `<img src="${item.url}" alt="${alt}" />` },
    { key: 'bbcode', label: 'BBCode', value: `[img]${item.url}[/img]` },
  ]
}

async function writeClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('copy failed')
}

function ResultLinks({
  item,
  copiedKey,
  onCopy,
}: {
  item: UploadItem
  copiedKey: string
  onCopy: (value: string, key: string) => void
}) {
  return (
    <div className={css.linkGrid}>
      {getLinkOptions(item).map((option) => {
        const key = `${item.id}-${option.key}`
        const copied = copiedKey === key
        return (
          <div className={css.linkField} key={option.key}>
            <label htmlFor={key}>{option.label}</label>
            <div className={css.linkControl}>
              <input id={key} value={option.value} readOnly onFocus={(event) => event.currentTarget.select()} />
              <button
                type="button"
                className={copied ? css.copyButtonSuccess : css.copyButton}
                onClick={() => onCopy(option.value, key)}
                aria-label={`复制${option.label}`}
              >
                {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
                <span>{copied ? '已复制' : '复制'}</span>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function UploadResult({
  item,
  copiedKey,
  onCopy,
}: {
  item: UploadItem
  copiedKey: string
  onCopy: (value: string, key: string) => void
}) {
  const isPending = item.state === 'queued' || item.state === 'uploading'

  return (
    <article className={css.resultItem} aria-busy={isPending}>
      <div className={css.resultSummary}>
        {item.previewUrl ? (
          <img className={css.preview} src={item.previewUrl} alt={`${item.file.name} 预览`} />
        ) : (
          <span className={css.previewPlaceholder} aria-hidden="true"><IconImage size={22} /></span>
        )}
        <div className={css.fileMeta}>
          <h3 title={item.file.name}>{item.file.name}</h3>
          <p>{formatFileSize(item.file.size)}</p>
          {isPending && (
            <span className={css.statusUploading}>
              <span className={css.spinner} aria-hidden="true" />
              {item.state === 'queued' ? '等待上传' : '正在上传'}
            </span>
          )}
          {item.state === 'success' && (
            <span className={css.statusSuccess}>
              <IconCheck size={14} /> 上传完成
            </span>
          )}
          {item.state === 'error' && <span className={css.statusError}>{item.error}</span>}
        </div>
        {item.url && (
          <a
            className={css.previewLink}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`在新窗口查看 ${item.file.name}`}
          >
            查看图片 <IconExternalLink size={14} />
          </a>
        )}
      </div>
      {isPending && <div className={css.progressTrack} aria-hidden="true"><span /></div>}
      {item.state === 'success' && <ResultLinks item={item} copiedKey={copiedKey} onCopy={onCopy} />}
    </article>
  )
}

export function AnonymousUploadPage() {
  const status = useQuery({
    queryKey: ['anon-status'],
    queryFn: fetchAnonymousStatus,
    retry: false,
  })
  const authStatus = useQuery({
    queryKey: ['auth-status'],
    queryFn: fetchAuthStatus,
    retry: false,
    staleTime: 60_000,
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlsRef = useRef(new Set<string>())
  const copyTimerRef = useRef<number | undefined>(undefined)
  const uploadQueueRef = useRef<UploadItem[]>([])
  const activeUploadCountRef = useRef(0)
  const [items, setItems] = useState<UploadItem[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [copiedKey, setCopiedKey] = useState('')
  const [copyError, setCopyError] = useState('')

  const enabled = status.data?.enabled === true
  const maxBytes = (status.data?.max_file_size_mb ?? 0) * 1024 * 1024
  const successItems = useMemo(() => items.filter((item) => item.state === 'success'), [items])
  const isUploading = items.some((item) => item.state === 'queued' || item.state === 'uploading')

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const pumpUploadQueue = useCallback(function pump() {
    while (activeUploadCountRef.current < MAX_CONCURRENT_UPLOADS && uploadQueueRef.current.length > 0) {
      const item = uploadQueueRef.current.shift()
      if (!item) return
      activeUploadCountRef.current += 1
      updateItem(item.id, { state: 'uploading' })
      void uploadAnonymousImage(item.file)
        .then((response) => updateItem(item.id, { state: 'success', url: response.url }))
        .catch((error) => {
          updateItem(item.id, {
            state: 'error',
            error: error instanceof ApiRequestError ? error.message : '上传失败，请稍后重试',
          })
        })
        .finally(() => {
          activeUploadCountRef.current -= 1
          pump()
        })
    }
  }, [updateItem])

  const addFiles = useCallback(
    (files: File[]) => {
      if (!enabled || files.length === 0) return

      const nextItems = files.map<UploadItem>((file, index) => {
        const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
        if (previewUrl) previewUrlsRef.current.add(previewUrl)
        let error = ''
        if (!ACCEPTED_TYPES.has(file.type)) {
          error = '仅支持 JPG、PNG、WebP 或 GIF 图片'
        } else if (file.size > maxBytes) {
          error = `图片超过 ${status.data?.max_file_size_mb} MB 上限`
        }
        return {
          id: createUploadId(file, index),
          file,
          previewUrl,
          state: error ? 'error' : 'queued',
          error: error || undefined,
        }
      })

      setItems((current) => [...nextItems, ...current])
      const validItems = nextItems.filter((item) => item.state === 'queued')
      if (validItems.length > 0) {
        uploadQueueRef.current.push(...validItems)
        pumpUploadQueue()
      }
    },
    [enabled, maxBytes, pumpUploadQueue, status.data?.max_file_size_mb],
  )

  useEffect(() => {
    function handleDocumentPaste(event: globalThis.ClipboardEvent) {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
      if (files.length > 0) {
        event.preventDefault()
        addFiles(files)
      }
    }
    document.addEventListener('paste', handleDocumentPaste)
    return () => document.removeEventListener('paste', handleDocumentPaste)
  }, [addFiles])

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    }
  }, [])

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    addFiles(Array.from(event.dataTransfer.files))
  }

  async function copyValue(value: string, key: string) {
    setCopyError('')
    try {
      await writeClipboard(value)
      setCopiedKey(key)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopiedKey(''), 1800)
    } catch {
      setCopyError('无法访问剪贴板，请选中链接后手动复制')
    }
  }

  function copyAllDirectLinks() {
    const value = successItems.map((item) => item.url).filter(Boolean).join('\n')
    if (value) void copyValue(value, 'all-direct')
  }

  return (
    <PublicShell showHeader={false}>
      <section className={css.page}>
        <header className={css.hero}>
          <div className={css.masthead}>
            <Link to="/" className={css.brand} aria-label="返回 OmniStore 公开网盘">
              <LogoMark size={32} />
              <span>
                <strong>OmniStore</strong>
                <small>IMAGE BED</small>
              </span>
            </Link>
            <div className={css.utilityLinks}>
              <Link to="/" className={css.backLink}>
                <IconChevronLeft size={16} />
                公开网盘
              </Link>
              {authStatus.isPending ? (
                <span className={css.authPlaceholder} aria-label="正在检查登录状态" />
              ) : authStatus.data?.authenticated ? (
                <Link to="/app" className={css.authLink}>进入工作台</Link>
              ) : (
                <Link to="/login" className={css.authLink}>管理登录</Link>
              )}
            </div>
          </div>

          <div className={css.heroBody}>
            <div className={css.heroCopy}>
              <span>公开匿名图片托管</span>
              <h1>匿名图床</h1>
              <p>把图片放进来，立即获取适用于网页、论坛和文档的链接。</p>
            </div>
            <div className={css.serviceBadge} aria-live="polite">
              <span
                className={
                  status.isPending
                    ? css.serviceDotPending
                    : status.isError
                      ? css.serviceDotError
                      : enabled
                        ? css.serviceDotEnabled
                        : css.serviceDotDisabled
                }
                aria-hidden="true"
              />
              <span>
                <small>上传服务</small>
                <strong>
                  {status.isPending
                    ? '正在检查'
                    : status.isError
                      ? '状态未知'
                      : enabled
                        ? '可以使用'
                        : '暂未开放'}
                </strong>
              </span>
            </div>
          </div>
        </header>

        <div className={css.workbenchStage}>
          {status.isPending && (
            <div className={css.workbench} aria-label="正在读取上传服务状态">
              <div className={css.loadingState}>
                <span className={css.loadingLineWide} />
                <span className={css.loadingLine} />
              </div>
            </div>
          )}

          {status.isError && (
            <div className={css.serviceState} role="alert">
              <span className={css.serviceIcon}><IconRefresh size={24} /></span>
              <div>
                <h2>暂时无法读取上传服务</h2>
                <p>请检查网络连接后重试。</p>
              </div>
              <button type="button" onClick={() => status.refetch()}>
                <IconRefresh size={16} /> 重新检查
              </button>
            </div>
          )}

          {status.isSuccess && !enabled && (
            <div className={css.serviceState}>
              <span className={css.serviceIcon}><IconImage size={24} /></span>
              <div>
                <h2>匿名上传暂未开放</h2>
                <p>管理员开启公共图床后，这里就可以直接上传图片。</p>
              </div>
            </div>
          )}

          {status.isSuccess && enabled && (
            <div className={css.workbench}>
              <input
                ref={fileInputRef}
                className={css.visuallyHidden}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={(event) => {
                  addFiles(Array.from(event.currentTarget.files ?? []))
                  event.currentTarget.value = ''
                }}
              />
              <div
                className={dragActive ? css.dropZoneActive : css.dropZone}
                role="button"
                tabIndex={0}
                aria-label="选择或拖入要上传的图片"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
                onDragEnter={(event) => {
                  event.preventDefault()
                  setDragActive(true)
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false)
                }}
                onDrop={handleDrop}
              >
                <div className={css.dropAction}>
                  <span className={css.uploadIcon}><IconUpload size={28} /></span>
                  <div>
                    <h2>{dragActive ? '松开即可上传' : '拖拽图片，或点击选择'}</h2>
                    <p>也可以在页面任意位置粘贴剪贴板图片</p>
                  </div>
                </div>
                <div className={css.dropMeta}>
                  <span>JPG · PNG · WebP · GIF</span>
                  <span>单张最大 {status.data.max_file_size_mb} MB</span>
                  <span>最多 3 张并行处理</span>
                </div>
              </div>

              {items.length > 0 && (
                <div className={css.results}>
                  <div className={css.resultsHeader}>
                    <div>
                      <h2>本次上传</h2>
                      <p>
                        {isUploading ? '图片正在上传，完成后即可复制链接' : `已处理 ${items.length} 张图片`}
                      </p>
                    </div>
                    <div className={css.resultActions}>
                      <button type="button" className={css.secondaryButton} onClick={() => fileInputRef.current?.click()}>
                        <IconUpload size={16} /> 继续上传
                      </button>
                      <button
                        type="button"
                        className={css.primaryButton}
                        disabled={successItems.length === 0}
                        onClick={copyAllDirectLinks}
                      >
                        {copiedKey === 'all-direct' ? <IconCheck size={16} /> : <IconCopy size={16} />}
                        {copiedKey === 'all-direct' ? '已复制全部直链' : '复制全部直链'}
                      </button>
                    </div>
                  </div>
                  {copyError && <p className={css.copyError} role="alert">{copyError}</p>}
                  <div className={css.resultList}>
                    {items.map((item) => (
                      <UploadResult key={item.id} item={item} copiedKey={copiedKey} onCopy={copyValue} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <p className={css.privacyNote}>无需登录 · 不保留上传历史 · 请自行保存需要的链接</p>
        <div className={css.srStatus} aria-live="polite">{copyError || (copiedKey ? '链接已复制' : '')}</div>
      </section>
    </PublicShell>
  )
}
