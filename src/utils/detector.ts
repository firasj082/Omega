import { invoke } from "@tauri-apps/api/core";
import type { DetectionResult } from "@/types";

export async function detectProject(path: string): Promise<DetectionResult> {
  return invoke<DetectionResult>("detect_project", { path });
}

export async function writeRuleFile(
  folderPath: string,
  filename: string,
  content: string,
): Promise<void> {
  await invoke("write_file", { folderPath, filename, content });
}

export async function addMapEntry(
  projectRoot: string,
  filePath: string,
): Promise<string> {
  return invoke<string>("add_map_entry", { projectRoot, filePath });
}

export async function removeMapEntry(
  projectRoot: string,
  filePath: string,
): Promise<string> {
  return invoke<string>("remove_map_entry", { projectRoot, filePath });
}

export async function updateMapEntry(
  projectRoot: string,
  filePath: string,
  description?: string,
  tags?: string[],
): Promise<string> {
  return invoke<string>("update_map_entry", {
    projectRoot,
    filePath,
    description,
    tags,
  });
}

/**
 * Invokes the Rust generate_file_map command which performs a full recursive
 * directory walk with framework-aware classification and produces a structured
 * markdown file map. The result is also written to FILE_MAP.md at the project root.
 */
export async function generateFileMap(
  projectRoot: string,
  outputFilename?: string,
  writeToDisk?: boolean,
): Promise<string> {
  return invoke<string>("generate_file_map", { projectRoot, outputFilename, writeToDisk });
}
