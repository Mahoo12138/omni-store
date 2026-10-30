import { IconActivity, IconGlobe, IconInfo, IconServer, IconSettings, IconShield, IconUser } from '../../components/ui/Icon'

export type SectionKey =
  | 'profile'
  | 'preferences'
  | 'stats'
  | 'sources'
  | 'policies'
  | 'users'
  | 'audit'
  | 'site'

export const baseNav: { key: SectionKey; label: string; icon: React.ReactElement }[] = [
  { key: 'profile', label: '我的', icon: <IconUser size={15} /> },
  { key: 'preferences', label: '偏好设置', icon: <IconSettings size={15} /> },
]

export const adminNav: { key: SectionKey; label: string; icon: React.ReactElement }[] = [
  { key: 'stats', label: '仪表盘', icon: <IconInfo size={15} /> },
  { key: 'sources', label: '存储源', icon: <IconServer size={15} /> },
  { key: 'policies', label: '访问策略', icon: <IconShield size={15} /> },
  { key: 'users', label: '用户', icon: <IconUser size={15} /> },
  { key: 'audit', label: '审计日志', icon: <IconActivity size={15} /> },
  { key: 'site', label: '站点配置', icon: <IconGlobe size={15} /> },
]
