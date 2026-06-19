use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::SystemTime;
use chrono::{DateTime, Utc};

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
    pub content: String,
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
        "CLAUDE.md" => "claude".to_string(),
        ".cursorrules" => "cursor".to_string(),
        ".clinerules" => "cline".to_string(),
        _ => "claude".to_string(),
    }
}

// Scan a directory for existing rules files
fn scan_existing_rule_files(dir_path: &Path, root_path: &Path) -> Vec<ExistingRuleFile> {
    let filenames = ["CLAUDE.md", ".cursorrules", ".clinerules"];
    let mut files = Vec::new();

    for filename in &filenames {
        let file_path = dir_path.join(filename);
        if file_path.is_file() {
            let content = fs::read_to_string(&file_path).unwrap_or_default();
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
                content,
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

// Check for monorepo configuration
fn detect_monorepo(root: &Path) -> (bool, Option<MonorepoType>) {
    if file_exists(root, "pnpm-workspace.yaml") {
        return (true, Some(MonorepoType::PnpmWorkspace));
    }
    if file_exists(root, "lerna.json") {
        return (true, Some(MonorepoType::Lerna));
    }
    if file_exists(root, "turbo.json") {
        return (true, Some(MonorepoType::Turborepo));
    }
    if file_exists(root, "nx.json") {
        return (true, Some(MonorepoType::Nx));
    }
    if let Some(pkg) = read_file_content(root, "package.json") {
        if pkg.contains("\"workspaces\"") {
            return (true, Some(MonorepoType::Custom));
        }
    }
    (false, None)
}

// ─── Tree Builder ────────────────────────────────────────────────────────────

fn is_excluded_dir(name: &str) -> bool {
    let excluded = [
        "node_modules",
        ".git",
        "dist",
        "build",
        ".next",
        "__pycache__",
        "target",
        ".turbo",
        ".cache",
        "coverage",
        "out",
        ".venv",
        "venv",
    ];
    excluded.contains(&name)
}

fn is_allowed_hidden_file(name: &str) -> bool {
    let allowed = [
        ".cursorrules",
        ".clinerules",
        "CLAUDE.md",
        ".env.example",
    ];
    allowed.contains(&name)
}

fn build_tree(
    root_path: &Path,
    current_path: &Path,
    depth: usize,
    max_depth: usize,
    sub_projects_paths: &[(String, String)], // List of (abs_path, sub_project_id)
) -> TreeNode {
    let name = current_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "".to_string());

    let relative_path = current_path
        .strip_prefix(root_path)
        .unwrap_or(current_path)
        .to_string_lossy()
        .to_string();

    let is_directory = current_path.is_dir();
    let mut children = Vec::new();
    let existing_rule_files = if is_directory {
        scan_existing_rule_files(current_path, root_path)
    } else {
        Vec::new()
    };

    let sub_project_id = if is_directory {
        let abs_str = current_path.to_string_lossy().to_string();
        sub_projects_paths
            .iter()
            .find(|(p, _)| p == &abs_str)
            .map(|(_, id)| id.clone())
    } else {
        None
    };

    if is_directory && depth < max_depth {
        if let Ok(entries) = fs::read_dir(current_path) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let child_path = entry.path();
                    let child_name = child_path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "".to_string());

                    if child_path.is_dir() {
                        if is_excluded_dir(&child_name) {
                            continue;
                        }
                    } else {
                        // File filters
                        if child_name.starts_with('.') && !is_allowed_hidden_file(&child_name) {
                            continue;
                        }
                    }

                    let child_node = build_tree(
                        root_path,
                        &child_path,
                        depth + 1,
                        max_depth,
                        sub_projects_paths,
                    );
                    children.push(child_node);
                }
            }
        }

        // Sort: directories first, then files, both alphabetically
        children.sort_by(|a, b| {
            if a.is_directory == b.is_directory {
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            } else if a.is_directory {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            }
        });
    }

    TreeNode {
        name,
        relative_path,
        absolute_path: current_path.to_string_lossy().to_string(),
        is_directory,
        children,
        sub_project_id,
        depth,
        existing_rule_files,
    }
}

// ─── Tauri Command ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn detect_project(path: String) -> Result<DetectionResult, String> {
    let root = Path::new(&path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let (is_monorepo, monorepo_type) = detect_monorepo(root);
    let (root_project_type, _, _) = detect_single_project(root);

    // List candidate sub-projects
    let mut candidates = vec![root.to_path_buf()];

    if is_monorepo {
        let known_subdirs = [
            "apps", "packages", "libs", "frontend", "backend", "client",
            "server", "web", "api", "mobile", "shared", "core", "services", "src",
        ];
        for subdir_name in &known_subdirs {
            let subdir_path = root.join(subdir_name);
            if subdir_path.is_dir() {
                if let Ok(entries) = fs::read_dir(&subdir_path) {
                    for entry in entries {
                        if let Ok(entry) = entry {
                            let entry_path = entry.path();
                            if entry_path.is_dir() {
                                let name = entry_path
                                    .file_name()
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_default();
                                if !is_excluded_dir(&name) && !name.starts_with('.') {
                                    candidates.push(entry_path);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut sub_projects = Vec::new();
    let mut sub_projects_paths = Vec::new();
    let mut counter = 1;

    for cand_path in candidates {
        let (project_type, confidence, detected_files) = detect_single_project(&cand_path);
        let id = format!("subproj-{}", counter);
        counter += 1;

        let name = cand_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "root".to_string());

        let relative_path = cand_path
            .strip_prefix(root)
            .unwrap_or(&cand_path)
            .to_string_lossy()
            .to_string();

        let existing_rule_files = scan_existing_rule_files(&cand_path, root);
        let absolute_path = cand_path.to_string_lossy().to_string();

        sub_projects_paths.push((absolute_path.clone(), id.clone()));

        sub_projects.push(SubProject {
            id,
            name,
            relative_path,
            absolute_path,
            project_type,
            detection_source: DetectionSource::Auto,
            confidence,
            detected_files,
            assigned_loadout_id: None,
            output_target: "claude".to_string(),
            included: true,
            existing_rule_files,
            editing_existing_file: None,
        });
    }

    // Build the browsable tree (max 4 levels deep)
    let tree = build_tree(root, root, 0, 4, &sub_projects_paths);

    Ok(DetectionResult {
        root_path: path,
        is_monorepo,
        monorepo_type,
        root_project_type,
        sub_projects,
        tree,
    })
}
