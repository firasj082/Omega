use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::SystemTime;
use chrono::{DateTime, Utc};
use once_cell::sync::Lazy;
use std::collections::HashSet;
use rayon::prelude::*;
use walkdir::{WalkDir, DirEntry};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectType {
    Nextjs,
    ReactVite,
    Vue,
    Nuxt,
    PythonFastapi,
    PythonDjango,
    PythonGeneral,
    NodeExpress,
    Rust,
    Go,
    Laravel,
    Unknown,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Confidence {
    High,
    Medium,
    Low,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DetectionSource {
    Auto,
    Manual,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum MonorepoType {
    Turborepo,
    Nx,
    PnpmWorkspace,
    Lerna,
    Custom,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExistingRuleFile {
    pub filename: String,
    pub absolute_path: String,
    pub relative_path: String,
    pub output_target: String, // "claude" | "cursor" | "cline"
    pub size_bytes: u64,
    pub last_modified: String, // ISO string
    pub content: String,       // Empty during scan, loaded lazily
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SubProject {
    pub id: String,
    pub name: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub project_type: ProjectType,
    pub detection_source: DetectionSource,
    pub confidence: Confidence,
    pub detected_files: Vec<String>,
    pub assigned_loadout_id: Option<String>,
    pub output_target: String, // "claude" | "cursor" | "cline"
    pub included: bool,
    pub existing_rule_files: Vec<ExistingRuleFile>,
    pub editing_existing_file: Option<ExistingRuleFile>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    pub name: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub is_directory: bool,
    pub children: Vec<TreeNode>,
    pub is_expanded: bool,
    pub is_loaded: bool,
    pub sub_project_id: Option<String>,
    pub depth: usize,
    pub existing_rule_files: Vec<ExistingRuleFile>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectionResult {
    pub root_path: String,
    pub is_monorepo: bool,
    pub monorepo_type: Option<MonorepoType>,
    pub root_project_type: ProjectType,
    pub sub_projects: Vec<SubProject>,
    pub tree: TreeNode,
}

// ─── Static Skip Lists & Indicators ──────────────────────────────────────────

static SKIP_DIRS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    [
        "node_modules", ".git", "dist", "build", ".next", "out",
        "__pycache__", "target", ".turbo", ".cache", "coverage",
        ".venv", "venv", "env", ".env", "vendor", "tmp", "temp",
        ".idea", ".vscode", "public", "static", "assets", "media",
        "uploads", "logs", "migrations", "fixtures",
    ].into_iter().collect()
});

static INDICATORS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    [
        "package.json",
        "next.config.ts", "next.config.js",
        "vite.config.ts", "vite.config.js",
        "nuxt.config.ts",
        "pyproject.toml",
        "requirements.txt",
        "manage.py",
        "main.py",
        "Cargo.toml",
        "go.mod",
        "composer.json",
        "artisan",
        "Gemfile",
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
    ].into_iter().collect()
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn file_exists(dir: &Path, name: &str) -> bool {
    dir.join(name).is_file()
}

fn dir_exists(dir: &Path, name: &str) -> bool {
    dir.join(name).is_dir()
}

fn read_file_content(dir: &Path, name: &str) -> Option<String> {
    fs::read_to_string(dir.join(name)).ok()
}

fn has_dependency(content: &str, dep: &str) -> bool {
    content.contains(&format!("\"{}\"", dep)) || content.contains(&format!("'{}'", dep))
}

fn system_time_to_iso(time: SystemTime) -> String {
    let datetime: DateTime<Utc> = time.into();
    datetime.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn infer_target_from_filename(filename: &str) -> String {
    match filename {
        "CLAUDE.md" | "CLAUDE_MAP.md" => "claude".to_string(),
        ".cursorrules" | ".cursorrules_map" => "cursor".to_string(),
        ".clinerules" | ".clinerules_map" => "cline".to_string(),
        _ => "claude".to_string(),
    }
}

// Scan a directory for existing rules files (Metadata only, content is lazy loaded)
fn scan_existing_rule_files(dir_path: &Path, root_path: &Path) -> Vec<ExistingRuleFile> {
    let filenames = [
        "CLAUDE.md", ".cursorrules", ".clinerules",
        "CLAUDE_MAP.md", ".cursorrules_map", ".clinerules_map"
    ];
    let mut files = Vec::new();

    for filename in &filenames {
        let file_path = dir_path.join(filename);
        if file_path.is_file() {
            let size_bytes = fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0);
            let last_modified = fs::metadata(&file_path)
                .and_then(|m| m.modified())
                .map(system_time_to_iso)
                .unwrap_or_else(|_| "unknown".to_string());

            let relative_path = file_path
                .strip_prefix(root_path)
                .unwrap_or(&file_path)
                .to_string_lossy()
                .to_string();

            files.push(ExistingRuleFile {
                filename: filename.to_string(),
                absolute_path: file_path.to_string_lossy().to_string(),
                relative_path,
                output_target: infer_target_from_filename(filename),
                size_bytes,
                last_modified,
                content: "".to_string(), // Keep empty during scan (loaded on demand)
            });
        }
    }
    files
}

// ─── Detection logic ─────────────────────────────────────────────────────────

fn detect_single_project(dir: &Path) -> (ProjectType, Confidence, Vec<String>) {
    let mut detected_files: Vec<String> = Vec::new();

    if file_exists(dir, "next.config.ts") || file_exists(dir, "next.config.js") {
        if file_exists(dir, "next.config.ts") {
            detected_files.push("next.config.ts".to_string());
        }
        if file_exists(dir, "next.config.js") {
            detected_files.push("next.config.js".to_string());
        }
        return (ProjectType::Nextjs, Confidence::High, detected_files);
    }

    if (file_exists(dir, "vite.config.ts") || file_exists(dir, "vite.config.js"))
        && dir_exists(dir, "src")
    {
        if file_exists(dir, "vite.config.ts") {
            detected_files.push("vite.config.ts".to_string());
        }
        if file_exists(dir, "vite.config.js") {
            detected_files.push("vite.config.js".to_string());
        }
        detected_files.push("src/".to_string());

        if let Some(pkg) = read_file_content(dir, "package.json") {
            if has_dependency(&pkg, "vue") {
                detected_files.push("package.json (vue)".to_string());
                return (ProjectType::Vue, Confidence::High, detected_files);
            }
        }

        return (ProjectType::ReactVite, Confidence::High, detected_files);
    }

    if file_exists(dir, "nuxt.config.ts") || file_exists(dir, "nuxt.config.js") {
        if file_exists(dir, "nuxt.config.ts") {
            detected_files.push("nuxt.config.ts".to_string());
        }
        if file_exists(dir, "nuxt.config.js") {
            detected_files.push("nuxt.config.js".to_string());
        }
        return (ProjectType::Nuxt, Confidence::High, detected_files);
    }

    if file_exists(dir, "vue.config.js") {
        detected_files.push("vue.config.js".to_string());
        return (ProjectType::Vue, Confidence::High, detected_files);
    }

    if file_exists(dir, "pyproject.toml") {
        detected_files.push("pyproject.toml".to_string());
        if let Some(content) = read_file_content(dir, "pyproject.toml") {
            let lower = content.to_lowercase();
            if lower.contains("fastapi") {
                return (ProjectType::PythonFastapi, Confidence::High, detected_files);
            }
            if lower.contains("django") {
                return (ProjectType::PythonDjango, Confidence::High, detected_files);
            }
        }
        return (ProjectType::PythonGeneral, Confidence::Medium, detected_files);
    }

    if file_exists(dir, "requirements.txt") {
        detected_files.push("requirements.txt".to_string());
        if let Some(content) = read_file_content(dir, "requirements.txt") {
            let lower = content.to_lowercase();
            if lower.contains("fastapi") {
                return (ProjectType::PythonFastapi, Confidence::High, detected_files);
            }
            if lower.contains("django") {
                return (ProjectType::PythonDjango, Confidence::High, detected_files);
            }
        }
        return (ProjectType::PythonGeneral, Confidence::Medium, detected_files);
    }

    if file_exists(dir, "Cargo.toml") {
        detected_files.push("Cargo.toml".to_string());
        return (ProjectType::Rust, Confidence::High, detected_files);
    }

    if file_exists(dir, "go.mod") {
        detected_files.push("go.mod".to_string());
        return (ProjectType::Go, Confidence::High, detected_files);
    }

    if file_exists(dir, "artisan") {
        detected_files.push("artisan".to_string());
        return (ProjectType::Laravel, Confidence::High, detected_files);
    }

    if let Some(pkg) = read_file_content(dir, "package.json") {
        detected_files.push("package.json".to_string());
        if has_dependency(&pkg, "express") {
            return (ProjectType::NodeExpress, Confidence::High, detected_files);
        }
    }

    (ProjectType::Unknown, Confidence::Low, detected_files)
}

fn detect_monorepo_type(root_path: &Path, subproject_count: usize) -> (bool, Option<MonorepoType>) {
    if file_exists(root_path, "turbo.json")           { return (true, Some(MonorepoType::Turborepo)) }
    if file_exists(root_path, "nx.json")              { return (true, Some(MonorepoType::Nx)) }
    if file_exists(root_path, "lerna.json")           { return (true, Some(MonorepoType::Lerna)) }
    if file_exists(root_path, "pnpm-workspace.yaml")  { return (true, Some(MonorepoType::PnpmWorkspace)) }

    if subproject_count >= 2 { return (true, Some(MonorepoType::Custom)) }

    (false, None)
}

#[derive(Deserialize)]
struct PackageJsonName {
    name: Option<String>,
}

fn resolve_subproject_name(dir_path: &Path, folder_name: &str) -> String {
    let pkg_path = dir_path.join("package.json");
    if let Ok(content) = fs::read_to_string(&pkg_path) {
        let preview_len = content.len().min(512);
        let preview = &content[..preview_len];
        if let Ok(pkg) = serde_json::from_str::<PackageJsonName>(preview) {
            if let Some(name) = pkg.name {
                if !name.is_empty() && !name.starts_with('@') {
                    return name;
                }
            }
        }
    }
    folder_name.to_string()
}

fn is_skip_dir(entry: &DirEntry) -> bool {
    entry.file_type().is_dir()
        && SKIP_DIRS.contains(entry.file_name().to_str().unwrap_or(""))
}

fn is_allowed_hidden_file(name: &str) -> bool {
    name == ".cursorrules" || name == ".clinerules" || name == "CLAUDE.md" ||
    name == ".env.example" || name == ".cursorrules_map" || name == ".clinerules_map" ||
    name == "CLAUDE_MAP.md"
}

// ─── Tree Builder ────────────────────────────────────────────────────────────

pub fn build_tree(
    root_path: &Path,
    max_depth: usize,
    sub_projects_paths: &[(String, String)],
) -> TreeNode {
    let mut flat_nodes: std::collections::HashMap<String, TreeNode> = std::collections::HashMap::new();

    let walker = WalkDir::new(root_path)
        .max_depth(max_depth)
        .follow_links(false)
        .same_file_system(true)
        .into_iter()
        .filter_entry(|e| !is_skip_dir(e));

    for entry in walker {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        if path.is_file() {
            if name.starts_with('.') && !is_allowed_hidden_file(&name) {
                continue;
            }
        }

        let relative_path = path
            .strip_prefix(root_path)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();

        let is_directory = path.is_dir();
        let existing_rule_files = if is_directory {
            scan_existing_rule_files(path, root_path)
        } else {
            Vec::new()
        };

        let abs_str = path.to_string_lossy().to_string();
        let sub_project_id = if is_directory {
            sub_projects_paths
                .iter()
                .find(|(p, _)| p == &abs_str)
                .map(|(_, id)| id.clone())
        } else {
            None
        };

        let depth = entry.depth();
        let is_loaded = !is_directory || depth < max_depth;

        flat_nodes.insert(
            abs_str.clone(),
            TreeNode {
                name,
                relative_path,
                absolute_path: abs_str,
                is_directory,
                children: Vec::new(),
                sub_project_id,
                depth,
                existing_rule_files,
                is_expanded: depth == 0,
                is_loaded,
            },
        );
    }

    let mut abs_paths: Vec<String> = flat_nodes.keys().cloned().collect();
    abs_paths.sort_by_key(|p| std::cmp::Reverse(flat_nodes[p].depth));

    let root_abs_str = root_path.to_string_lossy().to_string();

    for path in abs_paths {
        if path == root_abs_str {
            continue;
        }
        if let Some(mut node) = flat_nodes.remove(&path) {
            node.children.sort_by(|a, b| {
                if a.is_directory == b.is_directory {
                    a.name.to_lowercase().cmp(&b.name.to_lowercase())
                } else if a.is_directory {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Greater
                }
            });

            let parent_path = Path::new(&path).parent();
            if let Some(parent_path) = parent_path {
                let parent_abs = parent_path.to_string_lossy().to_string();
                if let Some(parent_node) = flat_nodes.get_mut(&parent_abs) {
                    parent_node.children.push(node);
                }
            }
        }
    }

    let mut root_node = flat_nodes.remove(&root_abs_str).unwrap_or_else(|| TreeNode {
        name: "".to_string(),
        relative_path: "".to_string(),
        absolute_path: root_abs_str,
        is_directory: true,
        children: Vec::new(),
        sub_project_id: None,
        depth: 0,
        existing_rule_files: Vec::new(),
        is_expanded: true,
        is_loaded: true,
    });

    root_node.children.sort_by(|a, b| {
        if a.is_directory == b.is_directory {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        } else if a.is_directory {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    root_node
}

// Check if a directory has any indicators
fn has_indicators(dir: &Path) -> (bool, Vec<String>) {
    let mut detected = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let name = entry.file_name().to_string_lossy().to_string();
                if INDICATORS.contains(name.as_str()) {
                    detected.push(name);
                }
            }
        }
    }
    (!detected.is_empty(), detected)
}

// ─── Tauri Command ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn detect_project(path: String) -> Result<DetectionResult, String> {
    let root = Path::new(&path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let mut candidate_paths = Vec::new();

    // Step 1: Scan root level for indicator files
    let (root_has, root_detected) = has_indicators(root);
    if root_has {
        candidate_paths.push((root.to_path_buf(), root_detected));
    }

    // Step 2 & 5: Unconditionally scan direct subdirectories (level 2) and level 3 if level 2 has no indicators
    if let Ok(level2_entries) = fs::read_dir(root) {
        for entry in level2_entries {
            if let Ok(entry) = entry {
                let path_l2 = entry.path();
                if path_l2.is_dir() {
                    let name_l2 = path_l2.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if SKIP_DIRS.contains(name_l2) || name_l2.starts_with('.') {
                        continue;
                    }
                    let (has_ind_l2, detected_l2) = has_indicators(&path_l2);
                    if has_ind_l2 {
                        candidate_paths.push((path_l2, detected_l2));
                    } else {
                        // Scan level 3 children (Step 5)
                        if let Ok(level3_entries) = fs::read_dir(&path_l2) {
                            for sub_entry in level3_entries {
                                if let Ok(sub_entry) = sub_entry {
                                    let path_l3 = sub_entry.path();
                                    if path_l3.is_dir() {
                                        let name_l3 = path_l3.file_name().and_then(|n| n.to_str()).unwrap_or("");
                                        if SKIP_DIRS.contains(name_l3) || name_l3.starts_with('.') {
                                            continue;
                                        }
                                        let (has_ind_l3, detected_l3) = has_indicators(&path_l3);
                                        if has_ind_l3 {
                                            candidate_paths.push((path_l3, detected_l3));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Rayon parallel candidates conversion to SubProjects
    let sub_projects: Vec<SubProject> = candidate_paths
        .par_iter()
        .enumerate()
        .map(|(index, (dir_path, detected_files))| {
            let id = format!("subproj-{}", index + 1);
            let folder_name = dir_path.file_name().and_then(|n| n.to_str()).unwrap_or("root");
            let name = resolve_subproject_name(dir_path, folder_name);
            let relative_path = dir_path
                .strip_prefix(root)
                .unwrap_or(dir_path)
                .to_string_lossy()
                .to_string();
            let absolute_path = dir_path.to_string_lossy().to_string();
            let (project_type, confidence, _) = detect_single_project(dir_path);
            let existing_rule_files = scan_existing_rule_files(dir_path, root);

            SubProject {
                id,
                name,
                relative_path,
                absolute_path,
                project_type,
                detection_source: DetectionSource::Auto,
                confidence,
                detected_files: detected_files.clone(),
                assigned_loadout_id: None,
                output_target: "claude".to_string(),
                included: true,
                existing_rule_files,
                editing_existing_file: None,
            }
        })
        .collect();

    // Determine monorepo type
    let subproject_count = sub_projects.len();
    let (is_monorepo, monorepo_type) = detect_monorepo_type(root, subproject_count);
    let (root_project_type, _, _) = detect_single_project(root);

    let sub_projects_paths: Vec<(String, String)> = sub_projects
        .iter()
        .map(|sp| (sp.absolute_path.clone(), sp.id.clone()))
        .collect();

    // Build tree down to depth 1 (i.e. level 0 and level 1 are loaded; deeper is lazy loaded)
    let tree = build_tree(root, 1, &sub_projects_paths);

    Ok(DetectionResult {
        root_path: path,
        is_monorepo,
        monorepo_type,
        root_project_type,
        sub_projects,
        tree,
    })
}

#[tauri::command]
pub fn expand_tree_node(
    absolute_path: String,
    max_depth: usize,
) -> Result<Vec<TreeNode>, String> {
    let path = Path::new(&absolute_path);
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", absolute_path));
    }
    // Expand checks the directory itself for children
    let root_node = build_tree(path, max_depth, &[]);
    Ok(root_node.children)
}

#[tauri::command]
pub fn read_rule_file_content(absolute_path: String) -> Result<String, String> {
    fs::read_to_string(&absolute_path).map_err(|e| e.to_string())
}
