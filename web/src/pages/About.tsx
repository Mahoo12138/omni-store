import { PublicShell } from '../components/layout/PublicShell'
import * as css from './AuthForm.css'
import { vars } from '../styles/theme.css'

// 关于我们 /about（docs/index.png 顶栏导航）。
// MVP 只放一个简短的"自部署存储中心"介绍页面。
export function AboutPage() {
  return (
    <PublicShell>
      <div
        className={css.card}
        style={{
          maxWidth: 720,
          margin: '40px auto',
          textAlign: 'left',
        }}
      >
        <h1
          style={{
            fontSize: vars.fontSize.xl,
            fontWeight: 700,
            textAlign: 'center',
            margin: 0,
            color: vars.color.text,
          }}
        >
          关于 OmniStore
        </h1>
        <p className={css.subtitle} style={{ textAlign: 'center' }}>
          自部署的统一存储中心
        </p>
        <p
          style={{
            color: vars.color.textSecondary,
            lineHeight: 1.7,
            marginTop: vars.space.md,
          }}
        >
          OmniStore 将多种存储介质统一接入到一个平台：你可以为不同的物理磁盘、NAS、
          私有云或图床服务建立「存储源」，再为不同的用户分配精细的访问权限。
        </p>
        <ul
          style={{
            color: vars.color.textSecondary,
            lineHeight: 1.9,
            paddingLeft: 20,
          }}
        >
          <li>统一的私有网盘浏览、上传、下载、目录管理</li>
          <li>面向登录用户的图床：复制外链、PicGo 兼容</li>
          <li>WebDAV 接入，把任意存储源挂载到系统的文件管理器</li>
          <li>公开挂载，把只读目录分享给匿名访客</li>
          <li>完整的审计日志，记录每一次敏感操作</li>
        </ul>
        <p
          style={{
            color: vars.color.textSecondary,
            lineHeight: 1.7,
            marginTop: vars.space.md,
          }}
        >
          详细设计与开发文档请参考仓库内的 <code>README.md</code>、
          <code>docs/PRODUCT.md</code> 与 <code>docs/DESIGN_SYSTEM.md</code>。
        </p>
      </div>
    </PublicShell>
  )
}
