import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { mergeClasses } from '@fluentui/react-components'
import { fetchSetupStatus } from '../api/auth'
import { fetchPublicSummary } from '../api/public'
import { fetchSystemStatus } from '../api/system'
import { PublicFrame } from '../components/shell/PublicFrame'
import { Button } from '../components/ui/Button'
import { ServiceStatus } from '../components/shell/ServiceStatus'
import { StateView } from '../components/shell/StateView'
import { IconChevronRight } from '../components/ui/Icon'
import { useStyles } from './Home.styles'

// 指针视差的最大位移（px）。都小于 32px，不进 layout.ts。
const PARALLAX_X = 18
const PARALLAX_Y = 12

// 公开网盘首页：2.0 起全站单一公开 Source。首页平铺展开，不用卡片：
// kicker + 标题 + 说明 + 打开动作 + 技术署名带，右侧是等距立方体场。
// 其他公开服务只由顶部导航承担，这里不重复。
//
// 版面之下还有一层动效：等距晶格与呼吸光晕氛围层、线稿自绘入场、三只箱各自漂浮、
// 轨道虚线行进、标题遮罩上浮、署名带逐项落位，以及几何场的指针视差。
// 关键帧全部在 global.css；正文一侧只保留入场，持续动效集中在右侧几何与氛围层。
export function HomePage() {
  const css = useStyles()
  const navigate = useNavigate()
  const setup = useQuery({ queryKey: ['setup-status'], queryFn: fetchSetupStatus })
  const summary = useQuery({ queryKey: ['public-summary'], queryFn: fetchPublicSummary })
  // 与 PublicFrame 同一个 queryKey/选项，走缓存复用，不多打一次请求。
  const system = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
    retry: false,
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    if (setup.data && !setup.data.initialized) {
      navigate({ to: '/setup' })
    }
  }, [setup.data, navigate])

  const fieldMounted = summary.isSuccess && summary.data.enabled
  const fieldRef = useRef<HTMLDivElement | null>(null)

  // 几何场朝光标反方向轻轻浮起。每帧只写 transform，不进 React 状态——
  // pointermove 触发整页 re-render 的代价远大于这点位移；平滑跟随交给样式里的 transition。
  // 依赖 fieldMounted 是因为几何场要等 summary 落地才挂上 DOM。
  useEffect(() => {
    if (!fieldRef.current) return
    if (!window.matchMedia('(pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let offsetX = 0
    let offsetY = 0

    function apply() {
      frame = 0
      const node = fieldRef.current
      if (node) node.style.transform = `translate3d(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px, 0)`
    }

    function onPointerMove(event: PointerEvent) {
      // 用视口归一而不是 getBoundingClientRect：在 pointermove 里读布局会强制同步回流。
      offsetX = -(event.clientX / window.innerWidth - 0.5) * PARALLAX_X
      offsetY = -(event.clientY / window.innerHeight - 0.5) * PARALLAX_Y
      if (frame === 0) frame = requestAnimationFrame(apply)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      if (frame !== 0) cancelAnimationFrame(frame)
      const node = fieldRef.current
      if (node) node.style.transform = ''
    }
  }, [fieldMounted])

  function openPublicDrive() {
    navigate({ to: '/public/$', params: { _splat: '' } })
  }

  const driveName = summary.data?.source_name?.trim() || '公开网盘'
  const serviceState = summary.isError
    ? { value: '服务不可用', tone: 'warning' as const }
    : summary.data?.enabled
      ? { value: '已开放', tone: 'success' as const }
      : { value: '未开放', tone: 'neutral' as const }

  return (
    <PublicFrame>
      {summary.isPending && (
        <section className={css.entrySection} aria-busy="true" aria-label="正在加载公开目录">
          <div className={css.entryTop}>
            <div className={css.skeletonBars}>
              <span className={css.skeletonKicker} aria-hidden="true" />
              <span className={css.skeletonTitle} aria-hidden="true" />
              <span className={css.skeletonTagline} aria-hidden="true" />
              <span className={css.skeletonValues} aria-hidden="true" />
              <span className={css.skeletonLine} aria-hidden="true" />
              <span className={css.skeletonLineShort} aria-hidden="true" />
              <span className={css.skeletonActions} aria-hidden="true" />
            </div>
            <span className={mergeClasses(css.entryField, css.skeletonField)} aria-hidden="true" />
          </div>
        </section>
      )}

      {summary.isError && (
        <StateView
          kind="error"
          brand
          eyebrow="公开网盘 · 访问状态"
          title="公开目录暂时不可用"
          description="无法连接到实例服务，请稍后重新加载。"
          action={<Button onClick={() => summary.refetch()}>重新加载</Button>}
          status={{
            tone: 'warning',
            label: '实例服务未响应',
            hint: '如持续出现，请联系实例管理员',
          }}
        />
      )}

      {summary.isSuccess && !summary.data.enabled && (
        <>
          <StateView
            kind="unavailable"
            brand
            eyebrow="公开网盘 · 访问状态"
            title="公开网盘尚未开启"
            description="此实例尚未开放公开目录。管理员可在「系统设置 → 站点配置 → 站点服务」中绑定公开存储源。"
            status={{
              tone: 'neutral',
              label: '此实例未开放公开目录',
            }}
          />
        </>
      )}

      {summary.isSuccess && summary.data.enabled && (
        <>
          <section className={css.entrySection} aria-labelledby="public-drive-title">
            <div className={css.ambient}>
              <span className={css.ambientGlow} />
              <AmbientLattice className={css.ambientLattice} />
            </div>
            <div className={css.entryTop}>
              <div className={css.entryCopy}>
                <p className={mergeClasses(css.kicker, css.riseKicker)}>免登录 · 只读</p>
                <span className={css.titleMask}>
                  <h1 id="public-drive-title" className={css.entryTitle}>公开网盘</h1>
                </span>
                <div className={css.entryLede}>
                  <p className={css.entryTagline}>让文件分享变得简单。</p>
                  <p className={css.entryValues}>开放、自由、随时访问。</p>
                  <p className={css.entryDescription}>
                    一个轻量、开放的文件存储空间。
                    <br />
                    无需登录，即可浏览和访问公开分享的文件。
                  </p>
                </div>
                <div className={css.entryActions}>
                  <Button
                    size="large"
                    icon={<IconChevronRight />}
                    iconPosition="after"
                    aria-label={`打开目录 ${driveName}`}
                    onClick={openPublicDrive}
                  >
                    打开目录
                  </Button>
                </div>
              </div>
              <div className={css.fieldParallax} ref={fieldRef}>
                <div className={css.fieldRise}>
                  <DriveField className={css.entryField} />
                </div>
              </div>
            </div>
            <div className={css.entryFacts}>
              <span className={css.fact}>
                <span className={css.factLabel}>目录</span>
                <span className={css.factValue}>{driveName}</span>
              </span>
              <span className={css.fact}>
                <span className={css.factLabel}>根路径</span>
                <span className={mergeClasses(css.factValue, css.factMono)}>/public/</span>
              </span>
              {system.data?.version ? (
                <span className={css.fact}>
                  <span className={css.factLabel}>实例版本</span>
                  <span className={mergeClasses(css.factValue, css.factMono)}>{system.data.version}</span>
                </span>
              ) : null}
              <span className={css.factStatus}>
                <ServiceStatus label="公开目录" value={serviceState.value} tone={serviceState.tone} />
              </span>
            </div>
          </section>
        </>
      )}
    </PublicFrame>
  )
}

// 氛围层的等距菱形晶格：格子比例取自立方体场的箱面（88×50，与 176×100 的顶面同角），
// 于是「页面画布」和「箱子顶面」是同一张网格的两种尺度。纯装饰，不进读屏。
// 只在本页渲染一次，图案 id 因此可以是固定值。
function AmbientLattice({ className }: { className: string }) {
  return (
    <svg className={className} strokeOpacity="0.16" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="omnistore-home-lattice" width="88" height="50" patternUnits="userSpaceOnUse">
          <path d="M44 0 88 25 44 50 0 25Z" fill="none" stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#omnistore-home-lattice)" />
    </svg>
  )
}

// 品牌立方体的等距线稿：一只主箱、一只副箱、虚线连接与地平线——
// 首页几何，与状态面的水印同一母题。淡出统一挂在根节点的 stroke/fill opacity 上
// （colorBrandStroke1 在深浅两档都是可读的品牌蓝）。纯装饰，不进读屏。
//
// 三只箱分成三个 g：各自漂浮（bobMain/bobSide/bobFar），子元素的自绘延迟也由组类给出。
// 每条路径带 pathLength={1}，长短不一的路径因此共用同一条 draw 关键帧。
// 轨道虚线归在副箱组内——它从副箱顶点接出，留在组外会在漂浮时脱节。
function DriveField({ className }: { className: string }) {
  const css = useStyles()
  return (
    <svg
      className={className}
      viewBox="0 0 360 296"
      fill="none"
      strokeOpacity="0.36"
      fillOpacity="0.05"
      aria-hidden="true"
      focusable="false"
    >
      <g className={css.bobMain}>
        <path
          className={css.ink}
          pathLength={1}
          d="M250 26 338 76 250 126 162 76 250 26Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path
          className={css.ink}
          pathLength={1}
          d="M162 76v96l88 50 88-50V76M250 126v96"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path
          className={css.ink}
          pathLength={1}
          d="M250 52 288 74 250 96 212 74 250 52Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
          strokeOpacity="0.32"
        />
        <circle className={css.vertex} cx="250" cy="26" r="2.6" fill="currentColor" fillOpacity="0.4" />
        <circle className={css.vertex} cx="338" cy="76" r="2.2" fill="currentColor" fillOpacity="0.4" />
      </g>
      <g className={css.bobSide}>
        <path
          className={css.ink}
          pathLength={1}
          d="M78 150 134 182 78 214 22 182 78 150Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          className={css.ink}
          pathLength={1}
          d="M22 182v46l56 32 56-32v-46M78 214v46"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          data-rail="true"
          className={css.rail}
          d="M134 182 162 172"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <circle className={css.vertex} cx="134" cy="182" r="2.2" fill="currentColor" fillOpacity="0.4" />
        <circle className={css.vertex} cx="22" cy="228" r="2" fill="currentColor" fillOpacity="0.4" />
      </g>
      <g className={css.bobFar}>
        <path
          className={css.ink}
          pathLength={1}
          d="M74 26 122 52 74 78 26 52 74 26Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <circle className={css.vertex} cx="74" cy="78" r="2" fill="currentColor" fillOpacity="0.4" />
      </g>
    </svg>
  )
}
