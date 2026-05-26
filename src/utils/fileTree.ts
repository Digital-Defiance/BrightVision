/** Build a shallow tree from workspace-relative file paths (for the editor explorer). */

export interface FileTreeNode {
  name: string
  /** Workspace-relative path (file path, or directory with trailing segment name only in tree). */
  path: string
  isDir: boolean
  children?: FileTreeNode[]
}

export function buildFileTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = []
  const dirIndex = new Map<string, FileTreeNode>()

  const ensureDir = (dirPath: string, name: string): FileTreeNode => {
    const existing = dirIndex.get(dirPath)
    if (existing) return existing
    const node: FileTreeNode = {
      name,
      path: dirPath,
      isDir: true,
      children: [],
    }
    dirIndex.set(dirPath, node)
    if (dirPath.includes('/')) {
      const parentPath = dirPath.slice(0, dirPath.lastIndexOf('/'))
      const parentName = parentPath.includes('/')
        ? parentPath.slice(parentPath.lastIndexOf('/') + 1)
        : parentPath
      const parent = ensureDir(parentPath, parentName)
      parent.children!.push(node)
    } else {
      root.push(node)
    }
    return node
  }

  for (const filePath of paths) {
    const normalized = filePath.replace(/\\/g, '/').trim()
    if (!normalized) continue
    const parts = normalized.split('/')
    const fileName = parts[parts.length - 1]!
    if (parts.length === 1) {
      root.push({ name: fileName, path: normalized, isDir: false })
      continue
    }
    const dirPath = parts.slice(0, -1).join('/')
    const dirName = parts[parts.length - 2]!
    const dir = ensureDir(dirPath, dirName)
    dir.children!.push({ name: fileName, path: normalized, isDir: false })
  }

  const sortNodes = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const n of nodes) {
      if (n.children?.length) sortNodes(n.children)
    }
  }
  sortNodes(root)
  return root
}

export function filterFileTree(nodes: FileTreeNode[], query: string): FileTreeNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return nodes

  const walk = (list: FileTreeNode[]): FileTreeNode[] => {
    const out: FileTreeNode[] = []
    for (const node of list) {
      if (node.isDir) {
        const children = node.children ? walk(node.children) : []
        if (children.length || node.name.toLowerCase().includes(q)) {
          out.push({ ...node, children })
        }
      } else if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
        out.push(node)
      }
    }
    return out
  }
  return walk(nodes)
}
