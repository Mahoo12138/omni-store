import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { changePassword, updateProfile } from '../api/admin'
import { fetchTokenStatus, resetToken } from '../api/imagebed'
import { fetchMe } from '../api/auth'
import { ApiRequestError } from '../api/client'
import { AppShell } from '../components/layout/AppShell'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { formatDate } from '../utils/format'
import * as css from './ImageBed.css'

export function SettingsPage() {
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const tokens = useQuery({ queryKey: ['token-status'], queryFn: fetchTokenStatus })

  const [displayName, setDisplayName] = useState('')
  const [profileMsg, setProfileMsg] = useState('')
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const [newTokens, setNewTokens] = useState<Record<string, string>>({})

  const profileMut = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      setProfileMsg('已保存')
      queryClient.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (err) => setProfileMsg(err instanceof ApiRequestError ? err.message : '保存失败'),
  })

  const pwdMut = useMutation({
    mutationFn: ({ o, n }: { o: string; n: string }) => changePassword(o, n),
    onSuccess: () => {
      setPwdMsg('密码已修改')
      setOldPwd('')
      setNewPwd('')
    },
    onError: (err) => setPwdMsg(err instanceof ApiRequestError ? err.message : '修改失败'),
  })

  const resetMut = useMutation({
    mutationFn: resetToken,
    onSuccess: (data, type) => {
      setNewTokens((prev) => ({ ...prev, [type]: data.token }))
      queryClient.invalidateQueries({ queryKey: ['token-status'] })
    },
    onError: () => alert('重置失败'),
  })

  function onSaveProfile(e: FormEvent) {
    e.preventDefault()
    if (displayName.trim()) profileMut.mutate(displayName.trim())
  }

  function onChangePassword(e: FormEvent) {
    e.preventDefault()
    pwdMut.mutate({ o: oldPwd, n: newPwd })
  }

  function tokenSection(type: 'webdav' | 'image-bed', title: string, hint: string) {
    const key = type === 'webdav' ? 'webdav' : 'image_bed'
    const status = tokens.data?.[key]
    return (
      <section className={css.section}>
        <h2 className={css.sectionTitle}>{title}</h2>
        <p className={css.label}>{hint}</p>
        {status?.exists ? (
          <p className={css.label}>
            已生成于 {status.created_at ? formatDate(status.created_at) : '-'}
            {status.last_used_at ? `，最近使用 ${formatDate(status.last_used_at)}` : '，从未使用'}
          </p>
        ) : (
          <p className={css.label}>尚未生成。</p>
        )}
        {newTokens[type] && (
          <>
            <p className={css.error}>新 Token 只显示这一次，请立即保存：</p>
            <div className={css.row}>
              <textarea readOnly className={css.tokenBox} rows={2} value={newTokens[type]} />
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(newTokens[type])}>
                复制
              </Button>
            </div>
          </>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            if (!status?.exists || confirm('重置后旧 Token 立即失效，确定继续吗？')) {
              resetMut.mutate(type)
            }
          }}
        >
          {status?.exists ? '重置 Token' : '生成 Token'}
        </Button>
      </section>
    )
  }

  return (
    <AppShell title="设置">
      <section className={css.section}>
        <h2 className={css.sectionTitle}>个人资料</h2>
        <p className={css.label}>用户名：{me.data?.username}（不可修改）</p>
        <form className={css.row} onSubmit={onSaveProfile}>
          <Input
            placeholder={me.data?.display_name ?? '显示名'}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Button type="submit" disabled={profileMut.isPending}>
            保存显示名
          </Button>
          {profileMsg && <span className={css.label}>{profileMsg}</span>}
        </form>
      </section>

      <section className={css.section}>
        <h2 className={css.sectionTitle}>修改密码</h2>
        <form onSubmit={onChangePassword}>
          <div className={css.row}>
            <Input
              type="password"
              placeholder="旧密码"
              value={oldPwd}
              onChange={(e) => setOldPwd(e.target.value)}
              autoComplete="current-password"
              required
            />
            <Input
              type="password"
              placeholder="新密码（至少 8 位）"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              autoComplete="new-password"
              required
            />
            <Button type="submit" disabled={pwdMut.isPending}>
              修改密码
            </Button>
          </div>
          {pwdMsg && <p className={css.label}>{pwdMsg}</p>}
        </form>
      </section>

      {tokenSection('webdav', 'WebDAV Token', 'WebDAV 挂载地址为 /dav，用户名为登录名，密码为此 Token。')}
      {tokenSection('image-bed', '图床 API Token', 'PicGo 上传接口 POST /api/v1/image-bed/upload，Bearer Token，只能用于图床上传。')}
    </AppShell>
  )
}
