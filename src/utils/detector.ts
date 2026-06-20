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

/**
 * Invokes the Rust generate_file_map command which performs a full recursive
 * directory walk with framework-aware classification and produces a structured
 * markdown file map. The result is also written to FILE_MAP.md at the project root.
 */
export async function generateFileMap(
  projectRoot: string,
  outputFilename?: string,
): Promise<string> {
  return invoke<string>("generate_file_map", { projectRoot, outputFilename });
}
