import { useRef, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiRequestError } from '../api/client'
import {
  lookupCollection,
  submitToCollection,
  unlockCollection,
  type CollectionPublicInfo,
} from '../api/transfers'
import { PublicShell } from '../components/layout/PublicShell'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { formatBytes } from '../utils/format'
import { IconCloud, IconDownload, IconKey } from '../components/ui/Icon'
import * as css from './PublicPickup.css'

// 公开收集提交页（2.0 Phase 6）：/collect/{publicKey}。
// 匿名 upload-only：访客只能提交自己的文件，无法查看他人提交。

export function PublicCollectPage() {
  const { publicKey } = useParams({ from: '/collect/$publicKey' })
  const [token, setToken] = useState<string | null>(null)

  const info = useQuery({
    queryKey: ['public-collection', publicKey],
    queryFn: () => lookupCollection(publicKey),
    retry: false,
  })

  if (info.isPending) {
    return <PublicShell><div className={css.state}>正在加载收集任务…</div></PublicShell>
  }
  if (info.isError || !info.data) {
    // 服务端消息已区分过期/关闭/撤销，直接展示。
    const message = info.error instanceof ApiRequestError ? info.error.message : '收集任务加载失败'
    const hint = info.error instanceof ApiRequestError && info.error.code === 'TRANSFER_EXPIRED'
      ? '无法再提交，请联系收集者。'
      : '链接可能输入有误，或任务已被撤销/关闭。请联系收集者确认。'
    return <StatusView title={message} hint={hint} />
  }
  if (!token) {
    return (
      <PublicShell>
        <div className={css.cardWrap}>
          <section className={css.card}>
            <span className={css.cardIcon}><IconKey size={28} /></span>
            <h1>提交文件</h1>
            <p>输入收集者提供的收件码{info.data.has_password ? '与访问密码' : ''}，向「{info.data.title || '收集任务'}」提交文件。</p>
            <CollectUnlockCard publicKey={publicKey} hasPassword={info.data.has_password} onUnlocked={setToken} />
          </section>
        </div>
      </PublicShell>
    )
  }
  return <CollectForm publicKey={publicKey} token={token} info={info.data} />
}

function StatusView({ title, hint }: { title: string; hint: string }) {
  return (
    <PublicShell>
      <div className={css.state}>
        <span className={css.stateIcon}><IconCloud size={34} /></span>
        <h1>{title}</h1>
        <p>{hint}</p>
      </div>
    </PublicShell>
  )
}

function CollectUnlockCard({ publicKey, hasPassword, onUnlocked }: {
  publicKey: string
  hasPassword: boolean
  onUnlocked: (token: string) => void
}) {
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const unlock = useMutation({
    mutationFn: () => unlockCollection(publicKey, code.trim(), password),
    onSuccess: (data) => onUnlocked(data.token),
    onError: (cause) => setError(cause instanceof ApiRequestError ? cause.message : '验证失败，请重试。'),
  })
  return (
    <form
      className={css.form}
      onSubmit={(event) => { event.preventDefault(); setError(''); unlock.mutate() }}
    >
      <Input
        autoFocus
        value={code}
        onChange={(event) => setCode(event.target.value.toUpperCase())}
        placeholder="收件码"
        aria-label="收件码"
        maxLength={8}
      />
      {hasPassword ? (
        <Input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="访问密码"
          aria-label="收集任务访问密码"
        />
      ) : null}
      {error ? <span className={css.error} role="alert">{error}</span> : null}
      <Button type="submit" disabled={unlock.isPending || !code.trim()}>
        {unlock.isPending ? '验证中…' : '继续提交'}
      </Button>
    </form>
  )
}

function CollectForm({ publicKey, token, info }: {
  publicKey: string
  token: string
  info: CollectionPublicInfo
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<File[]>([])
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ count: number } | null>(null)

  const submit = useMutation({
    mutationFn: () => submitToCollection(publicKey, token, {
      name: name.trim(),
      note: note.trim(),
      files: picked.map((file) => ({
        relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
        file,
      })),
    }),
    onSuccess: (submission) => {
      setDone({ count: submission.file_count })
      setPicked([])
    },
    onError: (cause) => setError(cause instanceof ApiRequestError ? cause.message : '提交失败，请重试。'),
  })

  if (done) {
    return (
      <PublicShell>
        <div className={css.state}>
          <span className={css.stateIcon}><IconDownload size={34} /></span>
          <h1>提交成功</h1>
          <p>已收到你提交的 {done.count} 个文件。可以关闭本页面，或继续提交更多文件。</p>
          <Button variant="secondary" onClick={() => setDone(null)}>再提交一批</Button>
        </div>
      </PublicShell>
    )
  }

  const maxSizeHint = info.max_file_size ? `单文件不超过 ${formatBytes(info.max_file_size)}` : null
  const extHint = info.allowed_exts.length > 0 ? `仅支持：${info.allowed_exts.join('、')}` : null

  return (
    <PublicShell>
      <div className={css.content}>
        <header className={css.header}>
          <h1>{info.title || '提交文件'}</h1>
          {info.description ? <p>{info.description}</p> : null}
          {maxSizeHint || extHint ? (
            <p>
              {maxSizeHint ? <>{maxSizeHint}<br /></> : null}
              {extHint}
            </p>
          ) : null}
        </header>
        <form
          className={css.form}
          onSubmit={(event) => {
            event.preventDefault()
            setError('')
            if (picked.length === 0) {
              setError('请选择要提交的文件')
              return
            }
            submit.mutate()
          }}
        >
          {info.require_name ? (
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="你的姓名" aria-label="提交者姓名" required />
          ) : null}
          {info.require_note ? (
            <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注" aria-label="提交备注" required />
          ) : null}
          <input
            ref={fileInput}
            className={css.hiddenInput}
            type="file"
            multiple
            aria-label="选择要提交的文件"
            data-testid="collect-upload-files"
            onChange={(event) => {
              setPicked(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
          <div className={css.filePickRow}>
            <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()}>
              选择文件
            </Button>
            <span className={css.pickedCount}>{picked.length > 0 ? `已选 ${picked.length} 个文件` : '尚未选择文件'}</span>
          </div>
          {picked.length > 0 ? (
            <ul className={css.fileList}>
              {picked.map((file, index) => (
                <li key={`${file.name}-${index}`} className={css.fileRow}>
                  <span className={css.filePath}>{(file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name}</span>
                  <span className={css.fileSize}>{formatBytes(file.size)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {error ? <div role="alert" className={css.error}>{error}</div> : null}
          <Button type="submit" disabled={submit.isPending || picked.length === 0}>
            {submit.isPending ? '提交中…' : '提交文件'}
          </Button>
        </form>
      </div>
    </PublicShell>
  )
}
