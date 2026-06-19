mod commands;

use commands::detector::{detect_project, expand_tree_node, read_rule_file_content};
use commands::writer::{write_file, read_rule_file, write_rule_files};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            detect_project,
            write_file,
            read_rule_file,
            write_rule_files,
            expand_tree_node,
            read_rule_file_content
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
