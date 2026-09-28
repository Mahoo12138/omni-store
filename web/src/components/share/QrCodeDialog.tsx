import { QRCodeSVG } from 'qrcode.react'
import { IconClose } from '../ui/Icon'
import * as css from './QrCode.css'

// 分享链接二维码弹层（1.2.0）：手机扫码直接访问分享页。
export function QrCodeDialog({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  return (
    <div className={css.overlay} role="dialog" aria-modal="true" aria-label={`${name} 的二维码`} onClick={onClose}>
      <section className={css.card} onClick={(event) => event.stopPropagation()}>
        <button type="button" className={css.close} onClick={onClose} aria-label="关闭二维码">
          <IconClose size={18} />
        </button>
        <h2 className={css.title}>扫码访问「{name}」</h2>
        <div className={css.qrWrap}>
          <QRCodeSVG value={url} size={200} level="M" marginSize={2} />
        </div>
        <p className={css.urlText}>{url}</p>
      </section>
    </div>
  )
}
