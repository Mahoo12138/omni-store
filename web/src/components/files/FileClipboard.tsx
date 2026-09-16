import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type FileClipboardOperation = 'copy' | 'cut'

export interface FileClipboardItem {
  id: string
  sourceKey: string
  sourceName: string
  path: string
  name: string
  type: 'file' | 'dir'
}

interface FileClipboardValue {
  operation: FileClipboardOperation | null
  items: FileClipboardItem[]
  copy: (items: FileClipboardItem[]) => void
  cut: (items: FileClipboardItem[]) => void
  clear: () => void
}

const FileClipboardContext = createContext<FileClipboardValue | null>(null)

export function FileClipboardProvider({ children }: { children: ReactNode }) {
  const [clipboard, setClipboard] = useState<Pick<FileClipboardValue, 'operation' | 'items'>>({
    operation: null,
    items: [],
  })

  const value = useMemo<FileClipboardValue>(() => ({
    ...clipboard,
    copy: (items) => setClipboard({ operation: 'copy', items }),
    cut: (items) => setClipboard({ operation: 'cut', items }),
    clear: () => setClipboard({ operation: null, items: [] }),
  }), [clipboard])

  return <FileClipboardContext.Provider value={value}>{children}</FileClipboardContext.Provider>
}

export function useFileClipboard() {
  const value = useContext(FileClipboardContext)
  if (!value) throw new Error('useFileClipboard must be used inside FileClipboardProvider')
  return value
}
