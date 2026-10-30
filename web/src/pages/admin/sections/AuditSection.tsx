import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminFetchAuditLogs } from '../../../api/admin'
import { Input, mergeClasses, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@fluentui/react-components'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Banner } from '../../../components/shell/Banner'
import { FormField } from '../../../components/shell/FormLayout'
import { StateView } from '../../../components/shell/StateView'
import { Select } from '../../../components/ui/Select'
import { IconActivity, IconChevronDown } from '../../../components/ui/Icon'
import { formatDate } from '../../../utils/format'
import { auditActionLabel, auditActorLabel, auditEntryLabel } from '../../../utils/audit'
import { useStyles } from './audit.styles'
import { HorizontalDataRegion } from '../shared'
import { SectionCard } from '../SectionCard'

const auditPageSize = 10

const auditActorOptions = [
  { value: 'all', label: '全部主体' },
  { value: 'user', label: '登录用户' },
  { value: 'anonymous', label: '匿名用户' },
  { value: 'system', label: '系统' },
] as const
const auditEntryOptions = [
  { value: 'all', label: '全部入口' },
  { value: 'web', label: '网页' },
  { value: 'webdav', label: 'WebDAV' },
  { value: 's3', label: 'S3' },
  { value: 'image_bed', label: '用户图床' },
  { value: 'anonymous_image_bed', label: '匿名图床' },
  { value: 'admin', label: '管理后台' },
  { value: 'cli', label: '命令行' },
] as const
const auditStatusOptions = [
  { value: 'all', label: '全部结果' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
] as const

interface AuditFilters {
  actorType: string
  entryType: string
  status: string
  searchText: string
}

const emptyAuditFilters: AuditFilters = {
  actorType: 'all',
  entryType: 'all',
  status: 'all',
  searchText: '',
}

export function AuditSection() {
  const css = useStyles()
  const [draftFilters, setDraftFilters] = useState<AuditFilters>(() => ({ ...emptyAuditFilters }))
  const [filters, setFilters] = useState<AuditFilters>(() => ({ ...emptyAuditFilters }))
  const [page, setPage] = useState(1)
  const [showAllFilters, setShowAllFilters] = useState(false)

  const logs = useQuery({
    queryKey: [
      'admin-audit',
      page,
      filters.actorType,
      filters.entryType,
      filters.status,
      filters.searchText,
    ],
    queryFn: () => adminFetchAuditLogs({
      page,
      page_size: auditPageSize,
      actor_type: filters.actorType === 'all' ? undefined : filters.actorType as 'user' | 'anonymous' | 'system',
      entry_type: filters.entryType === 'all' ? undefined : filters.entryType as 'web' | 'webdav' | 's3' | 'image_bed' | 'anonymous_image_bed' | 'admin' | 'cli',
      status: filters.status === 'all' ? undefined : filters.status as 'success' | 'failed',
      q: filters.searchText || undefined,
    }),
  })

  const total = logs.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / auditPageSize))

  function applyFilters(event: FormEvent) {
    event.preventDefault()
    setPage(1)
    setFilters({ ...draftFilters, searchText: draftFilters.searchText.trim() })
  }

  function resetFilters() {
    setDraftFilters({ ...emptyAuditFilters })
    setFilters({ ...emptyAuditFilters })
    setPage(1)
  }

  return (
    <SectionCard
      icon={<IconActivity size={18} />}
      tone="brand"
      hint="按主体、入口、结果或关键字筛选实例上的关键操作。"
      bodyPadding="none"
    >
      <form className={css.auditFilters} onSubmit={applyFilters}>
        <FormField label="主体" className={css.auditField}>
          <Select
            value={draftFilters.actorType}
            onValueChange={(value) => setDraftFilters((current) => ({ ...current, actorType: value }))}
            options={auditActorOptions}
            ariaLabel="筛选审计主体"
          />
        </FormField>
        <FormField label="关键字" className={css.auditFieldKeyword}>
          <Input
            value={draftFilters.searchText}
            onChange={(event) => setDraftFilters((current) => ({ ...current, searchText: event.target.value }))}
            placeholder="动作、路径、存储源、IP 或错误码"
            maxLength={128}
          />
        </FormField>
        {showAllFilters && (
          <>
            <FormField label="入口" className={css.auditField}>
              <Select
                value={draftFilters.entryType}
                onValueChange={(value) => setDraftFilters((current) => ({ ...current, entryType: value }))}
                options={auditEntryOptions}
                ariaLabel="筛选审计入口"
              />
            </FormField>
            <FormField label="结果" className={css.auditField}>
              <Select
                value={draftFilters.status}
                onValueChange={(value) => setDraftFilters((current) => ({ ...current, status: value }))}
                options={auditStatusOptions}
                ariaLabel="筛选审计结果"
              />
            </FormField>
          </>
        )}
        <div className={css.auditFilterActions}>
          <Button
            type="button"
            variant="secondary"
            aria-expanded={showAllFilters}
            aria-label={showAllFilters ? '收起更多筛选' : '展开更多筛选'}
            title={showAllFilters ? '收起更多筛选' : '展开更多筛选'}
            icon={<IconChevronDown size={16} className={showAllFilters ? css.auditToggleExpanded : undefined} />}
            onClick={() => setShowAllFilters((current) => !current)}
          />
          <Button type="submit">查询</Button>
          <Button type="button" variant="secondary" onClick={resetFilters}>重置</Button>
        </div>
      </form>
      <HorizontalDataRegion name="审计日志" busy={logs.isFetching}>
        <Table size="small" className={mergeClasses(css.compactTable, css.compactTableAudit)}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell className={css.compactTh}>时间</TableHeaderCell>
              <TableHeaderCell className={css.compactTh}>主体</TableHeaderCell>
              <TableHeaderCell className={css.compactTh}>入口</TableHeaderCell>
              <TableHeaderCell className={css.compactTh}>动作</TableHeaderCell>
              <TableHeaderCell className={css.compactTh}>存储源</TableHeaderCell>
              <TableHeaderCell className={css.compactTh}>路径</TableHeaderCell>
              <TableHeaderCell className={css.compactTh}>IP</TableHeaderCell>
              <TableHeaderCell className={css.compactTh}>结果</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.data?.items.map((log) => (
              <TableRow key={log.id} className={css.compactTr}>
                <TableCell className={css.compactTd} style={{ whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</TableCell>
                <TableCell className={css.compactTd}>
                  {auditActorLabel(log.actor_type) ?? log.actor_type}
                  {log.actor_user_id ? ` #${log.actor_user_id}` : ''}
                </TableCell>
                <TableCell className={css.compactTd}>{auditEntryLabel(log.entry_type) ?? log.entry_type}</TableCell>
                <TableCell className={css.compactTd}>{auditActionLabel(log.action) ?? log.action}</TableCell>
                <TableCell className={css.compactTd} style={{ fontFamily: 'var(--fontFamilyMonospace)', color: 'var(--colorNeutralForeground2)' }}>
                  {log.storage_source_name ?? '—'}
                </TableCell>
                <TableCell className={css.compactTd}>
                  {log.relative_path ?? '—'}
                  {log.target_relative_path ? ` → ${log.target_relative_path}` : ''}
                </TableCell>
                <TableCell className={css.compactTd} style={{ fontFamily: 'var(--fontFamilyMonospace)', color: 'var(--colorNeutralForeground2)' }}>
                  {log.ip_address ?? '—'}
                </TableCell>
                <TableCell className={css.compactTd}>
                  {log.status === 'success' ? (
                    <Badge color="green">成功</Badge>
                  ) : (
                    <Badge color="red">失败{log.error_code ? ` (${log.error_code})` : ''}</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {logs.isPending && <StateView layout="plain" kind="pending" title="正在加载审计日志…" />}
        {logs.isSuccess && logs.data.items.length === 0 && (
          <StateView layout="plain" kind="filtered" title="没有符合条件的日志" description="调整筛选条件后再试一次。" />
        )}
        {logs.isError ? <Banner intent="error">加载失败</Banner> : null}
      </HorizontalDataRegion>
      <nav className={css.auditPagination} aria-label="审计日志分页">
        <span aria-live="polite">
          共 {total} 条，第 {Math.min(page, totalPages)} 页 / 共 {totalPages} 页
        </span>
        <div className={css.auditPaginationActions}>
          <Button
            type="button"
            variant="secondary"
            disabled={page <= 1 || logs.isFetching}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            上一页
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={page >= totalPages || logs.isFetching}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            下一页
          </Button>
        </div>
      </nav>
    </SectionCard>
  )
}
