export type UploadConflictPolicy = 'ask' | 'skip' | 'overwrite'
export type UploadItemStatus = 'queued' | 'uploading' | 'succeeded' | 'failed' | 'skipped' | 'cancelled'
export type UploadTaskStatus = 'queued' | 'running' | 'completed' | 'completed_with_errors' | 'cancelled'

export interface UploadTaskItem {
  id: string
  file: File
  relativePath: string
  size: number
  uploadedBytes: number
  status: UploadItemStatus
  error?: string
}

export interface UploadTaskSnapshot {
  id: string
  sourceKey: string
  targetPath: string
  kind: 'file' | 'files' | 'directory'
  conflictPolicy: UploadConflictPolicy
  status: UploadTaskStatus
  totalFiles: number
  completedFiles: number
  failedFiles: number
  skippedFiles: number
  totalBytes: number
  uploadedBytes: number
  items: UploadTaskItem[]
}

export interface UploadTaskUploadOptions {
  overwrite: boolean
  signal: AbortSignal
}

export type UploadTaskUploader = (item: UploadTaskItem, options: UploadTaskUploadOptions) => Promise<void>
export type UploadConflictDecision = 'skip' | 'overwrite' | 'cancel'

export interface UploadTaskControllerOptions {
  sourceKey: string
  targetPath: string
  files: File[]
  kind: 'file' | 'files' | 'directory'
  conflictPolicy: UploadConflictPolicy
  concurrency?: number
  uploader: UploadTaskUploader
  resolveConflict?: (item: UploadTaskItem) => Promise<UploadConflictDecision>
  onChange?: (snapshot: UploadTaskSnapshot) => void
}

function newID() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function uploadRelativePath(file: File): string {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  return (relativePath || file.name).replaceAll('\\', '/')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '上传失败，请重试。'
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'FILE_ALREADY_EXISTS'
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}

export class UploadTaskController {
  private readonly options: UploadTaskControllerOptions
  private readonly items: UploadTaskItem[]
  private readonly abortControllers = new Map<string, AbortController>()
  private readonly concurrency: number
  private readonly taskID = newID()
  private conflictDecision: Exclude<UploadConflictDecision, 'cancel'> | null = null
  private conflictDecisionPromise: Promise<UploadConflictDecision> | null = null
  private cancelRequested = false
  private runningPromise: Promise<void> | null = null
  private status: UploadTaskStatus = 'queued'

