import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adminGetAnonymousSettings,
  adminListSources,
  adminSetAnonymousSettings,
} from '../../api/admin'
import { fetchAnonymousStatus } from '../../api/imagebed'
import { apiFetch, ApiRequestError } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { AdminLayout, AdminPageHeader } from './AdminLayout'
import * as ib from '../ImageBed.css'

export function AdminSettingsPage() {
  const queryClient = useQueryClient()
  const settings = useQuery({ queryKey: ['admin-anon-settings'], queryFn: adminGetAnonymousSettings })
  const sources = useQuery({ queryKey: ['admin-sources'], queryFn: adminListSources })
  const health = useQuery({ queryKey: ['health'], queryFn: () => apiFetch<{ status: string; version: string }>('/api/v1/health') })
  const anonStatus = useQuery({ queryKey: ['anon-status'], queryFn: fetchAnonymousStatus })

  const [sourceId, setSourceId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const saveMut = useMutation({
    mutationFn: adminSetAnonymousSettings,
    onSuccess: () => {
      setMsg('已保存')
      queryClient.invalidateQueries({ queryKey: ['admin-anon-settings'] })
      queryClient.invalidateQueries({ queryKey: ['anon-status'] })
    },
    onError: (err) => setMsg(err instanceof ApiRequestError ? err.message : '保存失败'),
  })

  if (!settings.isSuccess) return <AdminLayout><AdminPageHeader title="系统设置" /></AdminLayout>

  const currentSource = sourceId ?? settings.data.source_id
  const imageBedSources = sources.data?.filter((s) => s.image_bed_enabled && !s.is_disabled) ?? []

  return (
    <AdminLayout>
      <AdminPageHeader title="系统设置" />
      <section className={ib.section}>
        <h2 className={ib.sectionTitle}>匿名公共图床</h2>
        <p className={ib.label}>默认关闭。开启后任何人无需登录即可通过 /upload 上传图片（单张最大 {anonStatus.data?.max_file_size_mb ?? '-'}MB，按 IP 限流）。</p>
        <div className={ib.row}>
          <select className={ib.select} value={currentSource} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">选择目标存储源…</option>
            {imageBedSources.map((s) => (
              <option key={s.source_id} value={s.source_id}>{s.name}（{s.source_id}）</option>
            ))}
          </select>
          {settings.data.enabled ? (
            <Button variant="danger" onClick={() => saveMut.mutate({ enabled: false, source_id: currentSource })}>关闭匿名图床</Button>
          ) : (
            <Button disabled={!currentSource} onClick={() => saveMut.mutate({ enabled: true, source_id: currentSource })}>开启匿名图床</Button>
          )}
        </div>
        <p className={ib.label}>当前状态：{settings.data.enabled ? `已开启（目标 ${settings.data.source_id}）` : '未开启'}</p>
        {msg && <p className={ib.label}>{msg}</p>}
      </section>

      <section className={ib.section}>
        <h2 className={ib.sectionTitle}>运行信息</h2>
        <p className={ib.label}>版本：{health.data?.version ?? '-'}</p>
        <p className={ib.label}>基础设施配置（监听地址、public_url、上传限制等）由 config.yaml 和 OMNISTORE_* 环境变量管理，修改后需重启服务。</p>
      </section>
    </AdminLayout>
  )
}
