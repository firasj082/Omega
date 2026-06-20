use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;
use rayon::prelude::*;
use regex::RegexSet;
use walkdir::{DirEntry, WalkDir};

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

// ─── Cache Types ─────────────────────────────────────────────────────────────

#[derive(Clone, Default)]
pub struct FileEntry {
    pub hash: u64,
    pub tags: Vec<String>,
    pub description: Option<String>,
    pub exports: Vec<String>,
}

/// Project root (String) → file path → FileEntry
pub type MapCache = Arc<Mutex<HashMap<String, HashMap<PathBuf, FileEntry>>>>;

// ─── Ignore List ─────────────────────────────────────────────────────────────

static IGNORE_DIRS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    [
        "node_modules", ".git", "dist", "build", ".next", "out",
        "__pycache__", "target", ".turbo", ".cache", "coverage",
        ".venv", "venv", "env", ".env", "vendor", "tmp", "temp",
        ".idea", ".vscode", "uploads", "logs", "migrations", "fixtures",
        "icons", "assets", "public", "static", "images", "img", "fonts", "media",
    ]
    .into_iter()
    .collect()
});

static BINARY_EXTENSIONS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    [
        "png", "jpg", "jpeg", "gif", "ico", "icns", "webp", "svg", "bmp", "tiff", "ttf", "woff", "woff2",
    ]
    .into_iter()
    .collect()
});

// ─── Hash ────────────────────────────────────────────────────────────────────

fn hash_file_content(content: &[u8]) -> u64 {
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    hasher.finish()
}

// ─── Description Extraction ──────────────────────────────────────────────────

fn extract_description(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_str()?;
    let content = fs::read_to_string(path).ok()?;
    match ext {
        "ts" | "tsx" | "js" | "jsx" => extract_js_description(&content),
        "rs" => extract_rust_description(&content),
        _ => None,
    }
}

fn extract_js_description(content: &str) -> Option<String> {
    // Try /** ... */ JSDoc at the top
    if let Some(start) = content.find("/**") {
        if let Some(end) = content[start..].find("*/") {
            if end >= 3 {
                let inner = &content[start + 3..start + end];
                let first = inner
                    .lines()
                    .map(|l| l.trim().trim_start_matches('*').trim())
                    .find(|l| !l.is_empty() && !l.starts_with('@'))?;
                if first.len() > 4 {
                    return Some(first.to_string());
                }
            }
        }
    }
    // Fallback: @description tag
    content
        .lines()
        .find(|l| l.contains("@description"))
        .and_then(|l| l.split("@description").nth(1))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn extract_rust_description(content: &str) -> Option<String> {
    // //! module-level doc comment
    let line = content
        .lines()
        .take(20)
        .find(|l| l.trim().starts_with("//!"))?;
    let desc = line.trim().trim_start_matches("//!").trim().to_string();
    if desc.is_empty() { None } else { Some(desc) }
}

// ─── Export Extraction ───────────────────────────────────────────────────────

fn extract_exports(path: &Path) -> Vec<String> {
    let ext = match path.extension().and_then(|e| e.to_str()) {
        Some(e) => e,
        None => return vec![],
    };
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    match ext {
        "ts" | "tsx" | "js" | "jsx" => extract_js_exports(&content),
        "rs" => extract_rust_pub_items(&content),
        _ => vec![],
    }
}

fn extract_js_exports(content: &str) -> Vec<String> {
    let prefixes = [
        "export const ",
        "export function ",
        "export async function ",
        "export class ",
        "export type ",
        "export interface ",
        "export enum ",
        "export default function ",
    ];
    let mut exports = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        for prefix in &prefixes {
            if line.starts_with(prefix) {
                let rest = &line[prefix.len()..];
                let name: String = rest
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || *c == '_')
                    .collect();
                if !name.is_empty() {
                    exports.push(name);
                }
                break;
            }
        }
        if exports.len() >= 4 {
            break;
        }
    }
    exports
}

