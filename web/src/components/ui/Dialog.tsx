import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useStyles } from './Dialog.styles'

// 自研模态弹窗：portal + 同步 aria-hidden 背景隔离 + 手写焦点圈。
// 不用 Fluent Dialog 的原因：其 tabster 隔离是异步记账的，受控关闭与列表刷新
// 交错时会留下损坏的可访问性状态（详见提交 5ae95c0 的调查记录）。
// 这里的隔离在 effect 中同步设置/恢复，时机完全确定。

const DialogDepthContext = createContext(0)

// 嵌套弹窗栈：Escape 只响应栈顶
const dialogStack: object[] = []
// 滚动锁计数：所有弹窗关闭后才解锁
let scrollLockCount = 0
// 背景隔离计数：多个弹窗共享同一批被隐藏节点，全部关闭后才恢复
const ariaHiddenCounts = new Map<Element, number>()

function isolateBackground() {
  const touched: Element[] = []
  for (const child of Array.from(document.body.children)) {
    if (child.hasAttribute('data-omnistore-dialog')) continue
    const count = ariaHiddenCounts.get(child) ?? 0
    ariaHiddenCounts.set(child, count + 1)
    touched.push(child)
    if (count === 0) child.setAttribute('aria-hidden', 'true')
  }
  // 计数对所有经过的节点生效(包括别处已隐藏的),归零才真正移除属性
  return () => {
    for (const child of touched) {
      const count = ariaHiddenCounts.get(child) ?? 1
      if (count <= 1) {
        ariaHiddenCounts.delete(child)
        child.removeAttribute('aria-hidden')
      } else {
        ariaHiddenCounts.set(child, count - 1)
      }
    }
  }
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** 宽弹窗，用于编辑复杂表单（多字段）。 */
  wide?: boolean
  /** 底部按钮区（通常是“取消 / 确认”）。 */
  footer?: ReactNode
  children: ReactNode
}

// 基础层级（对应原 vars.zIndex.modal），嵌套弹窗在此基础上按深度叠加
const DIALOG_BASE_Z_INDEX = 40

export function DialogWrap({
  open,
  onOpenChange,
  title,
  description,
  wide,
  footer,
  children,
}: DialogProps) {
  const depth = useContext(DialogDepthContext) + 1
  const layerOffset = (depth - 1) * 2
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange
  const instance = useRef({}).current
  const css = useStyles()

  const requestClose = useCallback(() => {
    onOpenChangeRef.current(false)
  }, [])

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return

    dialogStack.push(instance)
    scrollLockCount += 1
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // 同步隔离背景：隐藏 body 直接子级中的非弹窗内容（计数式，
    // 平级/嵌套弹窗共享，全部关闭后才恢复）。
    const restoreBackground = isolateBackground()

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const focusFirst = () => {
      const target = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      if (target) target.focus()
      else panel.focus()
    }
    focusFirst()

    const isTop = () => dialogStack[dialogStack.length - 1] === instance

    // Fluent 浮层(Dropdown/Menu 等)打开时,Escape/Tab 归浮层处理,不能在捕获阶段
    // 抢走(否则浮层关不掉,残留弹层挡住后续交互)
    const floatingLayerOpen = () =>
      !!document.querySelector('.fui-Listbox, .fui-MenuPopover')

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTop()) return
      if (event.key === 'Escape') {
        if (floatingLayerOpen()) return
        event.stopPropagation()
        requestClose()
        return
      }
      if (event.key === 'Tab') {
        if (floatingLayerOpen()) return
        const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
          .filter((el) => el.offsetParent !== null || el === document.activeElement)
        if (focusables.length === 0) {
          event.preventDefault()
          panel.focus()
          return
        }
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        if (event.shiftKey && (active === first || !panel.contains(active))) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && active === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      restoreBackground()
      scrollLockCount -= 1
      if (scrollLockCount === 0) document.body.style.overflow = prevOverflow || ''
      const idx = dialogStack.indexOf(instance)
      if (idx !== -1) dialogStack.splice(idx, 1)
      const restore = restoreFocusRef.current
      if (restore && document.contains(restore)) restore.focus()
    }
  }, [open, instance, requestClose])

  if (!open) return null

  return createPortal(
    <DialogDepthContext.Provider value={depth}>
      {/* 背景遮罩：点击关闭；嵌套弹窗必须有独立遮罩并明确高于父弹窗 */}
      <div
        className={css.backdrop}
        data-omnistore-dialog=""
        data-dialog-backdrop=""
        data-dialog-depth={depth}
        style={{ zIndex: DIALOG_BASE_Z_INDEX + layerOffset }}
        onClick={requestClose}
      />
      <div
        className={css.viewport}
        data-omnistore-dialog=""
        data-dialog-viewport=""
        data-dialog-depth={depth}
        style={{ zIndex: DIALOG_BASE_Z_INDEX + layerOffset + 1 }}
      >
        <div
          className={wide ? css.popupWide : css.popup}
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <div className={css.header}>
            <div>
              <h2 className={css.title} id={titleId}>{title}</h2>
              {description ? (
                <p className={css.description}>{description}</p>
              ) : null}
            </div>
            <button type="button" className={css.close} aria-label="关闭弹窗" onClick={requestClose}>
              <CloseIcon />
            </button>
          </div>
          <div className={css.body}>{children}</div>
          {footer ? <div className={css.footer}>{footer}</div> : null}
        </div>
      </div>
    </DialogDepthContext.Provider>,
    document.body,
  )
}

// 关闭按钮里的 X 图标（避免依赖外部 集合）
function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M3 3l8 8M11 3l-8 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
