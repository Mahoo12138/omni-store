import { useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, mergeClasses } from '@fluentui/react-components'
import { apiFetch, ApiRequestError } from '../../../api/client'
import { adminReconcileSource, runIntegrityCheck, runOperationsCleanup, type CleanupResult, type IntegrityReport, fetchAdminOverview } from '../../../api/admin'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { DialogWrap } from '../../../components/ui/Dialog'
import { IconAction } from '../../../components/ui/IconAction'
import { toastError, toastSuccess } from '../../../components/ui/Toast'
import { Banner } from '../../../components/shell/Banner'
import { SkeletonRows } from '../../../components/shell/Skeletons'
import {
  IconCheck, IconCloud, IconDatabase, IconError, IconGlobe, IconHardDrive, IconImage,
  IconInfo, IconPlug, IconShield, IconShieldCheck, IconSync, IconTag, IconTrash, IconUpload, IconUser, IconWarning,
} from '../../../components/ui/Icon'
import { formatBytes } from '../../../utils/format'
import { auditActionLabel } from '../../../utils/audit'
import { useStyles } from './dashboard.styles'
import { HorizontalDataRegion } from '../shared'
import { SectionCard } from '../SectionCard'

const operationCapabilityLabels: Record<string, string> = {
  public_drive: '公开网盘',
  image_bed: '快速图床',
  transfer_center: '流转中心',
}

const capabilityIcons: Record<string, ReactNode> = {
  public_drive: <IconGlobe size={16} />,
  image_bed: <IconImage size={16} />,
  transfer_center: <IconUpload size={16} />,
}

function formatAuditTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : date.toLocaleDateString([], { month: '2-digit', day: '2-digit' }) + ' ' +
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function portOf(addr?: string): string | undefined {
  if (!addr) return undefined
  const i = addr.lastIndexOf(':')
  return i >= 0 ? addr.slice(i + 1) : addr
}