fn extract_rust_pub_items(content: &str) -> Vec<String> {
    let prefixes = [
        "pub fn ", "pub async fn ", "pub struct ",
        "pub enum ", "pub trait ", "pub type ",
    ];
    let mut items = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        for prefix in &prefixes {
            if line.starts_with(prefix) {
                let rest = &line[prefix.len()..];
                let name: String = rest
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || *c == '_')
                    .collect();
                if !name.is_empty() {
                    items.push(name);
                }
                break;
            }
        }
        if items.len() >= 4 {
            break;
        }
    }
    items
}

// ─── Framework Detection ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq)]
enum Framework {
    NextJs,
    Express,
    Tauri,
    Vite,
    Rust,
    Spring,
    Unknown,
}

fn detect_framework(root: &Path) -> Framework {
    if root.join("src-tauri").join("Cargo.toml").is_file() {
        return Framework::Tauri;
    }
    if root.join("Cargo.toml").is_file() {
        return Framework::Rust;
    }
    if root.join("pom.xml").is_file()
        || root.join("build.gradle").is_file()
        || root.join("build.gradle.kts").is_file()
    {
        return Framework::Spring;
    }
    let pkg_path = root.join("package.json");
    if pkg_path.is_file() {
        if let Ok(content) = fs::read_to_string(&pkg_path) {
            let lower = content.to_lowercase();
            if lower.contains("\"next\"") || lower.contains("'next'") {
                return Framework::NextJs;
            }
            if lower.contains("\"express\"") || lower.contains("'express'")
                || lower.contains("\"fastify\"") || lower.contains("'fastify'")
            {
                return Framework::Express;
            }
            if lower.contains("\"vite\"") || lower.contains("'vite'") {
                return Framework::Vite;
            }
        }
    }
    if root.join("next.config.ts").is_file()
        || root.join("next.config.js").is_file()
        || root.join("next.config.mjs").is_file()
    {
        return Framework::NextJs;
    }
    if root.join("vite.config.ts").is_file() || root.join("vite.config.js").is_file() {
        return Framework::Vite;
    }
    Framework::Unknown
}

// ─── Classifier ──────────────────────────────────────────────────────────────

struct TagRule {
    tag: &'static str,
}

struct Classifier {
    regex_set: RegexSet,
    tags: Vec<TagRule>,
}

impl Classifier {
    fn new(framework: Framework) -> Self {
        let mut patterns: Vec<String> = Vec::new();
        let mut tags: Vec<TagRule> = Vec::new();

        let mut add = |pattern: &str, tag: &'static str| {
            patterns.push(pattern.to_string());
            tags.push(TagRule { tag });
        };

        // ── Generic patterns (always active) ──────────────────────────────

        add(r"(?:^|/)main\.(ts|tsx|js|jsx|py|rs|go)$", "entry");
        add(r"(?:^|/)index\.(ts|tsx|js|jsx)$", "entry");
        add(r"(?:^|/)app\.(ts|tsx|py)$", "entry");
        add(r"(?:^|/)server\.(ts|js)$", "entry");
        add(r"(?:^|/)lib\.rs$", "entry");

        add(r"(?:^|/)(?:tsconfig|jest|vitest|eslint|prettier|babel|postcss|tailwind)\.config\.(ts|js|mjs|cjs|json)$", "config");
        add(r"(?:^|/)pyproject\.toml$", "config");
        add(r"(?:^|/)go\.mod$", "config");
        add(r"(?:^|/)Cargo\.toml$", "config");
        add(r"(?:^|/)\.env(?:\..*)?$", "config");
        add(r"(?:^|/)package\.json$", "config");
        add(r"(?:^|/)Dockerfile(?:\..+)?$", "config");
        add(r"(?:^|/)docker-compose\.ya?ml$", "config");
        add(r"(?:^|/)\.gitignore$", "config");
        add(r"(?:^|/)Makefile$", "config");
        add(r"(?:^|/)tsconfig(?:\..+)?\.json$", "config");

        add(r"(?:^|/)types\.(ts|py)$", "types");
        add(r"(?:^|/)types/index\.(ts|js)$", "types");
        add(r"[^/]\.d\.ts$", "types");
        add(r"(?:^|/)interfaces\.(ts|py)$", "types");

