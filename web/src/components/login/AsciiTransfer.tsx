import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useTheme } from '../../utils/useTheme'

type Point = { x: number; y: number }
type Box = { left: number; top: number; width: number; height: number }
type Path = { points: Point[]; cumulative: number[]; total: number }

const CYCLE = 9000
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const ease = (value: number) => {
  const p = clamp01(value)
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const cubic = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
  const u = 1 - t
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  }
}
const hash = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}
const sampleCubic = (a: Point, b: Point, c: Point, d: Point, count = 32) =>
  Array.from({ length: count }, (_, index) => cubic(a, b, c, d, index / (count - 1)))

const makePath = (points: Point[]): Path => {
  const cumulative = [0]
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y))
  }
  return { points, cumulative, total: cumulative[cumulative.length - 1] }
}

const atPath = (path: Path, t: number): Point => {
  const target = clamp01(t) * path.total
  let low = 0
  let high = path.cumulative.length - 1
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2)
    if (path.cumulative[mid] <= target) low = mid
    else high = mid
  }
  const span = path.cumulative[high] - path.cumulative[low] || 1
  const local = (target - path.cumulative[low]) / span
  return {
    x: lerp(path.points[low].x, path.points[high].x, local),
    y: lerp(path.points[low].y, path.points[high].y, local),
  }
}