function MetricTile({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  const css = useStyles()
  return (
    <div className={css.metricTile}>
      <dt className={css.metricLabel}>
        <span className={css.metricIcon} aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className={css.metricValue}>{children}</dd>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  const css = useStyles()
  return (
    <div className={css.statRow}>
      <dt className={css.statRowLabel}>{label}</dt>
      <dd className={css.statRowValue}>{value}</dd>
    </div>
  )
}

export function DashboardSection() {
  const css = useStyles()
  const overview = useQuery({
    queryKey: ['admin-overview'], queryFn: fetchAdminOverview, refetchInterval: 30_000, retry: false,
  })
  // 构建元信息（commit / build 时间）只在 /health 上有，与侧栏共用同一份缓存。
  const health = useQuery({ queryKey: ['health'], queryFn: () => apiFetch<{ commit?: string; build_time?: string }>('/api/v1/health') })
  const queryClient = useQueryClient()
  // 两个运维操作的结果只在弹窗里读一次，不再常驻页面：报告是「这次动作的产出」，
  // 留在指标网格下面会变成第二块状态面板，还会把上一次的数字当成当前状态。
  const [report, setReport] = useState<MaintenanceReport | null>(null)
  const [err, setErr] = useState('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-overview'] })

  const integrityMut = useMutation({
    mutationFn: runIntegrityCheck,
    onMutate: () => { setErr('') },
    onSuccess: async (result) => { setReport({ kind: 'integrity', data: result }); await refresh() },
    onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '完整性检查失败'),
  })
  const cleanupMut = useMutation({
    mutationFn: runOperationsCleanup,
    onMutate: () => { setErr('') },
    onSuccess: async (result) => { setReport({ kind: 'cleanup', data: result }); await refresh() },
    onError: async (e) => {
      setErr(e instanceof ApiRequestError ? e.message : '清理失败')
      // 清理可能已经部分完成，失败后也重新读取实际状态。
      await refresh()
    },
  })
  const reconcileMut = useMutation({
    mutationFn: ({ key }: { key: string; name: string }) => adminReconcileSource(key),
    onMutate: () => { setErr('') },
    onSuccess: async (result, source) => {
      toastSuccess(`${source.name} 台账已校准：新增 ${result.added}，更新 ${result.updated}，移除 ${result.removed}`)
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ['admin-sources'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-source', source.key] }),
      ])
    },
    onError: async (e) => {
      toastError(e instanceof ApiRequestError ? e.message : '校准失败')
      await refresh()
    },
  })
  const maintenancePending = integrityMut.isPending || cleanupMut.isPending || reconcileMut.isPending

  if (!overview.data) {
    return (
      <SectionCard
        icon={<IconInfo size={18} />}
        title="系统状态"
        hint={overview.isPending ? <span role="status">正在加载仪表盘…</span> : undefined}
        busy={overview.isPending}
      >
        {overview.isPending ? <SkeletonRows count={4} /> : (
          <Banner intent="error" action={<Button variant="secondary" onClick={() => void overview.refetch()}>重试</Button>}>
            仪表盘加载失败：{overview.error?.message || '无法获取系统状态'}
          </Banner>
        )}
      </SectionCard>
    )
  }
  const data = overview.data.operations
  const sys = overview.data.system
  const users = data.database.table_rows.users
  const attentionCount =
    (data.database.quick_check === 'ok' ? 0 : 1) +
    data.sources.filter((source) => !source.root_accessible).length +
    data.capabilities.filter((capability) => capability.enabled && (!capability.source_key || capability.source_disabled)).length
  const healthy = attentionCount === 0

  return (
    <>
      <SectionCard
        icon={healthy ? <IconShieldCheck size={18} /> : <IconWarning size={18} />}
        tone={healthy ? 'success' : 'warning'}
        title="系统状态"
        busy={overview.isFetching}
        hint={(
          <>
            <span className={css.healthState} data-tone={healthy ? 'success' : 'warning'}>
              <span className={css.healthDot} aria-hidden="true" />
              {healthy ? '运行正常' : `${attentionCount} 项需要关注`}
            </span>
            {/* 分隔点放在第二段内部：换行时跟着“更新于”走，不会悬在上一行行尾。 */}
            <span>· 更新于 {new Date(data.generated_at).toLocaleTimeString()} · 每 30 秒自动刷新</span>
          </>
        )}
        actions={(
          <>
            <Button variant="ghost" disabled={overview.isFetching} onClick={() => void overview.refetch()}>
              {overview.isFetching ? '刷新中…' : '刷新'}
            </Button>
            <Button variant="secondary" disabled={maintenancePending} onClick={() => integrityMut.mutate()}>
              {integrityMut.isPending ? '检查中…' : '完整性检查'}
            </Button>
            <Button disabled={maintenancePending} onClick={() => cleanupMut.mutate()}>
              {cleanupMut.isPending ? '清理中…' : '运行清理'}
            </Button>
          </>
        )}
      >
        {overview.isError ? (
          <Banner intent="error">状态刷新失败：{overview.error.message}。当前显示上次成功获取的数据，请点击刷新重试。</Banner>
        ) : null}
        {/*
          三层信息：运行指标（数值）→ 服务状态（圆点）→ 构建元信息（安静的一行）。
          指标砖统一 24px 数值，六格在宽屏三列、窄屏两列/单列，不再平铺成调试输出。
        */}
        <dl className={css.metricGrid}>
          <MetricTile icon={<IconHardDrive size={14} />} label="存储源">
            {data.sources.length}<span className={css.metricUnit}> 个</span>
          </MetricTile>
          <MetricTile icon={<IconUser size={14} />} label="用户">
            {users ?? '—'}{users != null ? <span className={css.metricUnit}> 个</span> : null}
          </MetricTile>
          <MetricTile icon={<IconPlug size={14} />} label="主服务端口">
            {portOf(sys.http_addr)}
          </MetricTile>
          <MetricTile icon={<IconTag size={14} />} label="运行版本">
            {data.version}
          </MetricTile>
          <MetricTile icon={<IconCloud size={14} />} label="S3">
            <span className={css.statusValue} data-tone={sys.s3_status === '已启用' ? 'success' : undefined}>
              <span className={css.statusDot} aria-hidden="true" />
              {sys.s3_status}
            </span>
          </MetricTile>
          <MetricTile icon={<IconGlobe size={14} />} label="WebDAV">
            <span className={css.statusValue} data-tone={sys.webdav_status === '已启用' ? 'success' : undefined}>
              <span className={css.statusDot} aria-hidden="true" />
              {sys.webdav_status}
            </span>
          </MetricTile>
        </dl>
        <div className={css.metricMeta}>
          <span className={css.metaItem}>
            <span className={css.metaLabel}>Commit</span>
            <span className={css.metaValue}>{health.data?.commit || 'unknown'}</span>
          </span>
          <span className={css.metaItem}>
            <span className={css.metaLabel}>构建</span>
            <span className={css.metaValue}>{health.data?.build_time || 'unknown'}</span>
          </span>
        </div>
        {err ? <Banner intent="error">{err}</Banner> : null}
      </SectionCard>

      <div className={css.opsStatGrid}>
        <SectionCard icon={<IconDatabase size={18} />} tone="brand" title="数据库" hint="SQLite 主库与 WAL 预写日志。">
          <div className={css.statLead}>
            <span className={css.statLeadLabel}>数据库大小</span>
            <span className={css.statLeadValue}>{formatBytes(data.database.size_bytes)}</span>
          </div>
          <dl className={css.statRows}>
            <StatRow label="WAL" value={formatBytes(data.database.wal_bytes)} />
            <StatRow
              label="quick_check"
              value={<Badge color={data.database.quick_check === 'ok' ? 'green' : 'red'}>{data.database.quick_check}</Badge>}
            />
          </dl>
        </SectionCard>

        <SectionCard icon={<IconTrash size={18} />} tone="brand" title="缓存与回收站" hint="可清理的缓存与保留中的删除项。">
          <div className={css.statLead}>
            <span className={css.statLeadLabel}>回收站</span>
            <span className={css.statLeadValue}>
              {formatBytes(data.storage.trash_bytes)}
              <span className={css.metricUnit}>{data.storage.trash_entries} 项</span>
            </span>
          </div>
          <dl className={css.statRows}>
            <StatRow label="缩略图" value={formatBytes(data.storage.thumbnail_cache_bytes)} />
            <StatRow label="Multipart" value={data.storage.multipart_uploads} />
          </dl>
        </SectionCard>

        <SectionCard icon={<IconUpload size={18} />} tone="brand" title="流转负载" hint="发件包与收集任务的在途占用。">
          <div className={css.statLead}>
            <span className={css.statLeadLabel}>在途载荷</span>
            <span className={css.statLeadValue}>{formatBytes(data.transfers.payload_bytes)}</span>
          </div>
          <dl className={css.statRows}>
            <StatRow label="发件包" value={`活跃 ${data.transfers.active_sends} · 草稿 ${data.transfers.draft_sends}`} />
            <StatRow label="收集" value={data.transfers.active_collections} />
            {data.transfers.active_quota_bytes > 0 ? (
              <StatRow label="活跃配额" value={formatBytes(data.transfers.active_quota_bytes)} />
            ) : null}
          </dl>
        </SectionCard>
      </div>

      <SectionCard
        icon={<IconHardDrive size={18} />}
        title="存储源健康"
        hint="存储源状态、协议和用量统一查看；配置请前往“存储源”。"
        busy={overview.isFetching}
        bodyPadding="none"
      >
        <HorizontalDataRegion name="存储源健康" busy={overview.isFetching}>
          <Table size="small" className={mergeClasses(css.compactTable, css.dashboardSourceTable)}>
            <TableHeader><TableRow>
              <TableHeaderCell className={css.compactTh}>存储源</TableHeaderCell>
              <TableHeaderCell className={css.compactTh}>状态</TableHeaderCell>
              <TableHeaderCell className={css.compactTh}>物理 / 台账</TableHeaderCell>
              <TableHeaderCell className={css.compactTh}>回收站</TableHeaderCell>
              <TableHeaderCell className={css.compactTh}>活跃流转</TableHeaderCell>
              <TableHeaderCell className={css.compactTh}>协议</TableHeaderCell>
              <TableHeaderCell className={css.compactTh}>操作</TableHeaderCell>
            </TableRow></TableHeader>
            <TableBody>
              {data.sources.length === 0 ? <TableRow><TableCell colSpan={7} className={css.compactTd}>还没有存储源，请前往“存储源”添加。</TableCell></TableRow> : null}
              {data.sources.map((source) => {
                const usagePercent = source.quota_bytes > 0
                  ? Math.min(100, (source.usage_bytes / source.quota_bytes) * 100)
                  : 0
                const usageTone = usagePercent >= 95 ? 'danger' : usagePercent >= 80 ? 'warning' : undefined
                const protocols = [
                  source.webdav_enabled ? 'WebDAV' : null,
                  source.s3_enabled ? 'S3' : null,
                  source.static_enabled ? '静态 HTTP' : null,
                ].filter(Boolean)
                return (
                  <TableRow key={source.key} className={css.compactTr}>
                    <TableCell className={css.compactTd}>
                      <div className={css.sourceIdentity}>
                        <span className={css.sourceIcon} aria-hidden="true"><IconHardDrive size={16} /></span>
                        <span className={css.sourceText}>
                          {/* 看板只给名称与健康状态；真实路径只在“存储源”维护页展示。 */}
                          <span className={css.sourceName}>{source.name}</span>
                          <span className={css.sourceKey}>{source.key}</span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className={css.compactTd}>
                      <div className={css.dashboardSourceStatus}>
                        {source.disabled ? <Badge color="gray">已禁用</Badge> : null}
                        <Badge color={source.root_accessible ? 'green' : 'red'}>{source.root_accessible ? '可访问' : '不可访问'}</Badge>
                        {source.root_issue ? <span className={css.dashboardError}>{source.root_issue}</span> : null}
                      </div>
                    </TableCell>
                    <TableCell className={css.compactTd}>
                      <div className={css.usageCell}>
                        <span>{source.root_accessible ? `${formatBytes(source.usage_bytes)} / ${formatBytes(source.ledger_bytes)}` : '— / —'}</span>
                        {source.root_accessible && source.quota_bytes > 0 ? (
                          <span className={css.usageTrack} aria-hidden="true">
                            <span className={css.usageFill} data-tone={usageTone} style={{ width: `${usagePercent}%` }} />
                          </span>
                        ) : null}
                        <span className={css.usageQuota}>
                          {source.quota_bytes > 0
                            ? `配额 ${formatBytes(source.quota_bytes)}${source.root_accessible ? ` · ${Math.round(usagePercent)}%` : ''}`
                            : '配额 不限'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className={css.compactTd}>{source.trash_count} 项</TableCell>
                    <TableCell className={css.compactTd}>{source.active_transfers}</TableCell>
                    <TableCell className={css.compactTd}>
                      <div className={css.protocolTags}>
                        {protocols.map((protocol) => <span className={css.protocolTag} key={protocol}>{protocol}</span>)}
                        {protocols.length === 0 ? <span className={css.protocolEmpty}>—</span> : null}
                      </div>
                    </TableCell>
                    <TableCell className={css.compactTd}>
                      <IconAction
                        label="校准台账"
                        tooltip={reconcileMut.isPending && reconcileMut.variables.key === source.key ? '校准中…' : '校准台账'}
                        icon={<IconSync size={16} />}
                        disabled={maintenancePending || !source.root_accessible}
                        onClick={() => reconcileMut.mutate({ key: source.key, name: source.name })}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </HorizontalDataRegion>
      </SectionCard>

      <SectionCard
        icon={<IconShield size={18} />}
        title="站点能力健康"
        hint="公开侧三个能力的产品开关与绑定状态。"
      >
        <div className={css.capabilityGrid}>
          {data.capabilities.map((capability) => (
            <div className={css.capabilityCard} key={capability.capability}>
              <div className={css.capabilityHead}>
                <span className={css.iconChip} data-tone="brand" aria-hidden="true">
                  {capabilityIcons[capability.capability] ?? <IconInfo size={16} />}
                </span>
                <span className={css.capabilityName}>{operationCapabilityLabels[capability.capability] ?? capability.capability}</span>
                {!capability.source_key ? <Badge color="gray">未绑定</Badge>
                  : capability.source_disabled ? <Badge color="red">源已禁用</Badge>
                  : capability.enabled ? <Badge color="green">正常</Badge>
                  : <Badge color="gray">已关闭</Badge>}
              </div>
              <p className={css.capabilityDetail}>{capability.detail}</p>
              {capability.capability === 'image_bed' ? (
                <p className={css.capabilityNote}>匿名上传{overview.data.anonymous_image_bed_on ? '已开启' : '已关闭'}</p>
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        icon={<IconError size={18} />}
        tone="danger"
        title="最近失败操作"
        badge={data.recent_failed_audits.length > 0 ? <Badge color="red">{data.recent_failed_audits.length}</Badge> : null}
        hint="来自审计日志，按时间倒序。"
      >
        {data.recent_failed_audits.length === 0 ? (
          <div className={css.emptyState}>
            <span className={css.emptyIcon} aria-hidden="true"><IconCheck size={14} /></span>
            <span>近期没有失败记录。</span>
          </div>
        ) : (
          <div className={css.opsFailList}>
            {data.recent_failed_audits.map((entry) => (
              <div className={css.opsFailRow} key={entry.id}>
                <span className={css.opsFailTime}>{formatAuditTime(entry.created_at)}</span>
                <span className={css.opsFailAction}>{auditActionLabel(entry.action) ?? entry.action}</span>
                <span className={css.opsFailReason}>{entry.error_code || '未知原因'}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <MaintenanceReportDialog report={report} onClose={() => setReport(null)} />
    </>
  )
}

type MaintenanceReport =
  | { kind: 'integrity'; data: IntegrityReport }
  | { kind: 'cleanup'; data: CleanupResult }

function MaintenanceReportDialog({ report, onClose }: { report: MaintenanceReport | null; onClose: () => void }) {
  const integrity = report?.kind === 'integrity' ? report.data : null
  const cleanup = report?.kind === 'cleanup' ? report.data : null
  // 每种报告各自决定自己的标题，兜底不与任何一个操作共用文案，
  // 免得退场动画里（DialogWrap 冻结画面之前）看起来像弹出了另一个操作的窗。
  return (
    <DialogWrap
      open={report !== null}
      onOpenChange={(open) => { if (!open) onClose() }}
      title={integrity
        ? (integrity.ok ? '完整性检查通过' : '完整性检查发现问题')
        : cleanup
          ? '清理完成'
          : '运维结果'}
      description={integrity
        ? (integrity.ok ? '数据库完整性与外键约束均无异常。' : '以下检查项未通过，建议先排查再运行清理。')
        : cleanup
          ? '下列数字是本次实际回收的条目，0 表示该类没有需要处理的内容。'
          : undefined}
      footer={<Button onClick={onClose}>关闭</Button>}
    >
      {integrity ? <IntegrityReportBody data={integrity} /> : null}
      {cleanup ? <CleanupReportBody data={cleanup} /> : null}
    </DialogWrap>
  )
}

function IntegrityReportBody({ data }: { data: IntegrityReport }) {
  const css = useStyles()
  return (
    <div className={css.reportGroup}>
      <dl className={css.reportGrid}>
        <ReportCount label="integrity_check" value={data.ok ? 'ok' : (data.integrity[0] ?? 'failed')} />
        <ReportCount label="外键悬空" value={data.fk_violations} />
      </dl>
      {!data.ok && data.integrity.length > 1 ? (
        <ul className={css.reportProblems}>
          {data.integrity.map((line) => <li key={line}>{line}</li>)}
        </ul>
      ) : null}
    </div>
  )
}

function CleanupReportBody({ data }: { data: CleanupResult }) {
  const css = useStyles()
  const gc = data.transfer_gc
  return (
    <>
      <div className={css.reportGroup}>
        <span className={css.reportGroupTitle}>存储与协议</span>
        <dl className={css.reportGrid}>
          <ReportCount label="WebDAV 锁" value={data.webdav_locks} />
          <ReportCount label="会话" value={data.sessions} />
          <ReportCount label="Multipart 上传" value={data.multipart_uploads} />
          <ReportCount label="Multipart 孤儿" value={data.multipart_orphans} />
          <ReportCount label="缩略图缓存" value={data.thumbnails} />
        </dl>
      </div>
      <div className={css.reportGroup}>
        <span className={css.reportGroupTitle}>流转中心</span>
        <p className={css.reportHint}>「过期」与「已清扫」依次为 发件包 + 收集任务。</p>
        <dl className={css.reportGrid}>
          <ReportCount label="过期任务" value={`${gc.transfers_expired} + ${gc.collections_expired}`} />
          <ReportCount label="已清扫任务" value={`${gc.transfers_swept} + ${gc.collections_swept}`} />
          <ReportCount label="草稿清理" value={gc.drafts_removed} />
          <ReportCount label="空提交" value={gc.empty_submissions} />
          <ReportCount label="流转会话" value={gc.sessions_removed} />
          <ReportCount label="孤儿目录" value={gc.orphan_dirs_removed} />
          <ReportCount label="临时文件" value={gc.orphan_temp_removed} />
        </dl>
      </div>
    </>
  )
}

function ReportCount({ label, value }: { label: string; value: number | string }) {
  const css = useStyles()
  return (
    <div className={css.reportItem}>
      <dt className={css.reportLabel}>{label}</dt>
      <dd className={css.reportValue}>{value}</dd>
    </div>
  )
}