        add(r"(?:^|/)schema\.(ts|js|py|prisma)$", "schema");
        add(r"(?:^|/)models\.(py|ts|js)$", "schema");
        add(r"[^/]\.entity\.(ts|js)$", "schema");
        add(r"(?:^|/)prisma/schema\.prisma$", "schema");

        add(r"(?:^|/)middleware\.(ts|js|py)$", "middleware");

        add(r"[^/]\.test\.(ts|tsx|js|jsx)$", "test");
        add(r"[^/]\.spec\.(ts|tsx|js|jsx)$", "test");
        add(r"(?:^|/)test_[^/]+\.py$", "test");
        add(r"(?:^|/)__tests__/", "test");
        add(r"(?:^|/)tests?/", "test");

        add(r"[^/]\.css$", "style");
        add(r"[^/]\.scss$", "style");
        add(r"[^/]\.module\.css$", "style");

        add(r"(?:^|/)utils?/[^/]+\.(ts|js|py)$", "util");
        add(r"(?:^|/)helpers?/[^/]+\.(ts|js|py)$", "util");
        add(r"(?:^|/)lib/[^/]+\.(ts|js)$", "util");
        add(r"(?:^|/)writers/.+\.(ts|js)$", "util");
        add(r"(?:^|/)templates/.+\.(ts|js)$", "template");

        add(r"(?:^|/)router\.(ts|tsx|js|jsx)$", "routing");
        add(r"(?:^|/)routes\.(ts|tsx|js|jsx)$", "routing");
        add(r"(?:^|/)RouterConfig\.(ts|tsx)$", "routing");
        add(r"(?:^|/)[^/]*Router\.(ts|tsx)$", "routing");

        add(r"[^/]\.(tsx|jsx|vue)$", "component");

        add(r"(?:^|/)pages?/[^/]+\.(tsx|jsx|vue|ts|js)$", "page");
        add(r"(?:^|/)views?/[^/]+\.(tsx|jsx|vue|ts|js)$", "page");
        add(r"(?:^|/)app/page\.(ts|tsx|js|jsx)$", "page");
        add(r"(?:^|/)app/.+/page\.(ts|tsx|js|jsx)$", "page");

        // ── Framework-specific patterns ───────────────────────────────────

