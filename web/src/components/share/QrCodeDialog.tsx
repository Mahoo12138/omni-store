import { QRCodeSVG } from 'qrcode.react'
import { DialogWrap } from '../ui/Dialog'
import { useStyles } from './QrCode.styles'

// 分享链接二维码弹层（1.2.0）：手机扫码直接访问分享页。
export function QrCodeDialog({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const css = useStyles()
  return (
    <DialogWrap open onOpenChange={(open) => { if (!open) onClose() }} title={`${name} 的二维码`}>
      <div className={css.qrWrap}>
        <QRCodeSVG value={url} size={200} level="M" marginSize={2} />
      </div>
      <p className={css.urlText}>{url}</p>
    </DialogWrap>
  )
}
