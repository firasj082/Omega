import type { RuleBlock, SubProject, TreeNode } from "@/types";
import { buildMapContent } from "./mapHelper";

// ─── File 1: Rules ───────────────────────────────────────────────────────────

export function renderCursorRules(
  blocks: RuleBlock[],
  subProjectName: string,
  mapFileName: string = ".cursorrules_map"
): string {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);

  const rulesContent = sorted
    .map((block) => {
      if (block.type === "freeform") return block.content.trim();
      if (block.type === "ignore-patterns") {
        return `${block.title}:\n${block.content.trim()}`;
      }
      if (block.type === "file-structure") {
        return `${block.title}:\n${block.content.trim()}`;
      }
      return `${block.title}\n${block.content.trim()}`;
    })
    .join("\n\n");

  return [
    `${subProjectName} — Rules`,
    `File Map: See ${mapFileName} before navigating this project.`,
    `Update ${mapFileName} whenever a file is added or removed.`,
    ``,
    `---`,
    ``,
    rulesContent,
  ].join("\n");
}

// ─── File 2: Map ─────────────────────────────────────────────────────────────

export function renderCursorMap(
  subProject: SubProject,
  tree: TreeNode,
  rulesFileName: string = ".cursorrules"
): string {
  const mapContent = buildMapContent(tree, subProject.relativePath, "plaintext");

  return [
    `[${subProject.name} — File Map]`,
    `Referenced by ${rulesFileName}.`,
    `Update this file whenever a file is added or removed.`,
    ``,
    `---`,
    ``,
    mapContent,
  ].join("\n");
}

// Legacy compat
export function renderCursor(blocks: RuleBlock[]): string {
  return renderCursorRules(blocks, "Project", ".cursorrules_map");
}