        match framework {
            Framework::NextJs => {
                add(r"(?:^|/)next\.config\.(ts|js|mjs)$", "config");
                add(r"(?:^|/)app/page\.(ts|tsx|js|jsx)$", "routing");
                add(r"(?:^|/)app/.+/page\.(ts|tsx|js|jsx)$", "routing");
                add(r"(?:^|/)app/layout\.(ts|tsx|js|jsx)$", "routing");
                add(r"(?:^|/)app/.+/layout\.(ts|tsx|js|jsx)$", "routing");
                add(r"(?:^|/)app/loading\.(ts|tsx)$", "routing");
                add(r"(?:^|/)app/error\.(ts|tsx)$", "routing");
                add(r"(?:^|/)app/not-found\.(ts|tsx)$", "routing");
                add(r"(?:^|/)app/api/.+/route\.(ts|js)$", "api");
                add(r"(?:^|/)pages/api/.+\.(ts|js)$", "api");
                add(r"(?:^|/)middleware\.(ts|js)$", "middleware");
                add(r"(?:^|/)components?/[^/]+\.(tsx|jsx)$", "component");
                add(r"(?:^|/)components?/.+/[^/]+\.(tsx|jsx)$", "component");
                add(r"(?:^|/)store/[^/]+\.(ts|tsx)$", "state");
                add(r"(?:^|/)context/[^/]+\.(ts|tsx)$", "state");
            }
            Framework::Vite => {
                add(r"(?:^|/)vite\.config\.(ts|js)$", "config");
                add(r"(?:^|/)src/router\.(ts|tsx|js)$", "routing");
                add(r"(?:^|/)src/routes\.(ts|tsx|js)$", "routing");
                add(r"(?:^|/)src/routes/[^/]+\.(ts|tsx|js|jsx)$", "routing");
                add(r"(?:^|/)src/api/[^/]+\.(ts|js)$", "api");
                add(r"(?:^|/)src/services/[^/]+\.(ts|js)$", "api");
                add(r"(?:^|/)src/components?/[^/]+\.(tsx|jsx|vue)$", "component");
                add(r"(?:^|/)src/components?/.+/[^/]+\.(tsx|jsx|vue)$", "component");
                add(r"(?:^|/)src/store/[^/]+\.(ts|tsx)$", "state");
                add(r"(?:^|/)src/stores/[^/]+\.(ts|tsx)$", "state");
                add(r"(?:^|/)src/context/[^/]+\.(ts|tsx)$", "state");
            }
            Framework::Tauri => {
                add(r"(?:^|/)vite\.config\.(ts|js)$", "config");
                add(r"(?:^|/)src/router\.(ts|tsx|js)$", "routing");
                add(r"(?:^|/)src/routes\.(ts|tsx|js)$", "routing");
                add(r"(?:^|/)src/routes/[^/]+\.(ts|tsx|js|jsx)$", "routing");
                add(r"(?:^|/)src/api/[^/]+\.(ts|js)$", "api");
                add(r"(?:^|/)src/services/[^/]+\.(ts|js)$", "api");
                add(r"(?:^|/)src/components?/[^/]+\.(tsx|jsx|vue)$", "component");
                add(r"(?:^|/)src/components?/.+/[^/]+\.(tsx|jsx|vue)$", "component");
                add(r"(?:^|/)src/store/[^/]+\.(ts|tsx)$", "state");
                add(r"(?:^|/)src/stores/[^/]+\.(ts|tsx)$", "state");
                add(r"(?:^|/)src/context/[^/]+\.(ts|tsx)$", "state");
                add(r"^build\.rs$", "config");
                add(r"^tauri\.conf\.json$", "config");
                add(r"^capabilities/.*\.json$", "config");
                add(r"^gen/schemas/.*\.json$", "schema");
                add(r"^src/main\.rs$", "entry");
                add(r"^src/lib\.rs$", "entry");
                add(r"^src/commands/[^/]+\.rs$", "tauri-command");
                add(r"^src/handlers?/[^/]+\.rs$", "api");
                add(r"^src/models?/[^/]+\.rs$", "schema");
            }
            Framework::Express => {
                add(r"(?:^|/)routes?/[^/]+\.(ts|js)$", "routing");
                add(r"(?:^|/)controllers?/[^/]+\.(ts|js)$", "api");
                add(r"(?:^|/)services?/[^/]+\.(ts|js)$", "api");
                add(r"(?:^|/)models?/[^/]+\.(ts|js)$", "schema");
                add(r"(?:^|/)middleware/[^/]+\.(ts|js)$", "middleware");
            }
            Framework::Rust => {
                add(r"^src/main\.rs$", "entry");
                add(r"^src/lib\.rs$", "entry");
                add(r"^src/commands?/[^/]+\.rs$", "api");
                add(r"^src/handlers?/[^/]+\.rs$", "api");
                add(r"^src/models?/[^/]+\.rs$", "schema");
                add(r"^src/routes?\.rs$", "routing");
                add(r"^build\.rs$", "config");
                add(r"^tauri\.conf\.json$", "config");
                add(r"^capabilities/.*\.json$", "config");
                add(r"^gen/schemas/.*\.json$", "schema");
                add(r"^src/commands/detector\.rs$", "tauri-command");
                add(r"^src/commands/writer\.rs$", "tauri-command");
                add(r"^src/commands/mod\.rs$", "tauri-command");
                add(r"^src/commands/file_map\.rs$", "tauri-command");
            }
            Framework::Spring => {
                add(r"(?:^|/)src/main/.+Controller\.java$", "api");
                add(r"(?:^|/)src/main/.+Service\.java$", "api");
                add(r"(?:^|/)src/main/.+Repository\.java$", "schema");
                add(r"(?:^|/)src/main/.+Entity\.java$", "schema");
                add(r"(?:^|/)src/main/.+Config\.java$", "config");
                add(r"(?:^|/)application\.properties$", "config");
                add(r"(?:^|/)application\.ya?ml$", "config");
            }
            Framework::Unknown => {
                add(r"(?:^|/)routes?/[^/]+\.(ts|js|py)$", "routing");
                add(r"(?:^|/)router\.(ts|tsx|js)$", "routing");
                add(r"(?:^|/)api/[^/]+\.(ts|js|py)$", "api");
                add(r"(?:^|/)endpoints?/[^/]+\.(ts|js|py)$", "api");
                add(r"(?:^|/)components?/[^/]+\.(tsx|jsx|vue)$", "component");
                add(r"(?:^|/)components?/.+/[^/]+\.(tsx|jsx|vue)$", "component");
                add(r"(?:^|/)store/[^/]+\.(ts|tsx)$", "state");
                add(r"(?:^|/)context/[^/]+\.(ts|tsx)$", "state");
            }
        }

