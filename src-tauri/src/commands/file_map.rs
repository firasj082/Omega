use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

use once_cell::sync::Lazy;
use rayon::prelude::*;
use regex::RegexSet;
use walkdir::{DirEntry, WalkDir};

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
    if root.join("src-tauri").join("cargo.toml").is_file() {
        return Framework::Tauri;
    }

    // Check Cargo.toml first (Rust)
    if root.join("Cargo.toml").is_file() {
        return Framework::Rust;
    }

    // Check JVM build files (Spring)
    if root.join("pom.xml").is_file() || root.join("build.gradle").is_file() || root.join("build.gradle.kts").is_file() {
        return Framework::Spring;
    }

    // Check package.json for JS frameworks
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

    // Check next.config.* as fallback
    if root.join("next.config.ts").is_file() || root.join("next.config.js").is_file() || root.join("next.config.mjs").is_file() {
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

        // Helper to push a pattern-tag pair
        let mut add = |pattern: &str, tag: &'static str| {
            patterns.push(pattern.to_string());
            tags.push(TagRule { tag });
        };

        // ── Generic patterns (always active) ──────────────────────────────

        // Entry points
        add(r"(?:^|/)main\.(ts|tsx|js|jsx|py|rs|go)$", "entry");
        add(r"(?:^|/)index\.(ts|tsx|js|jsx)$", "entry");
        add(r"(?:^|/)app\.(ts|tsx|py)$", "entry");
        add(r"(?:^|/)server\.(ts|js)$", "entry");
        add(r"(?:^|/)lib\.rs$", "entry");

        // Config
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

        // Types / Interfaces
        add(r"(?:^|/)types\.(ts|py)$", "types");
        add(r"(?:^|/)types/index\.(ts|js)$", "types");
        add(r"[^/]\.d\.ts$", "types");
        add(r"(?:^|/)interfaces\.(ts|py)$", "types");

        // Schema / Models
        add(r"(?:^|/)schema\.(ts|js|py|prisma)$", "schema");
        add(r"(?:^|/)models\.(py|ts|js)$", "schema");
        add(r"[^/]\.entity\.(ts|js)$", "schema");
        add(r"(?:^|/)prisma/schema\.prisma$", "schema");

        // Middleware
        add(r"(?:^|/)middleware\.(ts|js|py)$", "middleware");

        // Tests
        add(r"[^/]\.test\.(ts|tsx|js|jsx)$", "test");
        add(r"[^/]\.spec\.(ts|tsx|js|jsx)$", "test");
        add(r"(?:^|/)test_[^/]+\.py$", "test");
        add(r"(?:^|/)__tests__/", "test");
        add(r"(?:^|/)tests?/", "test");

        // Styles
        add(r"[^/]\.css$", "style");
        add(r"[^/]\.scss$", "style");
        add(r"[^/]\.module\.css$", "style");

        // Utilities / Helpers
        add(r"(?:^|/)utils?/[^/]+\.(ts|js|py)$", "util");
        add(r"(?:^|/)helpers?/[^/]+\.(ts|js|py)$", "util");
        add(r"(?:^|/)lib/[^/]+\.(ts|js)$", "util");
        add(r"(?:^|/)writers/.+\.(ts|js)$", "util");
        add(r"(?:^|/)templates/.+\.(ts|js)$", "template");

        // Explicit routing definitions
        add(r"(?:^|/)router\.(ts|tsx|js|jsx)$", "routing");
        add(r"(?:^|/)routes\.(ts|tsx|js|jsx)$", "routing");
        add(r"(?:^|/)RouterConfig\.(ts|tsx)$", "routing");
        add(r"(?:^|/)[^/]*Router\.(ts|tsx)$", "routing");

        // Fallback component pattern
        add(r"[^/]\.(tsx|jsx|vue)$", "component");

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
                // Frontend (Vite) patterns
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

                // Backend (Tauri/Rust) patterns
                // Note: classify() strips "src-tauri/" prefix before matching,
                // so these are matched against the path AFTER that strip.
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
                // Broad fallback patterns when no framework is detected
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

    /// Returns deduplicated tags for a given relative path.
    fn classify(&self, rel_path: &str) -> Vec<&str> {
        let mut normalized = rel_path.replace('\\', "/");
        if normalized.starts_with("src-tauri/") {
            normalized = normalized["src-tauri/".len()..].to_string();
        }

        // Fix 2: Files inside context/ or contexts/ must be tagged [state] only
        let is_context = normalized.starts_with("context/")
            || normalized.starts_with("contexts/")
            || normalized.contains("/context/")
            || normalized.contains("/contexts/");

        if is_context {
            return vec!["state"];
        }

        let matches: Vec<usize> = self.regex_set.matches(&normalized).into_iter().collect();

        // Fix 3: Allowed locations for index file entry points
        let is_index_file = normalized == "index.ts"
            || normalized == "index.tsx"
            || normalized == "index.js"
            || normalized == "index.jsx"
            || normalized == "src/index.ts"
            || normalized == "src/index.tsx"
            || normalized == "src/index.js"
            || normalized == "src/index.jsx";

        // Check if we have an entry tag match or tauri-command match
        let mut has_entry = false;
        let mut has_tauri_command = false;
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
        }

        let mut seen = HashSet::new();
        let mut result = Vec::new();
        for idx in matches {
            let tag = self.tags[idx].tag;

            // Fix 1: Entry tag takes priority and blocks component tag
            if tag == "component" && has_entry {
                continue;
            }

            // tauri-command tag takes priority and blocks api tag
            if tag == "api" && has_tauri_command {
                continue;
            }

            // Fix 3: index.ts barrel files must not be tagged [entry]
            if tag == "entry" && (normalized.ends_with("/index.ts")
                || normalized.ends_with("/index.tsx")
                || normalized.ends_with("/index.js")
                || normalized.ends_with("/index.jsx")) && !is_index_file {
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
    if depth_inside > 0 {
        Some(depth_inside)
    } else {
        None
    }
}

/// Walk the tree and collect:
/// 1. A BTreeMap of dir → sorted children (dirs first, then files, alphabetically)
/// 2. A flat Vec of all file PathBufs for classification
fn collect_tree(
    root: &Path,
) -> (BTreeMap<PathBuf, Vec<DirChild>>, Vec<PathBuf>) {
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
            // Skip hidden directories (but allow .agents, .github)
            if e.file_type().is_dir() {
                let name = e.file_name().to_str().unwrap_or("");
                if name.starts_with('.') && name != ".agents" && name != ".github" {
                    return false;
                }
            }
            // Fix 2: Skip binary extension files case-insensitively
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

        // Skip hidden files unless they are known rule/config files
        if !entry.file_type().is_dir() && name.starts_with('.') {
            let allowed_hidden = [
                ".cursorrules", ".clinerules", ".env", ".env.example",
                ".env.local", ".gitignore", ".cursorrules_map", ".clinerules_map",
            ];
            if !allowed_hidden.contains(&name.as_str()) {
                continue;
            }
        }

        // .agents depth limiting: only list depth-1 children
        if let Some(depth_inside) = is_inside_agents(&path, root) {
            if depth_inside > 2 {
                continue;
            }
        }

        let is_dir = entry.file_type().is_dir();

        if is_dir {
            // Ensure the directory has an entry in the map
            dir_children.entry(path.clone()).or_default();
        } else {
            all_files.push(path.clone());
        }

        // Register as child of parent
        if let Some(parent) = path.parent() {
            if parent >= root {
                dir_children
                    .entry(parent.to_path_buf())
                    .or_default()
                    .push(DirChild {
                        name,
                        is_dir,
                        abs_path: path,
                    });
            }
        }
    }

    // Sort each directory's children: dirs first, then files, both alphabetically
    for children in dir_children.values_mut() {
        children.sort_by(|a, b| {
            match (a.is_dir, b.is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            }
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
    classifications: &HashMap<PathBuf, Vec<&str>>,
    total_files: usize,
    total_dirs: usize,
) -> String {
    let estimated_size = dir_children.len() * 80 + classifications.len() * 60 + 100;
    let mut output = String::with_capacity(estimated_size);

    let root_name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "project".to_string());

    // Fix 1: Document title -> # {project_name} - File Map
    output.push_str(&format!("# {} - File Map\n", root_name));
    output.push_str("\n> Auto-generated by Omega. Do not edit manually.\n");

    // Render recursively from root
    render_dir(root, root, dir_children, classifications, &mut output, 0);

    // Fix 5: Add summary line at the end of the output
    output.push_str(&format!("\n> {} files mapped across {} directories.\n", total_files, total_dirs));

    output
}

fn render_dir(
    dir: &Path,
    root: &Path,
    dir_children: &BTreeMap<PathBuf, Vec<DirChild>>,
    classifications: &HashMap<PathBuf, Vec<&str>>,
    output: &mut String,
    depth: usize,
) {
    let children = match dir_children.get(dir) {
        Some(c) => c,
        None => return,
    };

    // Dir heading
    let rel = dir
        .strip_prefix(root)
        .unwrap_or(dir)
        .to_string_lossy()
        .to_string()
        .replace('\\', "/");

    // Fix 1: Root directory never gets its own named heading. Root files go under ## Root (./) only.
    if rel.is_empty() {
        output.push_str("\n## Root (./)\n");
    } else {
        let prefix = heading_prefix(depth);
        output.push_str(&format!("\n{} {}/\n", prefix, rel));
    }

    // Render files first (they are already sorted: dirs first in the vec, but
    // we render them in the sorted order — dirs then files)
    for child in children {
        if child.is_dir {
            continue; // Render subdirectories recursively below
        }

        let tags = classifications.get(&child.abs_path);
        match tags {
            Some(t) if !t.is_empty() => {
                let tag_str = t.iter().map(|t| format!("[{}]", t)).collect::<Vec<_>>().join(" ");
                output.push_str(&format!("- `{}` {}\n", child.name, tag_str));
            }
            _ => {
                output.push_str(&format!("- `{}`\n", child.name));
            }
        }
    }

    // Recurse into subdirectories (already sorted dirs-first in the list)
    for child in children {
        if child.is_dir {
            render_dir(&child.abs_path, root, dir_children, classifications, output, depth + 1);
        }
    }
}

// ─── Tauri Command ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn generate_file_map(
    project_root: String,
    output_filename: Option<String>,
) -> Result<String, String> {
    let root = PathBuf::from(&project_root);
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", project_root));
    }

    // Step 1: Detect framework
    let framework = detect_framework(&root);

    // Step 2: Build classifier with framework-specific patterns
    let classifier = Classifier::new(framework);

    // Step 3: Walk tree and collect structure + all file paths
    let (dir_children, all_files) = collect_tree(&root);

    // Step 4: Classify ALL files in a SINGLE rayon parallel batch
    let classified: Vec<(PathBuf, Vec<&str>)> = all_files
        .par_iter()
        .map(|path| {
            let rel = path
                .strip_prefix(&root)
                .unwrap_or(path)
                .to_string_lossy()
                .to_string();
            let tags = classifier.classify(&rel);
            (path.clone(), tags)
        })
        .collect();

    // Step 5: Build classification lookup
    let classifications: HashMap<PathBuf, Vec<&str>> = classified.into_iter().collect();

    // Step 6: Calculate stats
    let unique_dirs: HashSet<PathBuf> = all_files
        .iter()
        .filter_map(|p| p.parent().map(|parent| parent.to_path_buf()))
        .collect();
    let num_dirs = unique_dirs.len();

    // Step 7: Render the map
    let content = render_map(&root, &dir_children, &classifications, all_files.len(), num_dirs);

    // Write to output_filename if provided
    if let Some(filename) = output_filename {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_vite() {
        let classifier = Classifier::new(Framework::Vite);
        // Test Vite paths
        assert_eq!(classifier.classify("src/components/MyComponent.tsx"), vec!["component"]);
        assert_eq!(classifier.classify("src/context/MyContext.tsx"), vec!["state"]);
    }

    #[test]
    fn test_classify_rust() {
        let classifier = Classifier::new(Framework::Rust);
        // Test Rust/Tauri paths relative to src-tauri
        assert_eq!(classifier.classify("tauri.conf.json"), vec!["config"]);
        assert_eq!(classifier.classify("src/commands/detector.rs"), vec!["tauri-command"]);
        assert_eq!(classifier.classify("src/commands/mod.rs"), vec!["tauri-command"]);
    }

    #[test]
    fn test_run_generate_file_map() {
        let res = generate_file_map("c:\\Users\\firas\\Projects\\Omega\\src-tauri".to_string(), None).unwrap();
        println!("File Map length: {}", res.len());
    }
}


