use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GenerationEntry {
    pub sub_project_id: String,
    pub sub_project_name: String,
    pub output_path: String,
    pub loadout_id: String,
    pub output_target: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WriteResult {
    pub sub_project_id: String,
    pub output_path: String,
    pub success: bool,
    pub error: Option<String>,
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
        let path = Path::new(&entry.output_path);
        
        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                results.push(WriteResult {
                    sub_project_id: entry.sub_project_id.clone(),
                    output_path: entry.output_path.clone(),
                    success: false,
                    error: Some(format!("Failed to create parent directory: {}", e)),
                });
                continue;
            }
        }

        match fs::write(path, &entry.content) {
            Ok(_) => {
                results.push(WriteResult {
                    sub_project_id: entry.sub_project_id.clone(),
                    output_path: entry.output_path.clone(),
                    success: true,
                    error: None,
                });
            }
            Err(e) => {
                results.push(WriteResult {
                    sub_project_id: entry.sub_project_id.clone(),
                    output_path: entry.output_path.clone(),
                    success: false,
                    error: Some(format!("Failed to write file: {}", e)),
                });
            }
        }
    }

    Ok(results)
}