        let regex_set = RegexSet::new(&patterns)
            .expect("Failed to compile file map classifier patterns");

        Classifier { regex_set, tags }
    }

    fn classify(&self, rel_path: &str) -> Vec<&str> {
        let mut normalized = rel_path.replace('\\', "/");
        if normalized.starts_with("src-tauri/") {
            normalized = normalized["src-tauri/".len()..].to_string();
        }

        let is_context = normalized.starts_with("context/")
            || normalized.starts_with("contexts/")
            || normalized.contains("/context/")
            || normalized.contains("/contexts/");

        if is_context {
            return vec!["state"];
        }

        let matches: Vec<usize> = self.regex_set.matches(&normalized).into_iter().collect();

        let is_index_file = normalized == "index.ts"
            || normalized == "index.tsx"
            || normalized == "index.js"
            || normalized == "index.jsx"
            || normalized == "src/index.ts"
            || normalized == "src/index.tsx"
            || normalized == "src/index.js"
            || normalized == "src/index.jsx";

        let mut has_entry = false;
        let mut has_tauri_command = false;
        let mut has_page = false;
        for &idx in &matches {
            let tag = self.tags[idx].tag;
            let is_allowed_entry = if normalized.ends_with("/index.ts")
                || normalized.ends_with("/index.tsx")
                || normalized.ends_with("/index.js")
                || normalized.ends_with("/index.jsx")
            {
                is_index_file
            } else {
                true
            };

            if tag == "entry" && is_allowed_entry {
                has_entry = true;
            }
            if tag == "tauri-command" {
                has_tauri_command = true;
            }
            if tag == "page" {
                has_page = true;
            }
        }

        let mut seen = HashSet::new();
        let mut result = Vec::new();
        for idx in matches {
            let tag = self.tags[idx].tag;

            if tag == "component" && (has_entry || has_page) {
                continue;
            }
            if tag == "api" && has_tauri_command {
                continue;
            }
            if tag == "entry"
                && (normalized.ends_with("/index.ts")
                    || normalized.ends_with("/index.tsx")
                    || normalized.ends_with("/index.js")
                    || normalized.ends_with("/index.jsx"))
                && !is_index_file
            {
                continue;
            }

            if seen.insert(tag) {
                result.push(tag);
            }
        }
        result
    }
}

// ─── Directory Tree Collection ───────────────────────────────────────────────

#[derive(Clone)]
struct DirChild {
    name: String,
    is_dir: bool,
    abs_path: PathBuf,
}

fn should_skip(entry: &DirEntry) -> bool {
    if !entry.file_type().is_dir() {
        return false;
    }
    let name = entry.file_name().to_str().unwrap_or("");
    IGNORE_DIRS.contains(name)
}

