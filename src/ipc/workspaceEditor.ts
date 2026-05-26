import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime } from './isTauri'

export async function listWorkspaceFiles(workingDir: string): Promise<string[]> {
  if (!isTauriRuntime()) return []
  return invoke<string[]>('list_workspace_files_cmd', {
    workingDir: workingDir || '.',
  })
}

export async function readWorkspaceTextFile(
  workingDir: string,
  path: string
): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error('Open in editor requires the desktop app')
  }
  return invoke<string>('read_workspace_text_file', {
    workingDir: workingDir || '.',
    path,
  })
}

export async function writeWorkspaceTextFile(
  workingDir: string,
  path: string,
  content: string
): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error('Save requires the desktop app')
  }
  await invoke('write_workspace_text_file', {
    workingDir: workingDir || '.',
    path,
    content,
  })
}
