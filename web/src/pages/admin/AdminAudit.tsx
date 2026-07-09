import { useQuery } from '@tanstack/react-query'
import { adminFetchAuditLogs } from '../../api/admin'
import { formatDate } from '../../utils/format'
import { AdminLayout } from './AdminLayout'
import * as fm from '../FileManager.css'

// /admin/audit-logs：最近 200 条审计日志（README §20.3）。
export function AdminAuditPage() {
  const logs = useQuery({ queryKey: ['admin-audit'], queryFn: adminFetchAuditLogs })

  return (
    <AdminLayout title="审计日志（最近 200 条）">
      <div className={fm.tableWrap}>
        <table className={fm.table}>
          <thead>
            <tr>
              <th className={fm.th}>时间</th>
              <th className={fm.th}>主体</th>
              <th className={fm.th}>入口</th>
              <th className={fm.th}>动作</th>
              <th className={fm.th}>存储源</th>
              <th className={fm.th}>路径</th>
              <th className={fm.th}>IP</th>
              <th className={fm.th}>结果</th>
            </tr>
          </thead>
          <tbody>
            {logs.data?.map((log) => (
              <tr key={log.id}>
                <td className={fm.td}>{formatDate(log.created_at)}</td>
                <td className={fm.td}>
                  {log.actor_type}
                  {log.actor_user_id ? `#${log.actor_user_id}` : ''}
                </td>
                <td className={fm.td}>{log.entry_type}</td>
                <td className={fm.td}>{log.action}</td>
                <td className={fm.td}>{log.source_id ?? '-'}</td>
                <td className={fm.nameCell}>
                  {log.relative_path ?? '-'}
                  {log.target_relative_path ? ` → ${log.target_relative_path}` : ''}
                </td>
                <td className={fm.td}>{log.ip_address ?? '-'}</td>
                <td className={fm.td}>{log.status === 'success' ? '成功' : `失败`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.isSuccess && logs.data.length === 0 && <div className={fm.empty}>暂无日志</div>}
      </div>
    </AdminLayout>
  )
}