fn is_inside_agents(path: &Path, root: &Path) -> Option<usize> {
    let rel = path.strip_prefix(root).ok()?;
    let mut depth_inside = 0usize;
    for component in rel.components() {
        let s = component.as_os_str().to_str().unwrap_or("");
        if depth_inside > 0 {
            depth_inside += 1;
        } else if s == ".agents" {
            depth_inside = 1;
        }
    }
    if depth_inside > 0 { Some(depth_inside) } else { None }
}

fn collect_tree(root: &Path) -> (BTreeMap<PathBuf, Vec<DirChild>>, Vec<PathBuf>) {
    let mut dir_children: BTreeMap<PathBuf, Vec<DirChild>> = BTreeMap::new();
    let mut all_files: Vec<PathBuf> = Vec::new();

    let walker = WalkDir::new(root)
        .follow_links(false)
        .same_file_system(true)
        .into_iter()
        .filter_entry(|e| {
            if should_skip(e) {
                return false;
            }
            if e.file_type().is_dir() {
                let name = e.file_name().to_str().unwrap_or("");
                if name.starts_with('.') && name != ".agents" && name != ".github" {
                    return false;
                }
            }
            if e.file_type().is_file() {
                if let Some(ext) = e.path().extension().and_then(|s| s.to_str()) {
                    if BINARY_EXTENSIONS.contains(ext.to_lowercase().as_str()) {
                        return false;
                    }
                }
            }
            true
        });

    for entry in walker {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path().to_path_buf();
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        if !entry.file_type().is_dir() && name.starts_with('.') {
            let allowed_hidden = [
                ".cursorrules", ".clinerules", ".env", ".env.example",
                ".env.local", ".gitignore", ".cursorrules_map", ".clinerules_map",
            ];
            if !allowed_hidden.contains(&name.as_str()) {
                continue;
            }
        }

        if let Some(depth_inside) = is_inside_agents(&path, root) {
            if depth_inside > 2 {
                continue;
            }
        }

        let is_dir = entry.file_type().is_dir();

        if is_dir {
            dir_children.entry(path.clone()).or_default();
        } else {
            all_files.push(path.clone());
        }

        if let Some(parent) = path.parent() {
            if parent >= root {
                dir_children
                    .entry(parent.to_path_buf())
                    .or_default()
                    .push(DirChild { name, is_dir, abs_path: path });
            }
        }
    }

    for children in dir_children.values_mut() {
        children.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });
    }

    (dir_children, all_files)
}

// ─── Renderer ────────────────────────────────────────────────────────────────

fn heading_prefix(depth: usize) -> &'static str {
    match depth {
        0 => "##",
        1 => "###",
        2 => "####",
        3 => "#####",
        _ => "######",
    }
}

fn render_map(
    root: &Path,
    dir_children: &BTreeMap<PathBuf, Vec<DirChild>>,
    entries: &HashMap<PathBuf, FileEntry>,
    total_files: usize,
    total_dirs: usize,
) -> String {
    let estimated = dir_children.len() * 80 + entries.len() * 80 + 200;
    let mut output = String::with_capacity(estimated);

    let root_name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "project".to_string());

    output.push_str(&format!("# {} - File Map\n", root_name));
    output.push_str("\n> Auto-generated by Omega. Do not edit manually.\n");

    render_dir(root, root, dir_children, entries, &mut output, 0);

    output.push_str(&format!(
        "\n> {} files mapped across {} directories.\n",
        total_files, total_dirs
    ));
    output
}

