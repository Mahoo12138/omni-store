import { useEffect, useRef, useSyncExternalStore } from 'react'
import { TaskCard, type TaskCardAction } from '../../components/shell/TaskCard'
import { TaskLayerPortal } from '../../components/ui/Toast'
import { formatBytes } from '../../utils/format'
import type { UploadTaskSnapshot } from '../../utils/uploadTask'

// 文件任务卡通过独立任务层（ui/Toast.TaskLayerPortal）常驻显示：
// 父级每秒重建任务快照，但卡片订阅的是稳定 store，避免节点重建导致焦点丢失。
export type PasteTaskSnapshot = {
  status: 'running' | 'completed' | 'completed_with_errors'
  operation: 'copy' | 'cut'
  action?: 'drag'
  total: number
  completed: number
  failed: number
  current: string
  targetPath: string
  errors: string[]
}

export type BatchDeleteTaskSnapshot = {
  status: 'running' | 'completed' | 'completed_with_errors'
  total: number
  completed: number
  failed: number
  current: string
  errors: string[]
}

type StableToastStore<T> = {
  get: () => T
  subscribe: (listener: () => void) => () => void
  set: (next: T) => void
}

function useStableToastStore<T>(initial: T): StableToastStore<T> {
  const ref = useRef<StableToastStore<T> | null>(null)
  if (!ref.current) {
    const state = { value: initial, listeners: new Set<() => void>() }
    ref.current = {
      get: () => state.value,
      subscribe(listener) {
        state.listeners.add(listener)
        return () => { state.listeners.delete(listener) }
      },
      set(next) {
        state.value = next
        state.listeners.forEach((listener) => listener())
      },
    }
  }
  return ref.current
}

export function UploadTaskToastHost({
  task,
  onCancel,
  onRetry,
  onClose,
}: {
  task: UploadTaskSnapshot
  onCancel: () => void
  onRetry: () => void
  onClose: () => void
}) {
  const store = useStableToastStore({ task, onCancel, onRetry, onClose })
  useEffect(() => {
    store.set({ task, onCancel, onRetry, onClose })
  })
  return (
    <TaskLayerPortal>
      <UploadTaskToastView store={store} />
    </TaskLayerPortal>
  )
}

function UploadTaskToastView({ store }: {
  store: StableToastStore<{ task: UploadTaskSnapshot; onCancel: () => void; onRetry: () => void; onClose: () => void }>
}) {
  const state = useSyncExternalStore(store.subscribe, store.get)
  return (
    <UploadTaskToast
      task={state.task}
      onCancel={state.onCancel}
      onRetry={state.onRetry}
      onClose={state.onClose}
    />
  )
}

function UploadTaskToast({
  task,
  onCancel,
  onRetry,
  onClose,
}: {
  task: UploadTaskSnapshot
  onCancel: () => void
  onRetry: () => void
  onClose: () => void
}) {
  const finished = task.completedFiles + task.skippedFiles
  const percent = task.totalBytes > 0
    ? Math.min(100, Math.round((task.uploadedBytes / task.totalBytes) * 100))
    : task.totalFiles > 0
      ? Math.round((finished / task.totalFiles) * 100)
      : 100
  const isRunning = task.status === 'running'
  const statusLabel = {
    queued: '准备上传',
    running: '正在上传',
    completed: '上传完成',
    completed_with_errors: '部分文件失败',
    cancelled: '已取消',
  }[task.status]
  const summary = task.status === 'completed'
    ? `已上传 ${task.completedFiles} 个文件。`
    : `${finished} / ${task.totalFiles} 个文件 · ${formatBytes(task.uploadedBytes)} / ${formatBytes(task.totalBytes)}`
  const errors = task.items
    .filter((item) => item.status === 'failed')
    .map((item) => `${item.relativePath}：${item.error || '上传失败'}`)
  const actions: TaskCardAction[] = []
  if (isRunning) actions.push({ label: '取消上传', onClick: onCancel })
  if (task.failedFiles > 0 && !isRunning) actions.push({ label: '重试失败项', onClick: onRetry })

  return (
    <TaskCard
      label="上传任务"
      title={statusLabel}
      meta={task.status === 'completed'
        ? [summary, `${formatBytes(task.uploadedBytes)} / ${formatBytes(task.totalBytes)}`]
        : [summary]}
      percent={percent}
      progressLabel="上传进度"
      errors={errors}
      actions={actions}
      onClose={!isRunning ? onClose : undefined}
    />
  )
}

