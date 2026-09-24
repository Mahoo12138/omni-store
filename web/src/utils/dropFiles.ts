export type DroppedUploadKind = 'file' | 'files' | 'directory'

export interface DroppedUpload {
  files: File[]
  kind: DroppedUploadKind
}

interface DirectoryHandleWithEntries extends FileSystemDirectoryHandle {
  values: () => AsyncIterableIterator<FileSystemFileHandle | DirectoryHandleWithEntries>
}

interface WebkitFileEntry {
  name: string
  isFile: boolean
  isDirectory: boolean
  file: (success: (file: File) => void, error: (error: DOMException) => void) => void
  createReader: () => {
    readEntries: (success: (entries: WebkitFileEntry[]) => void, error: (error: DOMException) => void) => void
  }
}

type ExtendedDataTransferItem = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>
}

export async function collectDroppedUpload(dataTransfer: DataTransfer): Promise<DroppedUpload> {
  const items = Array.from(dataTransfer.items).filter((item) => item.kind === 'file') as ExtendedDataTransferItem[]
  if (items.length === 0) return fromFlatFiles(Array.from(dataTransfer.files))

  // DataTransfer is only readable during the drop event. Snapshot each item's
  // file handle/legacy entry/file before yielding to any asynchronous work.
  const candidates = items.map((item) => ({
    handlePromise: item.getAsFileSystemHandle?.().catch(() => null),
    entry: (item as unknown as { webkitGetAsEntry?: () => WebkitFileEntry | null }).webkitGetAsEntry?.() ?? null,
    file: item.getAsFile(),
  }))
  const files: File[] = []
  let containsDirectory = false
  for (const candidate of candidates) {
    const handle = await candidate.handlePromise
    if (handle) {
      if (handle.kind === 'directory') {
        containsDirectory = true
        files.push(...await readHandleDirectory(handle as DirectoryHandleWithEntries, handle.name))
      } else {
        const fileHandle = handle as FileSystemFileHandle
        files.push(withRelativePath(await fileHandle.getFile(), fileHandle.name))
      }
      continue
    }

    const entry = candidate.entry
    if (entry) {
      if (entry.isDirectory) containsDirectory = true
      files.push(...await readWebkitEntry(entry))
      continue
    }

    const file = candidate.file
    if (file) files.push(file)
  }

  if (files.length === 0) return fromFlatFiles(Array.from(dataTransfer.files))
  files.sort((left, right) => uploadPath(left).localeCompare(uploadPath(right)))
  return { files, kind: containsDirectory ? 'directory' : files.length === 1 ? 'file' : 'files' }
}

async function readHandleDirectory(directory: DirectoryHandleWithEntries, parentPath: string): Promise<File[]> {
  const files: File[] = []
  for await (const handle of directory.values()) {
    const relativePath = `${parentPath}/${handle.name}`
    if (handle.kind === 'directory') {
      files.push(...await readHandleDirectory(handle as DirectoryHandleWithEntries, relativePath))
    } else {
      files.push(withRelativePath(await (handle as FileSystemFileHandle).getFile(), relativePath))
    }
  }
  return files
}

async function readWebkitEntry(entry: WebkitFileEntry, parentPath = ''): Promise<File[]> {
  const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject))
    return [withRelativePath(file, relativePath)]
  }
  if (!entry.isDirectory) return []

  const reader = entry.createReader()
  const children: WebkitFileEntry[] = []
  while (true) {
    const batch = await new Promise<WebkitFileEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (batch.length === 0) break
    children.push(...batch)
  }
  const nested = await Promise.all(children.map((child) => readWebkitEntry(child, relativePath)))
  return nested.flat()
}

function fromFlatFiles(files: File[]): DroppedUpload {
  const containsDirectory = files.some((file) => uploadPath(file).includes('/'))
  return {
    files: files.sort((left, right) => uploadPath(left).localeCompare(uploadPath(right))),
    kind: containsDirectory ? 'directory' : files.length === 1 ? 'file' : 'files',
  }
}

function uploadPath(file: File): string {
  return ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replaceAll('\\', '/')
}

function withRelativePath(file: File, relativePath: string): File {
  const copy = new File([file], file.name, { type: file.type, lastModified: file.lastModified })
  Object.defineProperty(copy, 'webkitRelativePath', { value: relativePath })
  return copy
}