fn render_dir(
    dir: &Path,
    root: &Path,
    dir_children: &BTreeMap<PathBuf, Vec<DirChild>>,
    entries: &HashMap<PathBuf, FileEntry>,
    output: &mut String,
    depth: usize,
) {
    let children = match dir_children.get(dir) {
        Some(c) => c,
        None => return,
    };

    let rel = dir
        .strip_prefix(root)
        .unwrap_or(dir)
        .to_string_lossy()
        .replace('\\', "/");

    if rel.is_empty() {
        output.push_str("\n## Root (./)\n");
    } else {
        let prefix = heading_prefix(depth);
        output.push_str(&format!("\n{} {}/\n", prefix, rel));
    }

    for child in children {
        if child.is_dir {
            continue;
        }
        match entries.get(&child.abs_path) {
            Some(entry) => {
                let tag_str = if entry.tags.is_empty() {
                    String::new()
                } else {
                    format!(
                        " {}",
                        entry.tags
                            .iter()
                            .map(|t| format!("[{}]", t))
                            .collect::<Vec<_>>()
                            .join(" ")
                    )
                };

                let desc_str = entry
                    .description
                    .as_deref()
                    .map(|d| format!(" — {}", d))
                    .unwrap_or_default();

                output.push_str(&format!("- `{}`{}{}\n", child.name, tag_str, desc_str));

                if !entry.exports.is_empty() {
                    output.push_str(&format!("  exports: {}\n", entry.exports.join(", ")));
                }
            }
            None => {
                output.push_str(&format!("- `{}`\n", child.name));
            }
        }
    }

    for child in children {
        if child.is_dir {
            render_dir(&child.abs_path, root, dir_children, entries, output, depth + 1);
        }
    }
}

// ─── Internal Map Generation ──────────────────────────────────────────────────

fn generate_map_inner(
    root: &Path,
    project_root: &str,
    output_filename: Option<String>,
    write_to_disk: bool,
    cache: &MapCache,
) -> Result<String, String> {
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", project_root));
    }

    let framework = detect_framework(root);
    let classifier = Classifier::new(framework);
    let (dir_children, all_files) = collect_tree(root);

    // Step 1: Snapshot current cache — release lock before parallel work
    let existing: HashMap<PathBuf, FileEntry> = {
        let guard = cache.lock().map_err(|e| e.to_string())?;
        guard.get(project_root).cloned().unwrap_or_default()
    };

    // Step 2: Classify all files in parallel — cache hits skip re-classification
    let classified: Vec<(PathBuf, FileEntry)> = all_files
        .par_iter()
        .map(|path| {
            let content = fs::read(path).unwrap_or_default();
            let hash = hash_file_content(&content);

            if let Some(cached) = existing.get(path) {
                if cached.hash == hash {
                    return (path.clone(), cached.clone());
                }
            }

            let rel = path
                .strip_prefix(root)
                .unwrap_or(path)
                .to_string_lossy()
                .to_string();
            let tags = classifier
                .classify(&rel)
                .into_iter()
                .map(|s| s.to_string())
                .collect();
            let description = extract_description(path);
            let exports = extract_exports(path);

            (path.clone(), FileEntry { hash, tags, description, exports })
        })
        .collect();

    // Step 3: Update cache, remove stale entries for deleted files
    {
        let mut guard = cache.lock().map_err(|e| e.to_string())?;
        let project_cache = guard.entry(project_root.to_string()).or_default();
        project_cache.retain(|p, _| all_files.contains(p));
        for (path, entry) in &classified {
            project_cache.insert(path.clone(), entry.clone());
        }
    }

    // Step 4: Build lookup map for renderer
    let entries: HashMap<PathBuf, FileEntry> = classified.into_iter().collect();

    // Step 5: Stats
    let unique_dirs: HashSet<PathBuf> = all_files
        .iter()
        .filter_map(|p| p.parent().map(|d| d.to_path_buf()))
        .collect();

    // Step 6: Render
    let content = render_map(root, &dir_children, &entries, all_files.len(), unique_dirs.len());

    // Step 7: Write to disk with buffered writer
    if write_to_disk {
        let filename = output_filename.unwrap_or_else(|| "FILE_MAP.md".to_string());
        let out_path = root.join(&filename);
        let file = fs::File::create(&out_path)
            .map_err(|e| format!("Failed to create {}: {}", filename, e))?;
        let mut writer = BufWriter::new(file);
        writer
            .write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write {}: {}", filename, e))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush {}: {}", filename, e))?;
    }

    Ok(content)
}

