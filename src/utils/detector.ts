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
