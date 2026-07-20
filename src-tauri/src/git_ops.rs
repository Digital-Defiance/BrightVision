use std::path::Path;
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct GitGraphNode {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
    pub timestamp: i64,
    pub parents: Vec<String>,
    pub is_merge: bool,
}

pub fn run_git(workspace: &Path, args: &[&str]) -> Result<String, String> {
    let out = std::process::Command::new("git")
        .arg("-C")
        .arg(workspace)
        .args(args)
        .output()
        .map_err(|e| format!("git failed to run: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(stderr.trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Parse one `git log` line: %H %h %P %s %ct (parents space-separated).
pub fn parse_graph_log_line(line: &str) -> Option<GitGraphNode> {
    let mut fields = line.split('\x1f');
    let hash = fields.next()?.trim().to_string();
    if hash.is_empty() {
        return None;
    }
    let short_hash = fields.next()?.trim().to_string();
    let parents_raw = fields.next()?.trim();
    let subject = fields.next()?.trim().to_string();
    let ts = fields.next()?.trim().parse::<i64>().unwrap_or(0);
    let parents: Vec<String> = parents_raw
        .split_whitespace()
        .filter(|p| !p.is_empty())
        .map(|p| p.to_string())
        .collect();
    let is_merge = parents.len() > 1;
    Some(GitGraphNode {
        hash,
        short_hash,
        subject,
        timestamp: ts,
        parents,
        is_merge,
    })
}

pub fn commit_graph(workspace: &Path, limit: u32) -> Result<Vec<GitGraphNode>, String> {
    if !workspace.is_dir() {
        return Err(format!("Not a directory: {}", workspace.display()));
    }
    if run_git(workspace, &["rev-parse", "--is-inside-work-tree"]).is_err() {
        return Err("Not a git repository".into());
    }
    let n = limit.clamp(1, 50);
    let out = run_git(
        workspace,
        &[
            "log",
            &format!("-{n}"),
            "--format=%H%x1f%h%x1f%P%x1f%s%x1f%ct",
        ],
    )?;
    Ok(out.lines().filter_map(parse_graph_log_line).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;

    fn os_devnull() -> &'static str {
        if cfg!(windows) {
            "nul"
        } else {
            "/dev/null"
        }
    }

    #[test]
    fn parse_graph_line_root_commit() {
        let line = "abc123def4567890\x1fabc123d\x1f\x1finitial\x1f1700000000";
        let node = parse_graph_log_line(line).unwrap();
        assert_eq!(node.hash, "abc123def4567890");
        assert_eq!(node.short_hash, "abc123d");
        assert!(node.parents.is_empty());
        assert!(!node.is_merge);
        assert_eq!(node.subject, "initial");
    }

    #[test]
    fn parse_graph_line_merge_commit() {
        let line = "fullhash\x1fshort\x1fparent1 parent2\x1fmerge branch\x1f1700000001";
        let node = parse_graph_log_line(line).unwrap();
        assert_eq!(node.parents, vec!["parent1", "parent2"]);
        assert!(node.is_merge);
    }

    #[test]
    fn commit_graph_linear_repo() {
        // Under workspace target/ so sandboxed `cargo test` can run `git init` (system temp may be blocked).
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join(format!("git-graph-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let git = |args: &[&str]| {
            // Isolate from global identity/hooks templates (e.g. ~/.git-templates/hooks).
            let hooks = format!("core.hooksPath={}", os_devnull());
            let out = Command::new("git")
                .env("GIT_CONFIG_GLOBAL", os_devnull())
                .env("GIT_CONFIG_SYSTEM", os_devnull())
                .args(["-c", &hooks])
                .args(args)
                .current_dir(&dir)
                .output()
                .expect("git command");
            assert!(
                out.status.success(),
                "git {:?} failed: {}",
                args,
                String::from_utf8_lossy(&out.stderr)
            );
            out
        };
        git(&["init"]);
        assert!(dir.join(".git").is_dir(), "expected fresh repo under {dir:?}");
        git(&["config", "core.hooksPath", os_devnull()]);
        git(&["config", "user.email", "t@test.com"]);
        git(&["config", "user.name", "Test"]);
        fs::write(dir.join("a.txt"), "1\n").unwrap();
        git(&["add", "a.txt"]);
        git(&["commit", "-m", "first"]);
        fs::write(dir.join("a.txt"), "2\n").unwrap();
        git(&["add", "a.txt"]);
        git(&["commit", "-m", "second"]);

        let graph = commit_graph(&dir, 10).unwrap();
        assert_eq!(graph.len(), 2);
        assert_eq!(graph[0].subject, "second");
        assert_eq!(graph[1].subject, "first");
        assert_eq!(graph[0].parents.len(), 1);
        assert_eq!(graph[0].parents[0], graph[1].hash);

        let _ = fs::remove_dir_all(&dir);
    }
}
