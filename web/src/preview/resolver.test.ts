import { describe, expect, it } from 'vitest'
import { extOf, PREVIEW_CAPS, resolvePreview } from './resolver'

describe('extOf', () => {
  it('提取小写扩展名', () => {
    expect(extOf('photo.JPG')).toBe('jpg')
    expect(extOf('archive.tar.gz')).toBe('gz')
  })
  it('无扩展名或点开头返回空', () => {
    expect(extOf('README')).toBe('')
    expect(extOf('.gitignore')).toBe('')
    expect(extOf('file.')).toBe('')
  })
})

describe('resolvePreview', () => {
  it('图片/音视频/PDF 走对应渲染器', () => {
    expect(resolvePreview({ name: 'a.png', size: 100 })).toBe('image')
    expect(resolvePreview({ name: 'a.mp3' })).toBe('audio')
    expect(resolvePreview({ name: 'a.mp4', size: 1 << 20 })).toBe('video')
    expect(resolvePreview({ name: 'doc.pdf', size: 1 << 20 })).toBe('pdf')
  })

  it('文本族按扩展名分流', () => {
    expect(resolvePreview({ name: 'notes.txt' })).toBe('text')
    expect(resolvePreview({ name: 'app.log', size: 4096 })).toBe('text')
    expect(resolvePreview({ name: 'guide.md' })).toBe('markdown')
    expect(resolvePreview({ name: 'data.json' })).toBe('json')
    expect(resolvePreview({ name: 'config.yaml' })).toBe('yaml')
    expect(resolvePreview({ name: 'main.go' })).toBe('code')
    expect(resolvePreview({ name: 'run.sh' })).toBe('code')
  })

  it('活动内容不预览：HTML/SVG 以外的 js/html 直接回退下载', () => {
    expect(resolvePreview({ name: 'index.html' })).toBe('unsupported')
    expect(resolvePreview({ name: 'app.js' })).toBe('unsupported')
  })

  it('SVG 以图片语义预览，但受 blob 体积上限约束', () => {
    expect(resolvePreview({ name: 'icon.svg', size: 1024 })).toBe('image')
    expect(resolvePreview({ name: 'huge.svg', size: PREVIEW_CAPS.SVG_BLOB_BYTES + 1 })).toBe('unsupported')
  })

  it('超过大小上限的文本/PDF/Markdown 回退下载', () => {
    expect(resolvePreview({ name: 'huge.log', size: PREVIEW_CAPS.TEXT_BYTES + 1 })).toBe('unsupported')
    expect(resolvePreview({ name: 'big.pdf', size: PREVIEW_CAPS.PDF_BLOB_BYTES + 1 })).toBe('unsupported')
    expect(resolvePreview({ name: 'big.md', size: PREVIEW_CAPS.MARKDOWN_BYTES + 1 })).toBe('unsupported')
    expect(resolvePreview({ name: 'big.json', size: PREVIEW_CAPS.JSON_BYTES + 1 })).toBe('unsupported')
  })

  it('未知或二进制类型回退下载', () => {
    expect(resolvePreview({ name: 'setup.exe' })).toBe('unsupported')
    expect(resolvePreview({ name: 'backup.zip' })).toBe('unsupported')
    expect(resolvePreview({ name: 'report.docx' })).toBe('unsupported')
    expect(resolvePreview({ name: 'noext' })).toBe('unsupported')
  })
})
