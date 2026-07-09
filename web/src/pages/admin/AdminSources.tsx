import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adminCreateSource,
  adminDeleteSource,
  adminGetSource,
  adminListPermissions,
  adminListSources,
  adminListUsers,
  adminRemovePermission,
  adminSetExcludePatterns,
  adminSetPermission,
  adminSetSourceDisabled,
  adminUpdateSource,
} from '../../api/admin'
import type { AdminSource } from '../../api/admin'
import { ApiRequestError } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { AdminLayout } from './AdminLayout'
import * as fm from '../FileManager.css'
import * as css from '../ImageBed.css'

function errMsg(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : '操作失败'
}

// /admin：存储源管理（README §25.3）。
export function AdminSourcesPage() {
  const queryClient = useQueryClient()
  const sources = useQuery({ queryKey: ['admin-sources'], queryFn: adminListSources })
  const [expanded, setExpanded] = useState<string | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-sources'] })

  // 创建表单
  const [sourceId, setSourceId] = useState('')
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [createErr, setCreateErr] = useState('')

  const createMut = useMutation({
    mutationFn: adminCreateSource,
    onSuccess: () => {
      setSourceId('')
      setName('')
      setRootPath('')
      setCreateErr('')
      refresh()
    },
    onError: (err) => setCreateErr(errMsg(err)),
  })

  function onCreate(e: FormEvent) {
    e.preventDefault()
    createMut.mutate({ source_id: sourceId, name, description: '', root_path: rootPath })
  }

  const disableMut = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) =>
      adminSetSourceDisabled(id, disabled),
    onSuccess: refresh,
    onError: (err) => alert(errMsg(err)),
  })

  const deleteMut = useMutation({
    mutationFn: adminDeleteSource,
    onSuccess: refresh,
    onError: (err) => alert(errMsg(err)),
  })

  return (
    <AdminLayout title="存储源管理">
      <section className={css.section}>
        <h2 className={css.sectionTitle}>新建存储源</h2>
        <form onSubmit={onCreate}>
          <div className={css.row}>
            <Input
              placeholder="source_id（小写字母数字短横线）"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              required
            />
            <Input placeholder="名称" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              placeholder="真实目录绝对路径（Docker 内为容器路径）"
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
              required
            />
            <Button type="submit" disabled={createMut.isPending}>
              创建
            </Button>
          </div>
          {createErr && <p className={css.error}>{createErr}</p>}
          <p className={css.muted}>路径创建后不可修改；不允许系统目录、数据目录和重叠挂载。</p>
        </form>
      </section>

      <div className={fm.tableWrap}>
        <table className={fm.table}>
          <thead>
            <tr>
              <th className={fm.th}>source_id</th>
              <th className={fm.th}>名称</th>
              <th className={fm.th}>路径</th>
              <th className={fm.th}>状态</th>
              <th className={fm.th}>公开</th>
              <th className={fm.th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {sources.data?.map((s) => (
              <tr key={s.source_id}>
                <td className={fm.td}>{s.source_id}</td>
                <td className={fm.td}>{s.name}</td>
                <td className={fm.td}>{s.root_path}</td>
                <td className={fm.td}>{s.is_disabled ? '已禁用' : '正常'}</td>
                <td className={fm.td}>
                  {s.public_read_enabled ? `是（${s.public_mount_path}）` : '否'}
                </td>
                <td className={fm.td}>
                  <button
                    className={fm.actionBtn}
                    onClick={() => setExpanded(expanded === s.source_id ? null : s.source_id)}
                  >
                    {expanded === s.source_id ? '收起' : '配置'}
                  </button>
                  <button
                    className={fm.actionBtn}
                    onClick={() =>
                      disableMut.mutate({ id: s.source_id, disabled: !s.is_disabled })
                    }
                  >
                    {s.is_disabled ? '启用' : '禁用'}
                  </button>
                  <button
                    className={fm.actionBtnDanger}
                    onClick={() => {
                      if (
                        confirm(
                          '此操作只会从 OmniStore 中移除该存储源，不会删除磁盘上的真实文件。确定继续吗？',
                        )
                      ) {
                        deleteMut.mutate(s.source_id)
                      }
                    }}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sources.isSuccess && sources.data.length === 0 && (
          <div className={fm.empty}>还没有存储源</div>
        )}
      </div>

      {expanded && <SourceDetail sourceId={expanded} onChanged={refresh} />}
    </AdminLayout>
  )
}

// 单个存储源的配置面板：公开挂载、WebDAV、图床、排除规则、权限。
function SourceDetail({ sourceId, onChanged }: { sourceId: string; onChanged: () => void }) {
  const queryClient = useQueryClient()
  const detail = useQuery({
    queryKey: ['admin-source', sourceId],
    queryFn: () => adminGetSource(sourceId),
  })
  const perms = useQuery({
    queryKey: ['admin-perms', sourceId],
    queryFn: () => adminListPermissions(sourceId),
  })
  const users = useQuery({ queryKey: ['admin-users'], queryFn: adminListUsers })

  const [mountPath, setMountPath] = useState<string | null>(null)
  const [patterns, setPatterns] = useState<string | null>(null)
  const [permUserId, setPermUserId] = useState('')
  const [permLevel, setPermLevel] = useState<'read_only' | 'read_write'>('read_only')
  const [msg, setMsg] = useState('')

  const refreshDetail = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-source', sourceId] })
    queryClient.invalidateQueries({ queryKey: ['admin-perms', sourceId] })
    onChanged()
  }

  const updateMut = useMutation({
    mutationFn: (input: Parameters<typeof adminUpdateSource>[1]) =>
      adminUpdateSource(sourceId, input),
    onSuccess: () => {
      setMsg('已保存')
      refreshDetail()
    },
    onError: (err) => setMsg(errMsg(err)),
  })

  const patternsMut = useMutation({
    mutationFn: (list: string[]) => adminSetExcludePatterns(sourceId, list),
    onSuccess: () => {
      setMsg('排除规则已保存')
      refreshDetail()
    },
    onError: (err) => setMsg(errMsg(err)),
  })

  const setPermMut = useMutation({
    mutationFn: ({ userId, level }: { userId: number; level: 'read_only' | 'read_write' }) =>
      adminSetPermission(sourceId, userId, level),
    onSuccess: refreshDetail,
    onError: (err) => alert(errMsg(err)),
  })

  const removePermMut = useMutation({
    mutationFn: (userId: number) => adminRemovePermission(sourceId, userId),
    onSuccess: refreshDetail,
    onError: (err) => alert(errMsg(err)),
  })

  if (!detail.isSuccess) return null
  const src: AdminSource = detail.data.source
  const mountValue = mountPath ?? src.public_mount_path ?? ''
  const patternsValue = patterns ?? detail.data.exclude_patterns.join('\n')

  return (
    <section className={css.section}>
      <h2 className={css.sectionTitle}>配置：{src.name}</h2>

      <div className={css.row}>
        <label>
          <input
            type="checkbox"
            checked={src.webdav_enabled}
            onChange={(e) => updateMut.mutate({ webdav_enabled: e.target.checked })}
          />{' '}
          启用 WebDAV
        </label>
        <label>
          <input
            type="checkbox"
            checked={src.image_bed_enabled}
            onChange={(e) => updateMut.mutate({ image_bed_enabled: e.target.checked })}
          />{' '}
          启用图床
        </label>
        <label>
          <input
            type="checkbox"
            checked={src.public_read_enabled}
            onChange={(e) => {
              if (e.target.checked && !mountValue) {
                setMsg('请先填写公开挂载路径再开启公开访问')
                return
              }
              updateMut.mutate({
                public_read_enabled: e.target.checked,
                public_mount_path: mountValue,
              })
            }}
          />{' '}
          公开访问
        </label>
      </div>

      <div className={css.row}>
        <Input
          label="公开挂载路径（如 /photos，修改后旧链接失效）"
          value={mountValue}
          onChange={(e) => setMountPath(e.target.value)}
        />
        <Button
          variant="secondary"
          onClick={() =>
            updateMut.mutate({
              public_mount_path: mountValue,
              public_read_enabled: src.public_read_enabled,
            })
          }
        >
          保存挂载路径
        </Button>
      </div>

      <div className={css.row}>
        <div>
          <p className={css.muted}>排除规则（每行一条 glob，如 private/**）：</p>
          <textarea
            className={css.tokenBox}
            rows={5}
            cols={50}
            value={patternsValue}
            onChange={(e) => setPatterns(e.target.value)}
          />
          <div className={css.row}>
            <Button
              variant="secondary"
              onClick={() => patternsMut.mutate(patternsValue.split('\n'))}
            >
              保存排除规则
            </Button>
          </div>
        </div>
      </div>

      <h2 className={css.sectionTitle}>用户权限</h2>
      {perms.data?.map((p) => (
        <div key={p.user_id} className={css.row}>
          <span>{p.username}</span>
          <span className={css.muted}>{p.permission === 'read_write' ? '读写' : '只读'}</span>
          <button
            className={fm.actionBtn}
            onClick={() =>
              setPermMut.mutate({
                userId: p.user_id,
                level: p.permission === 'read_write' ? 'read_only' : 'read_write',
              })
            }
          >
            切换为{p.permission === 'read_write' ? '只读' : '读写'}
          </button>
          <button className={fm.actionBtnDanger} onClick={() => removePermMut.mutate(p.user_id)}>
            取消权限
          </button>
        </div>
      ))}
      <div className={css.row}>
        <select
          className={css.select}
          value={permUserId}
          onChange={(e) => setPermUserId(e.target.value)}
        >
          <option value="">选择用户…</option>
          {users.data
            ?.filter((u) => !perms.data?.some((p) => p.user_id === u.id))
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
        </select>
        <select
          className={css.select}
          value={permLevel}
          onChange={(e) => setPermLevel(e.target.value as 'read_only' | 'read_write')}
        >
          <option value="read_only">只读</option>
          <option value="read_write">读写</option>
        </select>
        <Button
          variant="secondary"
          disabled={!permUserId}
          onClick={() => setPermMut.mutate({ userId: Number(permUserId), level: permLevel })}
        >
          分配权限
        </Button>
      </div>
      {msg && <p className={css.muted}>{msg}</p>}
    </section>
  )
}
