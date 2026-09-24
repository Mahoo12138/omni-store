import { describe, expect, it } from 'vitest'
import { collectDroppedUpload } from './dropFiles'

function transfer(items: object[], files: File[] = []) {
  return { items, files } as unknown as DataTransfer
}

function droppedFile(name: string, contents = name) {
  const file = new File([contents], name, { type: 'text/plain' })
  return {
    kind: 'file',
    getAsFile: () => file,
  }
}

function directoryEntry(name: string, children: Array<Record<string, unknown>>) {
  let read = false
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => ({
      readEntries: (resolve: (entries: Array<Record<string, unknown>>) => void) => {
        if (read) resolve([])
        else {
          read = true
          resolve(children)
        }
      },
    }),
  }
}

function fileEntry(name: string, contents = name) {
  return {
    name,
    isFile: true,
    isDirectory: false,
    file: (resolve: (file: File) => void) => resolve(new File([contents], name, { type: 'text/plain' })),
  }
}

describe('collectDroppedUpload', () => {
  it('classifies and sorts multiple loose files', async () => {
    const result = await collectDroppedUpload(transfer([droppedFile('z.txt'), droppedFile('a.txt')]))
    expect(result.kind).toBe('files')
    expect(result.files.map((file) => file.name)).toEqual(['a.txt', 'z.txt'])
  })

  it('reads nested webkit directory entries and preserves relative paths', async () => {
    const root = directoryEntry('assets', [
      directoryEntry('icons', [fileEntry('logo.txt', 'logo')]),
      fileEntry('cover.txt', 'cover'),
    ])
    const result = await collectDroppedUpload(transfer([{
      kind: 'file',
      getAsFile: () => null,
      webkitGetAsEntry: () => root,
    }]))
    expect(result.kind).toBe('directory')
    expect(result.files.map((file) => (file as File & { webkitRelativePath: string }).webkitRelativePath)).toEqual([
      'assets/cover.txt', 'assets/icons/logo.txt',
    ])
  })

  it('uses FileList as a fallback and keeps existing relative directory paths', async () => {
    const file = new File(['value'], 'value.txt')
    Object.defineProperty(file, 'webkitRelativePath', { value: 'chosen/sub/value.txt' })
    const result = await collectDroppedUpload(transfer([], [file]))
    expect(result.kind).toBe('directory')
    expect(result.files).toEqual([file])
  })
})
