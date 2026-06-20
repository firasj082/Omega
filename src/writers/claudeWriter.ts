import type { RuleBlock, SubProject, TreeNode } from "@/types";
import { buildMapContent } from "./mapHelper";

// ─── File 1: Rules ───────────────────────────────────────────────────────────

export function renderClaudeRules(
  blocks: RuleBlock[],
  subProjectName: string,
  mapFileName: string = "CLAUDE_MAP.md"
): string {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);

  const rulesContent = sorted
    .map((block) => {
      const content = block.content || "";
      const title = block.title || "";
      if (block.type === "freeform") return content.trim();
      if (block.type === "ignore-patterns") {
        return `## ${title}\n\n\`\`\`\n${content.trim()}\n\`\`\``;
      }
      if (block.type === "file-structure") {
        return `## ${title}\n\n\`\`\`\n${content.trim()}\n\`\`\``;
      }
      return `## ${title}\n\n${content.trim()}`;
    })
    .join("\n\n---\n\n");

  return [
    `# ${subProjectName} — Rules`,
    ``,
    `> **File Map**: See [${mapFileName}](./${mapFileName}) before navigating this project.`,
    `> Update ${mapFileName} whenever a file is added or removed.`,
    ``,
    `---`,
    ``,
    rulesContent,
  ].join("\n");
}

// ─── File 2: Map ─────────────────────────────────────────────────────────────

export function renderClaudeMap(
  subProject: SubProject,
  tree: TreeNode,
  rulesFileName: string = "CLAUDE.md"
): string {
  const mapContent = buildMapContent(tree, subProject.relativePath, "markdown");

  return [
    `# ${subProject.name} — File Map`,
    ``,
    `> Referenced by [${rulesFileName}](./${rulesFileName}).`,
    `> Update this file whenever a file is added or removed.`,
    ``,
    `---`,
    ``,
    mapContent,
  ].join("\n");
}

// Legacy compat
export function renderClaude(blocks: RuleBlock[]): string {
  return renderClaudeRules(blocks, "Project", "CLAUDE_MAP.md");
}
