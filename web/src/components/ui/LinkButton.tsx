import { forwardRef, type AnchorHTMLAttributes, type ReactElement, type Ref } from 'react'
import { Button as FluentButton, mergeClasses, type ButtonProps as FluentButtonProps } from '@fluentui/react-components'
import { createLink } from '@tanstack/react-router'
import { useButtonVariant, type ButtonVariant } from './Button'

/**
 * 页面可用 props：原生 `<a>` 的语义属性（href / onClick / 键盘事件由 router 注入）
 * 加上 Fluent Button 的外观旋钮。刻意不复用 FluentButtonProps —— 它以 `<button>`
 * 为参照声明事件签名，而这里的元素是 `<a>`。
 */
export type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  /** 与 ui/Button 共用同一套 variant 语言 */
  variant?: ButtonVariant
  icon?: ReactElement
  iconPosition?: 'before' | 'after'
  size?: 'small' | 'medium' | 'large'
  shape?: 'rounded' | 'circular' | 'square'
  block?: boolean
}

function AnchorButtonRender(
  { variant = 'primary', className, icon, ...anchorProps }: LinkButtonProps,
  ref: Ref<HTMLAnchorElement>,
) {
  const { appearance, extra } = useButtonVariant(variant)
  // as="a" 时 Fluent 需要 anchor 签名的 props，与本组件收下的 anchor props
  // 运行时完全一致，只差在泛型参数上，故在这一处边界对齐类型。
  const props = {
    ...anchorProps,
    as: 'a',
    ref,
    appearance,
    icon,
    className: mergeClasses(extra ?? '', className ?? ''),
  } as unknown as FluentButtonProps & { as: 'a' }
  return <FluentButton {...props} />
}

const AnchorButton = forwardRef(AnchorButtonRender)

/** 站外链接的按钮形态：同一个 Fluent Button anchor 实现，不经 router。 */
export const ExternalLinkButton = AnchorButton

/**
 * 路由化的 Fluent 按钮链接：`to` / `search` / `params` / `preload` 交给
 * TanStack Router 的 createLink（客户端跳转 + 真实 href），外观与 `<a>` 语义
 * 交给 Fluent Button。用它取代「用 CSS 把 `<Link>` 画成按钮」的自研体系。
 */
export const LinkButton = createLink(AnchorButton)
