import { useQuery } from '@tanstack/react-query'
import { adminFetchAuditLogs } from '../../api/admin'
import { AdminLayout, AdminPageHeader } from './AdminLayout'
import * as ft from '../../components/files/FileTable.css'
import { formatDate } from '../../utils/format'

export function AdminAuditPage() {
  const logs = useQuery({ queryKey: ['admin-audit'], queryFn: adminFetchAuditLogs })

  return (
    <AdminLayout>
      <AdminPageHeader title="审计日志（最近 200 条）" />
      <div className={ft.tableWrap}>
        <table className={ft.table}>
          <thead>
            <tr>
              <th className={ft.th}>时间</th>
              <th className={ft.th}>主体</th>
              <th className={ft.th}>入口</th>
              <th className={ft.th}>动作</th>
              <th className={ft.th}>存储源</th>
              <th className={ft.th}>路径</th>
              <th className={ft.th}>IP</th>
              <th className={ft.th}>结果</th>
            </tr>
          </thead>
          <tbody>
            {logs.data?.map((log) => (
              <tr key={log.id} className={ft.row}>
                <td className={ft.td}>{formatDate(log.created_at)}</td>
                <td className={ft.td}>{log.actor_type}{log.actor_user_id ? `#${log.actor_user_id}` : ''}</td>
                <td className={ft.td}>{log.entry_type}</td>
                <td className={ft.td}>{log.action}</td>
                <td className={ft.td}>{log.source_id ?? '–'}</td>
                <td className={ft.nameCell}>
                  {log.relative_path ?? '–'}
                  {log.target_relative_path ? ` → ${log.target_relative_path}` : ''}
                </td>
                <td className={ft.td}>{log.ip_address ?? '–'}</td>
                <td className={ft.td}>{log.status === 'success' ? '成功' : `失败${log.error_code ? ` (${log.error_code})` : ''}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.isSuccess && logs.data.length === 0 && <div className={ft.empty}>暂无日志</div>}
        {logs.isError && <div className={ft.empty}>加载失败</div>}
      </div>
    </AdminLayout>
  )
}