  constructor(options: UploadTaskControllerOptions) {
    this.options = options
    this.concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8))
    this.items = options.files.map((file) => ({
      id: newID(),
      file,
      relativePath: uploadRelativePath(file),
      size: file.size,
      uploadedBytes: 0,
      status: 'queued',
    }))
  }

  getSnapshot(): UploadTaskSnapshot {
    const completedFiles = this.items.filter((item) => item.status === 'succeeded').length
    const failedFiles = this.items.filter((item) => item.status === 'failed').length
    const skippedFiles = this.items.filter((item) => item.status === 'skipped').length
    return {
      id: this.taskID,
      sourceKey: this.options.sourceKey,
      targetPath: this.options.targetPath,
      kind: this.options.kind,
      conflictPolicy: this.options.conflictPolicy,
      status: this.status,
      totalFiles: this.items.length,
      completedFiles,
      failedFiles,
      skippedFiles,
      totalBytes: this.items.reduce((sum, item) => sum + item.size, 0),
      uploadedBytes: this.items.reduce((sum, item) => sum + item.uploadedBytes, 0),
      items: this.items.map((item) => ({ ...item })),
    }
  }

  cancel() {
    if (this.status === 'completed' || this.status === 'completed_with_errors' || this.status === 'cancelled') return
    this.cancelRequested = true
    for (const item of this.items) {
      if (item.status === 'queued') item.status = 'cancelled'
    }
    for (const controller of this.abortControllers.values()) controller.abort()
    this.emit()
  }

  async retryFailed() {
    if (this.runningPromise) return
    const failed = this.items.filter((item) => item.status === 'failed')
    if (failed.length === 0) return
    for (const item of failed) {
      item.status = 'queued'
      item.uploadedBytes = 0
      item.error = undefined
    }
    this.cancelRequested = false
    this.status = 'queued'
    this.emit()
    await this.start()
  }

  async start() {
    if (this.runningPromise) return this.runningPromise
    if (!this.items.some((item) => item.status === 'queued')) {
      if (this.status === 'queued') this.status = 'completed'
      this.emit()
      return
    }
    this.cancelRequested = false
    this.status = 'running'
    this.emit()
    this.runningPromise = this.run()
    try {
      await this.runningPromise
    } finally {
      this.runningPromise = null
    }
  }

  private async run() {
    let nextIndex = 0
    const takeNext = () => {
      while (nextIndex < this.items.length) {
        const item = this.items[nextIndex++]
        if (item.status === 'queued') return item
      }
      return null
    }

    const worker = async () => {
      while (!this.cancelRequested) {
        const item = takeNext()
        if (!item) return
        await this.uploadItem(item)
      }
    }

    await Promise.all(Array.from({ length: Math.min(this.concurrency, this.items.length) }, worker))
    if (this.cancelRequested) {
      for (const item of this.items) {
        if (item.status === 'queued' || item.status === 'uploading') item.status = 'cancelled'
      }
      this.status = 'cancelled'
    } else {
      this.status = this.items.some((item) => item.status === 'failed') ? 'completed_with_errors' : 'completed'
    }
    this.emit()
  }

  private async uploadItem(item: UploadTaskItem) {
    item.status = 'uploading'
    item.error = undefined
    const controller = new AbortController()
    this.abortControllers.set(item.id, controller)
    this.emit()

    try {
      const overwrite = this.options.conflictPolicy === 'overwrite'
      await this.options.uploader(item, { overwrite, signal: controller.signal })
      if (this.cancelRequested) {
        item.status = 'cancelled'
        return
      }
      item.uploadedBytes = item.size
      item.status = 'succeeded'
    } catch (error) {
      if (this.cancelRequested || isAbort(error)) {
        item.status = 'cancelled'
        return
      }
      if (isAlreadyExists(error)) {
        const decision = await this.conflictDecisionFor(item)
        if (decision === 'skip') {
          item.status = 'skipped'
          item.uploadedBytes = 0
          return
        }
        if (decision === 'cancel') {
          this.cancelRequested = true
          for (const activeController of this.abortControllers.values()) activeController.abort()
          item.status = 'cancelled'
          return
        }
        try {
          await this.options.uploader(item, { overwrite: true, signal: controller.signal })
          if (this.cancelRequested) {
            item.status = 'cancelled'
            return
          }
          item.uploadedBytes = item.size
          item.status = 'succeeded'
          return
        } catch (retryError) {
          if (this.cancelRequested || isAbort(retryError)) {
            item.status = 'cancelled'
            return
          }
          item.status = 'failed'
          item.error = errorMessage(retryError)
          return
        }
      }
      item.status = 'failed'
      item.error = errorMessage(error)
    } finally {
      this.abortControllers.delete(item.id)
      this.emit()
    }
  }

  private async conflictDecisionFor(item: UploadTaskItem): Promise<UploadConflictDecision> {
    if (this.options.conflictPolicy === 'skip') return 'skip'
    if (this.options.conflictPolicy === 'overwrite') return 'overwrite'
    if (this.conflictDecision) return this.conflictDecision
    if (!this.conflictDecisionPromise) {
      this.conflictDecisionPromise = this.options.resolveConflict?.(item) ?? Promise.resolve('skip')
    }
    const decision = await this.conflictDecisionPromise
    if (decision === 'cancel') return decision
    this.conflictDecision = decision
    return decision
  }

  private emit() {
    this.options.onChange?.(this.getSnapshot())
  }
}