// 登录页的整页背景：客户端在左侧，文件上行到卡片上方的 OmniStore，再分发到右侧三个通道，
// 两侧轨道把链路延伸到页面底部。桌面端独有（≤980px 由样式隐藏）；
// 颜色取自 Fluent 变量，prefers-reduced-motion 时停在静态帧。
export function AsciiTransfer({
  className,
  anchorRef,
}: {
  className?: string
  anchorRef?: RefObject<HTMLElement | null>
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { resolved } = useTheme()

  useEffect(() => {
    const canvas = ref.current
    const host = canvas?.parentElement
    const ctx = canvas?.getContext('2d')
    const bg = document.createElement('canvas')
    const bgCtx = bg.getContext('2d')
    if (!canvas || !host || !ctx || !bgCtx) return

    const style = getComputedStyle(canvas)
    const mono = style.getPropertyValue('--fontFamilyMonospace').trim() || 'monospace'
    const accent = style.getPropertyValue('--colorBrandForeground1').trim() || '#0f6cbd'
    const muted = style.getPropertyValue('--colorNeutralForeground3').trim() || '#888'
    const strong = style.getPropertyValue('--colorNeutralForeground1').trim() || '#111'
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let width = 1440
    let height = 900
    let frame = 0
    let card: Box = { left: 500, top: 210, width: 440, height: 460 }

    const toRgba = (color: string, alpha: number) => {
      ctx.fillStyle = '#000000'
      ctx.fillStyle = color
      const normalized = String(ctx.fillStyle)
      const match = normalized.match(/rgba?\(([^)]+)\)/)
      if (match) {
        const [r, g, b] = match[1].split(',').map((part) => Number.parseFloat(part))
        return `rgba(${r}, ${g}, ${b}, ${alpha})`
      }
      const hex = normalized.replace('#', '')
      const full = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex
      const r = Number.parseInt(full.slice(0, 2), 16)
      const g = Number.parseInt(full.slice(2, 4), 16)
      const b = Number.parseInt(full.slice(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }

    const write = (
      target: CanvasRenderingContext2D,
      value: string,
      x: number,
      y: number,
      color: string,
      size: number,
      align: CanvasTextAlign = 'left',
      alpha = 1,
      weight = 400,
    ) => {
      target.globalAlpha = alpha
      target.fillStyle = color
      target.font = `${weight} ${size}px ${mono}`
      target.textAlign = align
      target.textBaseline = 'middle'
      target.fillText(value, x, y)
      target.globalAlpha = 1
    }

    const dot = (target: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha: number) => {
      target.globalAlpha = alpha
      target.fillStyle = color
      target.beginPath()
      target.arc(x, y, radius, 0, Math.PI * 2)
      target.fill()
      target.globalAlpha = 1
    }

    const drawPathDots = (path: Path, step = 11, alpha = 0.44, radius = 1.2) => {
      let next = step
      let index = 0
      for (let pointIndex = 1; pointIndex < path.points.length; pointIndex += 1) {
        while (path.cumulative[pointIndex] >= next) {
          const point = atPath(path, next / path.total)
          if (index % 9 === 0) write(ctx, '+', point.x, point.y, muted, 10, 'center', alpha - 0.08)
          else dot(ctx, point.x, point.y, radius, muted, alpha)
          index += 1
          next += step
        }
      }
    }

    const layout = () => {
      const compact = width < 1200 || height < 840
      const clientY = card.top + card.height / 2
      const labelWidth = compact ? 74 : 86
      const offsets = compact ? [-46, 0, 46] : [-54, 0, 54]
      const framePad = compact ? 24 : 30
      const frame = {
        left: card.left - framePad,
        top: card.top - framePad,
        width: card.width + framePad * 2,
        height: card.height + framePad * 2,
      }
      const portLeft = { x: frame.left, y: clientY }
      const portRight = { x: frame.left + frame.width, y: clientY }
      const clientRowRight = portLeft.x - (compact ? 64 : 90)
      const clientRowLeft = clientRowRight - (compact ? 176 : 204)
      const endpointNodeX = portRight.x + (compact ? 56 : 84)
      return {
        compact,
        clientY,
        offsets,
        frame,
        portLeft,
        portRight,
        clientRowLeft,
        clientRowRight,
        clientRowGap: compact ? 68 : 82,
        endpointNodeX,
        endpointLabelEnd: endpointNodeX + 12 + labelWidth,
        rightRailX: endpointNodeX + 12 + labelWidth / 2,
        busY: height - 60,
      }
    }

    const measure = () => {
      const hostRect = host.getBoundingClientRect()
      width = Math.max(0, hostRect.width)
      height = Math.max(0, hostRect.height)
      const anchorRect = anchorRef?.current?.getBoundingClientRect()
      if (anchorRect && anchorRect.width > 0) {
        card = {
          left: anchorRect.left - hostRect.left,
          top: anchorRect.top - hostRect.top,
          width: anchorRect.width,
          height: anchorRect.height,
        }
      } else {
        card = { left: (width - 440) / 2, top: (height - 460) / 2, width: 440, height: 460 }
      }
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    // 静态层：卡片外圈的大虚线轨道、品牌光晕和四角定位符。
    const drawStatic = () => {
      bg.width = Math.round(width * dpr)
      bg.height = Math.round(height * dpr)
      bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      bgCtx.clearRect(0, 0, width, height)
      const centerX = card.left + card.width / 2
      const centerY = card.top + card.height / 2

      const glow = bgCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(width, height) * 0.42)
      glow.addColorStop(0, toRgba(accent, 0.07))
      glow.addColorStop(1, toRgba(accent, 0))

      bgCtx.fillStyle = glow
      bgCtx.fillRect(0, 0, width, height)

      const halo = bgCtx.createRadialGradient(
        centerX,
        centerY,
        Math.min(card.width, card.height) * 0.36,
        centerX,
        centerY,
        Math.max(card.width, card.height) * 0.8,
      )
      halo.addColorStop(0, toRgba(accent, 0.06))
      halo.addColorStop(1, toRgba(accent, 0))
      bgCtx.fillStyle = halo
      bgCtx.fillRect(0, 0, width, height)

      const orbitX = card.left + card.width / 2
      const orbitY = card.top + card.height / 2
      const rx = card.width * 1.15
      const ry = card.height * 0.72
      for (let index = 0; index < 120; index += 1) {
        const angle = (Math.PI * 2 * index) / 120
        const x = orbitX + Math.cos(angle) * rx
        const y = orbitY + Math.sin(angle) * ry
        if (index % 30 === 0) write(bgCtx, '+', x, y, muted, 10, 'center', 0.34)
        else dot(bgCtx, x, y, 1.2, muted, 0.22)
      }

      const inset = 22
      for (const [x, y] of [
        [inset, inset],
        [width - inset, inset],
        [inset, height - inset],
        [width - inset, height - inset],
      ]) {
        write(bgCtx, '+', x, y, muted, 11, 'center', 0.36)
      }
    }

    const resize = () => {
      measure()
      drawStatic()
    }

    const draw = (now: number) => {
      const {
        compact,
        clientY,
        offsets,
        frame,
        portLeft,
        portRight,
        clientRowLeft,
        clientRowRight,
        clientRowGap,
        endpointNodeX,
        endpointLabelEnd,
        rightRailX,
        busY,
      } = layout()
      const cardCenterX = card.left + card.width / 2
      const cardCenterY = card.top + card.height / 2
      const animate = !reduced.matches
      const phase = animate ? (now % CYCLE) / CYCLE : 0.66
      const fades = phase > 0.94 ? 1 - (phase - 0.94) / 0.06 : 1
      const labelSize = compact ? 12 : 14
      const pulse = clamp01((phase - 0.2) / 0.24)
      const frameGlow = pulse > 0 && pulse < 1 ? Math.sin(pulse * Math.PI) : 0

      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(bg, 0, 0, width, height)

      // 整页缓慢漂浮的字符
      for (let index = 0; index < 32; index += 1) {
        const baseX = hash(index * 3.7 + 1) * width
        const baseY = hash(index * 5.1 + 9) * height
        const speed = 2.5 + hash(index * 2.3 + 4) * 5
        const sway = hash(index * 7.7 + 2) * Math.PI * 2
        const x = baseX + Math.sin(now / 5200 + sway) * 16
        const y = animate ? ((baseY + (now / 1000) * speed) % (height + 32)) - 16 : baseY
        const node = index % 8 === 0
        write(ctx, node ? '+' : '·', x, y, node ? accent : muted, node ? 10 : 9, 'center', node ? 0.24 : 0.16)
      }

      // 页面底部的链路总线
      const busLeft = clientRowLeft
      const busRight = endpointLabelEnd
      for (let x = busLeft; x < busRight; x += 12) {
        dot(ctx, x, busY, 1.1, muted, 0.24)
      }
      write(ctx, '+', busLeft, busY, muted, 11, 'center', 0.46)
      write(ctx, '+', busRight, busY, muted, 11, 'center', 0.46)
      const busProgress = animate ? (now / 16000) % 1 : 0.42
      const busFade = busProgress > 0.96 ? (1 - busProgress) / 0.04 : 1
      const busX = lerp(busLeft, busRight, busProgress)
      for (let trail = 1; trail <= 4; trail += 1) {
        dot(ctx, busX - trail * 9, busY, 1.3, accent, busFade * Math.max(0, 0.3 - trail * 0.06))
      }
      write(ctx, '+', busX, busY, accent, 11, 'center', busFade * 0.7)

      // 左侧上行轨道（客户端列之下）与右侧下行轨道（endpoint 之下）
      const leftRailTop = clientY + clientRowGap + 30
      const rightRailTop = clientY + offsets[2] + 28
      for (const railX of [clientRowLeft, rightRailX]) {
        const top = railX === clientRowLeft ? leftRailTop : rightRailTop
        for (let y = top; y < busY; y += 10) {
          dot(ctx, railX, y, 1.3, muted, 0.28)
        }
        for (let packet = 0; packet < 2; packet += 1) {
          const upward = railX === clientRowLeft
          const offset = (railX === clientRowLeft ? 0.16 : 0.6) + packet * 0.48
          const progress = animate ? (now / 6400 + offset) % 1 : 0.32 + packet * 0.34
          const travel = upward ? 1 - progress : progress
          const y = lerp(top, busY, travel)
          const fade = progress > 0.92 ? (1 - progress) / 0.08 : 1
          for (let trail = 1; trail <= 3; trail += 1) {
            dot(ctx, railX, y - (upward ? -trail * 9 : trail * 9), 1.5, accent, fade * (0.4 - trail * 0.09))
          }
          write(ctx, '+', railX, y, accent, 12, 'center', fade * 0.85)
        }
      }

      // 外圈轨道上的巡检信标，让大留白持续有缓慢的环形运动。
      const orbitX = card.left + card.width / 2
      const orbitY = card.top + card.height / 2
      const orbitRx = card.width * 1.15
      const orbitRy = card.height * 0.72
      const orbitAngle = animate ? (now / 24000) * Math.PI * 2 : Math.PI * 1.15
      for (let trail = 3; trail >= 1; trail -= 1) {
        const angle = orbitAngle - trail * 0.045
        dot(
          ctx,
          orbitX + Math.cos(angle) * orbitRx,
          orbitY + Math.sin(angle) * orbitRy,
          1.5,
          accent,
          0.34 - trail * 0.07,
        )
      }
      write(
        ctx,
        '+',
        orbitX + Math.cos(orbitAngle) * orbitRx,
        orbitY + Math.sin(orbitAngle) * orbitRy,
        accent,
        11,
        'center',
        0.82,
      )

      // 卡片即 OmniStore 节点：输入从这里汇入，输出从这里分发；虚线边界圈出它的范围。
      if (frameGlow > 0) {
        const halo = ctx.createRadialGradient(
          cardCenterX,
          cardCenterY,
          Math.min(card.width, card.height) * 0.45,
          cardCenterX,
          cardCenterY,
          Math.max(card.width, card.height) * 0.8,
        )
        halo.addColorStop(0, toRgba(accent, 0.03 + frameGlow * 0.08))
        halo.addColorStop(1, toRgba(accent, 0))
        ctx.fillStyle = halo
        const span = Math.max(card.width, card.height) * 1.2
        ctx.fillRect(cardCenterX - span / 2, cardCenterY - span / 2, span, span)
      }
      ctx.save()
      ctx.strokeStyle = toRgba(accent, 0.34 + frameGlow * 0.36)
      ctx.lineWidth = 1.5
      ctx.lineCap = 'round'
      const bracket = compact ? 20 : 26
      for (const [x, y, dx, dy] of [
        [frame.left, frame.top, 1, 1],
        [frame.left + frame.width, frame.top, -1, 1],
        [frame.left, frame.top + frame.height, 1, -1],
        [frame.left + frame.width, frame.top + frame.height, -1, -1],
      ]) {
        ctx.beginPath()
        ctx.moveTo(x + dx * bracket, y)
        ctx.lineTo(x, y)
        ctx.lineTo(x, y + dy * bracket)
        ctx.stroke()
      }
      ctx.restore()

      const files = ['demo.png', 'notes.pdf', 'assets.zip']
      const clientRows = files.map((file, index) => {
        const rowY = clientY + (index - 1) * clientRowGap
        const fileY = rowY + 2
        const labelY = rowY - 15
        const start = { x: clientRowRight, y: fileY }
        const path = makePath([
          start,
          ...sampleCubic(
            start,
            { x: start.x + 34, y: fileY },
            { x: portLeft.x - 46, y: clientY + (fileY - clientY) * 0.25 },
            portLeft,
            26,
          ).slice(1),
        ])
        drawPathDots(path, 9, 0.5, 1.2)
        return { file, fileY, labelY, path, sendStart: 0.02 + index * 0.028 }
      })

      const endpoints = offsets.map((offset, index) => {
        const y = clientY + offset
        const node = { x: endpointNodeX, y }
        const path = makePath([
          portRight,
          ...sampleCubic(
            portRight,
            { x: portRight.x + 60, y: clientY },
            { x: node.x - 34, y: y - 24 },
            node,
            28,
          ).slice(1),
        ])
        drawPathDots(path, 9, 0.5, 1.2)
        return {
          y,
          node,
          path,
          label: ['LINK', 'SHARE', 'S3'][index],
        }
      })

      write(ctx, '+', portLeft.x, portLeft.y, accent, 13, 'center', 0.6 + frameGlow * 0.4)
      write(ctx, '+', portRight.x, portRight.y, accent, 13, 'center', 0.6 + frameGlow * 0.4)
      if (frameGlow > 0) {
        for (const port of [portLeft, portRight]) {
          for (let index = 0; index < 8; index += 1) {
            const angle = (Math.PI * 2 * index) / 8 + phase * 2
            const radius = 10 + frameGlow * 12
            write(
              ctx,
              frameGlow > 0.5 ? '+' : '·',
              port.x + Math.cos(angle) * radius,
              port.y + Math.sin(angle) * radius,
              accent,
              9,
              'center',
              frameGlow * 0.8,
            )
          }
        }
      }

      // 多个客户端：各自带一个文件直接连到 OmniStore，不共用一个终端框。
      const fileFont = compact ? 11 : 12
      const fileOffset = compact ? 15 : 17
      clientRows.forEach((row, index) => {
        const active = phase >= row.sendStart && phase <= row.sendStart + 0.26
        write(ctx, `CLIENT 0${index + 1}`, clientRowLeft, row.labelY, muted, 9, 'left', 0.7, 600)
        write(ctx, '▣', clientRowLeft, row.fileY, accent, fileFont, 'left', active ? 1 : 0.85, 600)
        write(
          ctx,
          row.file,
          clientRowLeft + fileOffset,
          row.fileY,
          active ? accent : strong,
          fileFont,
          'left',
          active ? 1 : 0.92,
          600,
        )
        ctx.font = `600 ${fileFont}px ${mono}`
        const tetherStart = clientRowLeft + fileOffset + ctx.measureText(row.file).width + 10
        for (let x = tetherStart; x < clientRowRight - 8; x += 9) {
          dot(ctx, x, row.fileY, 1.1, muted, active ? 0.3 : 0.2)
        }
        write(ctx, '+', clientRowRight, row.fileY, active ? accent : muted, 12, 'center', active ? 0.95 : 0.55)
        if (active) write(ctx, '*', clientRowRight + 9, row.fileY - 9, accent, 9, 'center', 0.9)
      })

      // 卡片前的接收/分发端口会在脉冲时闪烁；中心区域被表单遮挡，不额外绘制。
      if (frameGlow > 0) {
        write(ctx, 'IN', portLeft.x - 10, portLeft.y - 20, accent, 9, 'right', frameGlow * 0.8, 600)
        write(ctx, 'OUT', portRight.x + 10, portRight.y - 20, accent, 9, 'left', frameGlow * 0.8, 600)
      }

      // Endpoint labels
      endpoints.forEach((end, index) => {
        const start = 0.34 + index * 0.05
        const local = clamp01((phase - start) / 0.46)
        const active = phase >= start && (local > 0.9 || phase >= start + 0.41) && phase < 0.95
        write(
          ctx,
          `[ ${end.label} ]`,
          endpointNodeX + 12,
          end.y,
          active ? accent : strong,
          labelSize,
          'left',
          active ? 1 : 0.8,
          600,
        )
        write(ctx, '+', end.node.x, end.node.y, active ? accent : muted, 13, 'center', active ? 0.95 : 0.6)
        if (active && fades > 0) {
          write(ctx, '*', end.node.x - 10, end.node.y - 9, accent, 11, 'center', fades)
        }
      })

      // 每个客户端各自发出一个文件包
      clientRows.forEach((row) => {
        const local = (phase - row.sendStart) / 0.24
        if (phase >= row.sendStart && local <= 1) {
          const point = atPath(row.path, ease(clamp01(local)))
          const alpha = local < 0.08 ? local / 0.08 : local > 0.86 ? (1 - local) / 0.14 : 1
          for (let trail = 1; trail <= 3; trail += 1) {
            const trailPoint = atPath(row.path, ease(clamp01(local - trail * 0.05)))
            dot(ctx, trailPoint.x, trailPoint.y, 1.6, accent, clamp01(alpha) * (0.4 - trail * 0.09))
          }
          write(ctx, '[▣]', point.x, point.y, accent, compact ? 11 : 12, 'center', clamp01(alpha), 600)
        }
      })

      // Store -> endpoints packets
      endpoints.forEach((end, index) => {
        const start = 0.34 + index * 0.05
        const local = (phase - start) / 0.46
        if (phase >= start && local <= 1) {
          const point = atPath(end.path, ease(clamp01(local)))
          const alpha = local > 0.9 ? (1 - local) / 0.1 : 1
          write(ctx, '▣', point.x, point.y, accent, compact ? 12 : 14, 'center', clamp01(alpha), 600)
        }
      })
    }

    const loop = (now: number) => {
      if (canvas.offsetWidth > 0) draw(now)
      frame = requestAnimationFrame(loop)
    }

    resize()
    const observer = new ResizeObserver(() => {
      resize()
      if (reduced.matches) draw(0)
    })
    observer.observe(host)
    const anchor = anchorRef?.current
    if (anchor) observer.observe(anchor)

    if (reduced.matches) draw(0)
    else frame = requestAnimationFrame(loop)

    const onMotionChange = () => {
      cancelAnimationFrame(frame)
      if (reduced.matches) draw(0)
      else frame = requestAnimationFrame(loop)
    }
    reduced.addEventListener('change', onMotionChange)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      reduced.removeEventListener('change', onMotionChange)
    }
  }, [resolved, anchorRef])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
