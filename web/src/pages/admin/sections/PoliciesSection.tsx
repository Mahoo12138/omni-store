import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiRequestError } from '../../../api/client'
import { adminDeletePolicy, adminListPolicies, adminListSources, adminListUsers, type AccessPolicy } from '../../../api/admin'
import { mergeClasses, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@fluentui/react-components'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { DialogWrap } from '../../../components/ui/Dialog'
import { IconAction } from '../../../components/ui/IconAction'
import { IconEdit, IconPlus, IconShield, IconTrash } from '../../../components/ui/Icon'
import { useStyles } from './policies.styles'
import { PolicyDialog } from '../dialogs/PolicyDialog'
import { HorizontalDataRegion } from '../shared'
import { SectionCard } from '../SectionCard'

export function PoliciesSection() {
  const css = useStyles()
  const queryClient = useQueryClient()
  const policies = useQuery({ queryKey: ['admin-policies'], queryFn: adminListPolicies })
  const sources = useQuery({ queryKey: ['admin-sources'], queryFn: adminListSources })
  const users = useQuery({ queryKey: ['admin-users'], queryFn: adminListUsers })
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<AccessPolicy | null>(null)
  const [deleting, setDeleting] = useState<AccessPolicy | null>(null)

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-policies'] })
    queryClient.invalidateQueries({ queryKey: ['admin-overview'] })
  }
  const deleteMutation = useMutation({
    mutationFn: adminDeletePolicy,
    onSuccess: () => {
      setDeleting(null)
      refresh()
    },
    onError: (error) => alert(error instanceof ApiRequestError ? error.message : '删除失败'),
  })

  return (
    <>
      <SectionCard
        icon={<IconShield size={18} />}
        tone="brand"
        hint={<>共 {policies.data?.length ?? 0} 个 · 将多个存储源权限组合成策略，再统一绑定用户。</>}
        actions={<Button onClick={() => setCreateOpen(true)} icon={<IconPlus size={14} />}>新建策略</Button>}
        bodyPadding="none"
      >
        <HorizontalDataRegion name="访问策略">
          <Table size="small" className={mergeClasses(css.compactTable, css.compactTableWide)}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={css.compactTh}>名称</TableHeaderCell>
                <TableHeaderCell className={css.compactTh}>存储源规则</TableHeaderCell>
                <TableHeaderCell className={css.compactTh}>用户</TableHeaderCell>
                <TableHeaderCell className={css.compactTh}>操作</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.data?.map((policy) => (
                <TableRow key={policy.key} className={css.compactTr}>
                  <TableCell className={css.compactTd}>
                    <div style={{ fontWeight: 600 }}>{policy.name}</div>
                    {policy.description ? (
                      <div className={css.policyEditorMeta}>{policy.description}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className={css.compactTd}>
                    <div className={css.policySummary}>
                      {policy.sources.length === 0 ? '—' : policy.sources.map((rule) => (
                        <Badge key={rule.source_key} color={rule.permission === 'read_write' ? 'blue' : 'gray'}>
                          {rule.source_name} · {rule.permission === 'read_write' ? '读写' : '只读'}
                          {rule.path_rules.length > 0 ? ` · ${rule.path_rules.length} 个子路径` : ''}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className={css.compactTd}>
                    {policy.users.length === 0
                      ? '—'
                      : policy.users.map((user) => user.display_name || user.username).join('、')}
                  </TableCell>
                  <TableCell className={css.compactTd}>
                    <div className={css.formRow}>
                      <IconAction label="编辑策略" icon={<IconEdit size={16} />} onClick={() => setEditing(policy)} />
                      <IconAction label="删除策略" icon={<IconTrash size={16} />} danger onClick={() => setDeleting(policy)} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {policies.isSuccess && policies.data.length === 0 ? (
            <p className={css.policyEditorEmpty}>还没有访问策略，普通用户暂时无法访问私有存储源。</p>
          ) : null}
        </HorizontalDataRegion>
      </SectionCard>

      <PolicyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        sources={sources.data ?? []}
        users={users.data ?? []}
        onSaved={refresh}
      />
      {editing ? (
        <PolicyDialog
          open
          policy={editing}
          onOpenChange={(open) => { if (!open) setEditing(null) }}
          sources={sources.data ?? []}
          users={users.data ?? []}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      ) : null}
      <DialogWrap
        open={!!deleting}
        onOpenChange={(open) => { if (!open) setDeleting(null) }}
        title="删除访问策略"
        description={`确定删除「${deleting?.name ?? ''}」吗？`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>取消</Button>
            <Button
              variant="danger"
              disabled={deleteMutation.isPending}
              onClick={() => deleting && deleteMutation.mutate(deleting.key)}
            >
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: 'var(--colorNeutralForeground1)', fontSize: '13px' }}>
          删除后，依赖该策略获得的访问权限会立即失效，不会删除存储源或真实文件。
        </p>
      </DialogWrap>
    </>
  )
}