// ─── Tauri Commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn generate_file_map(
    project_root: String,
    output_filename: Option<String>,
    write_to_disk: Option<bool>,
    cache: tauri::State<'_, MapCache>,
) -> Result<String, String> {
    let cache = cache.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(&project_root);
        let write_val = write_to_disk.unwrap_or(false);
        generate_map_inner(&root, &project_root, output_filename, write_val, &cache)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn add_map_entry(
    project_root: String,
    file_path: String,
    cache: tauri::State<'_, MapCache>,
) -> Result<String, String> {
    let cache = cache.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(&project_root);
        let abs_path = root.join(&file_path);
        if !abs_path.is_file() {
            return Err(format!("File not found: {}", file_path));
        }

        let framework = detect_framework(&root);
        let classifier = Classifier::new(framework);
        let content = fs::read(&abs_path).map_err(|e| e.to_string())?;
        let hash = hash_file_content(&content);
        let normalized = file_path.replace('\\', "/");
        let tags = classifier
            .classify(&normalized)
            .into_iter()
            .map(|s| s.to_string())
            .collect();
        let description = extract_description(&abs_path);
        let exports = extract_exports(&abs_path);

        {
            let mut guard = cache.lock().map_err(|e| e.to_string())?;
            guard
                .entry(project_root.clone())
                .or_default()
                .insert(abs_path, FileEntry { hash, tags, description, exports });
        }

        generate_map_inner(&root, &project_root, None, true, &cache)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn remove_map_entry(
    project_root: String,
    file_path: String,
    cache: tauri::State<'_, MapCache>,
) -> Result<String, String> {
    let cache = cache.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(&project_root);
        let abs_path = root.join(&file_path);

        {
            let mut guard = cache.lock().map_err(|e| e.to_string())?;
            if let Some(project_cache) = guard.get_mut(&project_root) {
                project_cache.remove(&abs_path);
            }
        }

        generate_map_inner(&root, &project_root, None, true, &cache)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn update_map_entry(
    project_root: String,
    file_path: String,
    description: Option<String>,
    tags: Option<Vec<String>>,
    cache: tauri::State<'_, MapCache>,
) -> Result<String, String> {
    let cache = cache.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(&project_root);
        let abs_path = root.join(&file_path);

        {
            let mut guard = cache.lock().map_err(|e| e.to_string())?;
            if let Some(project_cache) = guard.get_mut(&project_root) {
                if let Some(entry) = project_cache.get_mut(&abs_path) {
                    if let Some(d) = description {
                        entry.description = Some(d);
                    }
                    if let Some(t) = tags {
                        entry.tags = t;
                    }
                }
            }
        }

        generate_map_inner(&root, &project_root, None, true, &cache)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn test_classify_vite() {
        let classifier = Classifier::new(Framework::Vite);
        assert_eq!(classifier.classify("src/components/MyComponent.tsx"), vec!["component"]);
        assert_eq!(classifier.classify("src/context/MyContext.tsx"), vec!["state"]);
        assert_eq!(classifier.classify("src/pages/Home.tsx"), vec!["page"]);
        assert_eq!(classifier.classify("src/views/Dashboard.vue"), vec!["page"]);
    }

    #[test]
    fn test_classify_rust() {
        let classifier = Classifier::new(Framework::Rust);
        assert_eq!(classifier.classify("tauri.conf.json"), vec!["config"]);
        assert_eq!(classifier.classify("src/commands/detector.rs"), vec!["tauri-command"]);
        assert_eq!(classifier.classify("src/commands/mod.rs"), vec!["tauri-command"]);
    }

    #[test]
    fn test_extract_js_description_handles_empty_jsdoc() {
        assert_eq!(extract_js_description("/***/"), None);
        assert_eq!(extract_js_description("/** */"), None);
        assert_eq!(extract_js_description("/**\n * My description\n */"), Some("My description".to_string()));
    }

    #[test]
    fn test_run_generate_file_map() {
        let cache = MapCache::default();
        let root = Path::new("c:\\Users\\firas\\Projects\\Omega\\src-tauri");
        let res = generate_map_inner(
            root,
            "c:\\Users\\firas\\Projects\\Omega\\src-tauri",
            None,
            true,
            &cache,
        )
        .unwrap();
        println!("File Map length: {}", res.len());
    }
}