export function PasteTaskToastHost({ task, onClose }: { task: PasteTaskSnapshot; onClose: () => void }) {
  const store = useStableToastStore({ task, onClose })
  useEffect(() => {
    store.set({ task, onClose })
  })
  return (
    <TaskLayerPortal>
      <PasteTaskToastView store={store} />
    </TaskLayerPortal>
  )
}

function PasteTaskToastView({ store }: { store: StableToastStore<{ task: PasteTaskSnapshot; onClose: () => void }> }) {
  const state = useSyncExternalStore(store.subscribe, store.get)
  return <PasteTaskToast task={state.task} onClose={state.onClose} />
}

function PasteTaskToast({ task, onClose }: { task: PasteTaskSnapshot; onClose: () => void }) {
  const processed = task.completed + task.failed
  const percent = task.total > 0 ? Math.round((processed / task.total) * 100) : 100
  const verb = task.action === 'drag' ? '移动' : task.operation === 'copy' ? '复制' : '剪切'
  const title = task.status === 'running'
    ? `正在${verb}`
    : task.status === 'completed'
      ? task.action === 'drag' ? '移动完成' : '粘贴完成'
      : task.action === 'drag' ? '移动完成，但有失败项' : '粘贴完成，但有失败项'
  const summary = task.status === 'running'
    ? `${processed} / ${task.total} 项 · 当前：${task.current}`
    : task.failed > 0
      ? `${task.completed} 项成功，${task.failed} 项失败`
      : task.action === 'drag'
        ? `已移动 ${task.completed} 项到 ${task.targetPath}`
        : `已粘贴 ${task.completed} 项到 ${task.targetPath}`

  return (
    <TaskCard
      label={task.action === 'drag' ? '拖拽移动任务' : '粘贴任务'}
      title={title}
      meta={[summary]}
      percent={percent}
      progressLabel="粘贴进度"
      errors={task.errors}
      onClose={task.status !== 'running' ? onClose : undefined}
    />
  )
}

export function BatchDeleteTaskToastHost({ task, onClose }: { task: BatchDeleteTaskSnapshot; onClose: () => void }) {
  const store = useStableToastStore({ task, onClose })
  useEffect(() => {
    store.set({ task, onClose })
  })
  return (
    <TaskLayerPortal>
      <BatchDeleteTaskToastView store={store} />
    </TaskLayerPortal>
  )
}

function BatchDeleteTaskToastView({ store }: { store: StableToastStore<{ task: BatchDeleteTaskSnapshot; onClose: () => void }> }) {
  const state = useSyncExternalStore(store.subscribe, store.get)
  return <BatchDeleteTaskToast task={state.task} onClose={state.onClose} />
}

function BatchDeleteTaskToast({ task, onClose }: { task: BatchDeleteTaskSnapshot; onClose: () => void }) {
  const processed = task.completed + task.failed
  const percent = task.total > 0 ? Math.round((processed / task.total) * 100) : 100
  const title = task.status === 'running'
    ? '正在移入回收站'
    : task.failed > 0
      ? '批量删除完成，但有失败项'
      : '已移入回收站'
  const summary = task.status === 'running'
    ? `${processed} / ${task.total} 项 · 当前：${task.current}`
    : task.failed > 0
      ? `${task.completed} 项成功，${task.failed} 项失败；失败项仍保持选中`
      : `已处理 ${task.completed} 项`

  return (
    <TaskCard
      label="批量删除任务"
      title={title}
      meta={[summary]}
      percent={percent}
      progressLabel="删除进度"
      errors={task.errors}
      onClose={task.status !== 'running' ? onClose : undefined}
    />
  )
}
