import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { fetchAuthStatus } from '../api/auth'
import { fetchSystemStatus } from '../api/system'
import { PublicShell } from '../components/layout/PublicShell'
import {
  IconChevronRight,
  IconCloud,
  IconExternalLink,
  IconFolder,
  IconGlobe,
  IconHardDrive,
  IconImage,
  IconLink,
  IconList,
  IconServer,
  IconShield,
  LogoMark,
} from '../components/ui/Icon'
import * as css from './About.css'

const usageItems = [
  {
    number: '01',
    title: '私有文件管理',
    description: '在网页中浏览、上传、下载、重命名、移动与回收文件，并通过权限、配额和搜索保持秩序。',
    Icon: IconFolder,
  },
  {
    number: '02',
    title: '公开分享',
    description: '将指定目录或文件链接开放给访客；公开能力只在你明确启用后生效，也可以随时撤销。',
    Icon: IconLink,
  },
  {
    number: '03',
    title: '图床服务',
    description: '从网页或 PicGo 上传图片，获得稳定的公开链接，并在统一历史记录中完成管理。',
    Icon: IconImage,
  },
  {
    number: '04',
    title: '标准协议',
    description: '通过 WebDAV 挂载与协作，或使用 S3 Path-style 接口连接已有工具与自动化流程。',
    Icon: IconServer,
  },
] as const

const boundaryItems = [
  {
    title: '本地文件系统是真实数据源',
    description: '文件始终保存在本地目录、NAS 或私有云挂载点；OmniStore 不把它们搬进另一套文件仓库。',
    Icon: IconHardDrive,
  },
  {
    title: 'SQLite 只保存系统元数据',
    description: '用户、权限、配置、分享与审计记录集中在轻量数据库中，便于备份，也便于理解。',
    Icon: IconServer,
  },
  {
    title: '公开访问必须明确开启',
    description: '匿名浏览、公开目录和图床上传都由管理员主动配置，默认不会暴露你的私人文件。',
    Icon: IconShield,
  },
  {
    title: '敏感操作留下审计轨迹',
    description: '登录、访问、分享、变更与删除等关键动作都会被记录，帮助你了解系统如何被使用。',
    Icon: IconList,
  },
] as const

const sourceEndpoints = [
  { label: '本地磁盘', Icon: IconHardDrive },
  { label: 'NAS', Icon: IconServer },
  { label: '私有云', Icon: IconCloud },
] as const

const accessEndpoints = [
  { label: '网页', Icon: IconGlobe },
  { label: 'WebDAV', Icon: IconCloud },
  { label: 'S3', Icon: IconServer },
] as const

export function AboutPage() {
  const systemStatus = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
    staleTime: 60_000,
  })
  const authStatus = useQuery({
    queryKey: ['auth-status'],
    queryFn: fetchAuthStatus,
    retry: false,
    staleTime: 60_000,
  })

  return (
    <PublicShell showHeader={false}>
      <div className={css.page}>
        <section className={css.hero} aria-labelledby="about-title">
          <div className={css.heroCopy}>
            <h1 id="about-title">把分散的存储，收进一个清楚的入口。</h1>
            <p>
              OmniStore 以本地目录为真实数据源，统一连接网页文件管理、公开访问、WebDAV、图床与 S3。
              文件留在你的设备上，权限和入口由你掌握。
            </p>
            <div className={css.heroActions}>
              <Link to="/" className={css.primaryAction}>
                浏览公开网盘
                <IconChevronRight size={16} />
              </Link>
              <Link to="/upload" className={css.secondaryAction}>
                图床入口
              </Link>
            </div>
          </div>

          <div className={css.flow} aria-label="OmniStore 将存储源连接到多种访问入口">
            <div className={css.endpointStack}>
              {sourceEndpoints.map(({ label, Icon }) => (
                <div className={css.endpoint} key={label}>
                  <Icon size={20} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <span className={css.connector} aria-hidden="true">
              <IconChevronRight size={20} />
            </span>
            <div className={css.coreNode}>
              <LogoMark size={44} />
              <strong>OmniStore</strong>
              <span>统一入口</span>
            </div>
            <span className={css.connector} aria-hidden="true">
              <IconChevronRight size={20} />
            </span>
            <div className={css.endpointStack}>
              {accessEndpoints.map(({ label, Icon }) => (
                <div className={css.endpoint} key={label}>
                  <Icon size={20} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className={css.detailGrid}>
          <section className={css.usageSection} aria-labelledby="usage-title">
            <h2 id="usage-title">一个入口，四种使用方式</h2>
            <div className={css.usageList}>
              {usageItems.map(({ number, title, description, Icon }) => (
                <article className={css.usageRow} key={number}>
                  <span className={css.rowNumber}>{number}</span>
                  <span className={css.rowIcon} aria-hidden="true">
                    <Icon size={23} />
                  </span>
                  <div className={css.rowCopy}>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={css.boundarySection} aria-labelledby="boundary-title">
            <h2 id="boundary-title">数据在哪里，边界就在哪里</h2>
            <div className={css.boundaryList}>
              {boundaryItems.map(({ title, description, Icon }) => (
                <article className={css.boundaryRow} key={title}>
                  <span className={css.boundaryIcon} aria-hidden="true">
                    <Icon size={23} />
                  </span>
                  <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <section className={css.releaseBand} aria-label="版本与项目资料">
          <div className={css.releaseIdentity}>
            <LogoMark size={38} />
            <div>
              <strong>OmniStore {systemStatus.data?.version ?? '…'}</strong>
              <span>MIT License</span>
            </div>
          </div>
          <div className={css.releaseActions}>
            <Link to={authStatus.data?.authenticated ? '/app' : '/login'} className={css.primaryAction}>
              开始使用
              <IconChevronRight size={16} />
            </Link>
            <a
              href="https://github.com/omni-store/omnistore/tree/main/docs"
              className={css.secondaryAction}
              target="_blank"
              rel="noreferrer"
            >
              查看项目文档
              <IconExternalLink size={15} />
            </a>
          </div>
        </section>
      </div>
    </PublicShell>
  )
}
