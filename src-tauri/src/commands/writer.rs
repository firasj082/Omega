use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GenerationEntry {
    pub sub_project_id: String,
    pub sub_project_name: String,
    pub rules_output_path: String,
    pub map_output_path: String,
    pub loadout_id: String,
    pub output_target: String,
    pub rules_content: String,
    pub map_content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WriteResult {
    pub sub_project_id: String,
    pub rules_path: String,
    pub map_path: String,
    pub rules_success: bool,
    pub map_success: bool,
    pub rules_error: Option<String>,
    pub map_error: Option<String>,
}

#[tauri::command]
pub fn write_file(folder_path: String, filename: String, content: String) -> Result<(), String> {
    let mut path = PathBuf::from(&folder_path);
    path.push(&filename);

    fs::write(&path, content).map_err(|e| format!("Failed to write file: {e}"))
}

#[tauri::command]
pub fn read_rule_file(absolute_path: String) -> Result<String, String> {
    let path = Path::new(&absolute_path);
    if !path.is_file() {
        return Err(format!("File not found: {}", absolute_path));
    }
    fs::read_to_string(path).map_err(|e| format!("Failed to read file: {e}"))
}

#[tauri::command]
pub fn write_rule_files(entries: Vec<GenerationEntry>) -> Result<Vec<WriteResult>, String> {
    let mut results = Vec::new();

    for entry in entries {
        let rules_path = Path::new(&entry.rules_output_path);
        let map_path = Path::new(&entry.map_output_path);

        // 1. Ensure rules parent directory exists
        if let Some(parent) = rules_path.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                results.push(WriteResult {
                    sub_project_id: entry.sub_project_id.clone(),
                    rules_path: entry.rules_output_path.clone(),
                    map_path: entry.map_output_path.clone(),
                    rules_success: false,
                    map_success: false,
                    rules_error: Some(format!("Failed to create rules parent directory: {}", e)),
                    map_error: Some("Skipped map file write because rules directory creation failed".to_string()),
                });
                continue;
            }
        }

        // 2. Write rules file
        match fs::write(rules_path, &entry.rules_content) {
            Ok(_) => {
                // Ensure map parent directory exists (typically same, but let's be safe)
                if let Some(parent) = map_path.parent() {
                    if let Err(e) = fs::create_dir_all(parent) {
                        results.push(WriteResult {
                            sub_project_id: entry.sub_project_id.clone(),
                            rules_path: entry.rules_output_path.clone(),
                            map_path: entry.map_output_path.clone(),
                            rules_success: true,
                            map_success: false,
                            rules_error: None,
                            map_error: Some(format!("Failed to create map parent directory: {}", e)),
                        });
                        continue;
                    }
                }

                // 3. Write map file
                match fs::write(map_path, &entry.map_content) {
                    Ok(_) => {
                        results.push(WriteResult {
                            sub_project_id: entry.sub_project_id.clone(),
                            rules_path: entry.rules_output_path.clone(),
                            map_path: entry.map_output_path.clone(),
                            rules_success: true,
                            map_success: true,
                            rules_error: None,
                            map_error: None,
                        });
                    }
                    Err(e) => {
                        results.push(WriteResult {
                            sub_project_id: entry.sub_project_id.clone(),
                            rules_path: entry.rules_output_path.clone(),
                            map_path: entry.map_output_path.clone(),
                            rules_success: true,
                            map_success: false,
                            rules_error: None,
                            map_error: Some(format!("Failed to write map file: {}", e)),
                        });
                    }
                }
            }
            Err(e) => {
                results.push(WriteResult {
                    sub_project_id: entry.sub_project_id.clone(),
                    rules_path: entry.rules_output_path.clone(),
                    map_path: entry.map_output_path.clone(),
                    rules_success: false,
                    map_success: false,
                    rules_error: Some(format!("Failed to write rules file: {}", e)),
                    map_error: Some("Skipped map file write because rules file write failed".to_string()),
                });
            }
        }
    }

    Ok(results)
}
