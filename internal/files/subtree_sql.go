package files

// relativePathSubtreeSQL matches one relative path and its descendants at a
// slash-delimited segment boundary. Keep path values out of LIKE expressions:
// '%' and '_' are valid filename characters and must remain literal.
const relativePathSubtreeSQL = `(relative_path = ? OR substr(relative_path, 1, length(?) + 1) = ? || '/')`

func relativePathSubtreeArgs(relPath string) []any {
	return []any{relPath, relPath, relPath}
}

func appendRelativePathSubtreeArgs(args []any, relPath string) []any {
	return append(args, relativePathSubtreeArgs(relPath)...)
}
