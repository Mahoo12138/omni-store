import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import * as css from './Preview.css'

// Markdown 预览：react-markdown + GFM（参考 onedrive-vercel-index）。
// 不启用 rehype-raw：原始 HTML 一律不渲染，从机制上杜绝脚本注入。
export function MarkdownView({ text }: { text: string }) {
  return (
    <div className={`${css.markdown} omnistore-markdown`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noreferrer noopener" />,
          img: (props) => <img {...props} loading="lazy" alt={props.alt ?? ''} />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
