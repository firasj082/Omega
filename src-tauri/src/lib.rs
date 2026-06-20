mod commands;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use commands::detector::{detect_project, expand_tree_node, read_rule_file_content};
use commands::file_map::{
    generate_file_map, add_map_entry, remove_map_entry, update_map_entry, MapCache,
};
use commands::writer::{write_file, read_rule_file, write_rule_files};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let map_cache: MapCache = Arc::new(Mutex::new(HashMap::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(map_cache)
        .invoke_handler(tauri::generate_handler![
            detect_project,
            write_file,
            read_rule_file,
            write_rule_files,
            expand_tree_node,
            read_rule_file_content,
            generate_file_map,
            add_map_entry,
            remove_map_entry,
            update_map_entry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}