import { describe, expect, it } from 'vitest'
import { UploadTaskController, uploadRelativePath } from './uploadTask'

function makeFile(name: string, bytes = 4, relativePath?: string) {
  const file = new File([new Uint8Array(bytes)], name)
  if (relativePath) Object.defineProperty(file, 'webkitRelativePath', { value: relativePath })
  return file
}

describe('uploadRelativePath', () => {
  it('uses the browser-provided folder path when present', () => {
    expect(uploadRelativePath(makeFile('cover.png', 3, 'blog/images/cover.png'))).toBe('blog/images/cover.png')
  })

  it('falls back to the file name for ordinary uploads', () => {
    expect(uploadRelativePath(makeFile('note.txt'))).toBe('note.txt')
  })
})

describe('UploadTaskController', () => {
  it('runs a bounded worker pool and reports completed byte progress', async () => {
    let active = 0
    let maxActive = 0
    const uploaded: string[] = []
    const controller = new UploadTaskController({
      sourceKey: 'primary',
      targetPath: '/',
      files: [makeFile('a.txt', 2), makeFile('b.txt', 3), makeFile('c.txt', 4)],
      kind: 'files',
      conflictPolicy: 'skip',
      concurrency: 2,
      uploader: async (item) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        uploaded.push(item.relativePath)
      },
    })

    await controller.start()

    const snapshot = controller.getSnapshot()
    expect(maxActive).toBe(2)
    expect(uploaded).toEqual(['a.txt', 'b.txt', 'c.txt'])
    expect(snapshot.status).toBe('completed')
    expect(snapshot.completedFiles).toBe(3)
    expect(snapshot.uploadedBytes).toBe(9)
  })

  it('asks once for conflicts and applies the decision to the whole task', async () => {
    let conflictPrompts = 0
    const overwriteCalls: string[] = []
    const controller = new UploadTaskController({
      sourceKey: 'primary',
      targetPath: '/',
      files: [makeFile('a.txt'), makeFile('b.txt')],
      kind: 'files',
      conflictPolicy: 'ask',
      concurrency: 2,
      uploader: async (item, options) => {
        if (!options.overwrite) {
          throw Object.assign(new Error('exists'), { code: 'FILE_ALREADY_EXISTS' })
        }
        overwriteCalls.push(item.relativePath)
      },
      resolveConflict: async () => {
        conflictPrompts += 1
        return 'overwrite'
      },
    })

    await controller.start()

    expect(conflictPrompts).toBe(1)
    expect(overwriteCalls).toEqual(['a.txt', 'b.txt'])
    expect(controller.getSnapshot().status).toBe('completed')
  })

  it('cancels queued and active items without marking them failed', async () => {
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const controller = new UploadTaskController({
      sourceKey: 'primary',
      targetPath: '/',
      files: [makeFile('a.txt'), makeFile('b.txt')],
      kind: 'files',
      conflictPolicy: 'skip',
      concurrency: 1,
      uploader: async () => blocked,
    })

    const running = controller.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.cancel()
    release()
    await running

    const snapshot = controller.getSnapshot()
    expect(snapshot.status).toBe('cancelled')
    expect(snapshot.failedFiles).toBe(0)
    expect(snapshot.items.every((item) => item.status === 'cancelled')).toBe(true)
  })
})
