// 存储源内的路径运算：所有入口先归一化，避免 //、尾斜杠与相对段混用。
export function normalizePath(path: string) {
  const normalized = `/${path.replace(/^\/+/, '').replace(/\/+$/, '')}`
  return normalized === '/' ? '/' : normalized
}

export function joinPath(directory: string, name: string) {
  const normalized = normalizePath(directory)
  return normalized === '/' ? `/${name}` : `${normalized}/${name}`
}

export function parentPath(path: string) {
  const normalized = normalizePath(path)
  const slash = normalized.lastIndexOf('/')
  return slash <= 0 ? '/' : normalized.slice(0, slash)
}

export function isPathInside(path: string, directory: string) {
  const normalizedPath = normalizePath(path)
  const normalizedDirectory = normalizePath(directory)
  return normalizedPath === normalizedDirectory || normalizedPath.startsWith(`${normalizedDirectory}/`)
}
