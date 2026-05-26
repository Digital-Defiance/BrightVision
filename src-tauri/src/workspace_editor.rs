use std::path::{Component, Path, PathBuf};

use crate::git_ops;

const MAX_READ_BYTES: u64 = 2 * 1024 * 1024;
const MAX_LIST_FILES: usize = 8_000;

/// Resolve `rel` under workspace; reject path traversal and paths outside workspace.
pub fn resolve_workspace_file(workspace: &Path, rel: &str) -> Result<PathBuf, String> {
    let workspace = workspace
        .canonicalize()
        .map_err(|e| format!("Workspace not found: {e}"))?;
    let rel = rel.trim().replace('\\', "/");
    if rel.is_empty() {
        return Err("Path is required".into());
    }
    if rel.contains("..") {
        return Err("Invalid path".into());
    }
    let mut joined = workspace.clone();
    for part in Path::new(&rel).components() {
        match part {
            Component::Normal(seg) => joined.push(seg),
            Component::CurDir => {}
            _ => return Err("Invalid path".into()),
        }
    }
    let canon = if joined.exists() {
        joined.canonicalize().map_err(|e| e.to_string())?
    } else {
        if let Some(parent) = joined.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        joined
    };
    if !canon.starts_with(&workspace) {
        return Err("Path must stay inside the project workspace".into());
    }
    Ok(canon)
}

fn should_skip_dir(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "target" | "dist" | ".venv" | "__pycache__" | ".cecli"
    )
}

fn list_via_git(workspace: &Path) -> Result<Vec<String>, String> {
    let out = git_ops::run_git(workspace, &["ls-files"])?;
    let mut files: Vec<String> = out
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(|l| l.replace('\\', "/"))
        .collect();
    files.sort();
    files.dedup();
    if files.len() > MAX_LIST_FILES {
        files.truncate(MAX_LIST_FILES);
    }
    Ok(files)
}

fn list_via_walk(workspace: &Path) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    walk_files(workspace, workspace, &mut files, 0)?;
    files.sort();
    files.dedup();
    if files.len() > MAX_LIST_FILES {
        files.truncate(MAX_LIST_FILES);
    }
    Ok(files)
}

fn walk_files(
    workspace: &Path,
    dir: &Path,
    out: &mut Vec<String>,
    depth: usize,
) -> Result<(), String> {
    if out.len() >= MAX_LIST_FILES || depth > 12 {
        return Ok(());
    }
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries {
        if out.len() >= MAX_LIST_FILES {
            break;
        }
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') && name != ".aider-vision" {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            if should_skip_dir(&name) {
                continue;
            }
            walk_files(workspace, &path, out, depth + 1)?;
        } else if path.is_file() {
            let rel = path
                .strip_prefix(workspace)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            out.push(rel);
        }
    }
    Ok(())
}

pub fn list_workspace_files(workspace: &Path) -> Result<Vec<String>, String> {
    if !workspace.is_dir() {
        return Err(format!("Not a directory: {}", workspace.display()));
    }
    if git_ops::run_git(workspace, &["rev-parse", "--is-inside-work-tree"]).is_ok() {
        if let Ok(files) = list_via_git(workspace) {
            if !files.is_empty() {
                return Ok(files);
            }
        }
    }
    list_via_walk(workspace)
}

pub fn read_text_file(workspace: &Path, rel: &str) -> Result<String, String> {
    let full = resolve_workspace_file(workspace, rel)?;
    if !full.is_file() {
        return Err(format!("Not a file: {rel}"));
    }
    let meta = std::fs::metadata(&full).map_err(|e| e.to_string())?;
    if meta.len() > MAX_READ_BYTES {
        return Err(format!(
            "File too large to open in editor (max {} MB)",
            MAX_READ_BYTES / (1024 * 1024)
        ));
    }
    std::fs::read_to_string(&full).map_err(|e| format!("Read failed: {e}"))
}

pub fn write_text_file(workspace: &Path, rel: &str, content: &str) -> Result<(), String> {
    let full = resolve_workspace_file(workspace, rel)?;
    if full.is_dir() {
        return Err(format!("Not a file: {rel}"));
    }
    std::fs::write(&full, content).map_err(|e| format!("Write failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn rejects_parent_traversal() {
        let dir = std::env::temp_dir().join("bv-editor-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        assert!(resolve_workspace_file(&dir, "../etc/passwd").is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
