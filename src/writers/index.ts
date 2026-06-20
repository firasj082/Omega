import { OUTPUT_CONFIGS } from "@/types";
import type { OutputTarget, RuleBlock, SubProject, TreeNode } from "@/types";
import { renderClaudeRules, renderClaudeMap } from "./claudeWriter";
import { renderCursorRules, renderCursorMap } from "./cursorWriter";
import { renderClineRules, renderClineMap } from "./clineWriter";

export function renderRules(
  target: OutputTarget,
  blocks: RuleBlock[],
  subProjectName: string,
  mapFileName: string
): string {
  // Dynamically replace any target map file name with mapFileName inside "Routing Map Reference" block content
  const finalBlocks = blocks.map((block) => {
    if (block && (block.title || "") === "Routing Map Reference") {
      let updatedContent = block.content || "";
      for (const config of Object.values(OUTPUT_CONFIGS)) {
        updatedContent = updatedContent.replace(config.mapFile, mapFileName);
      }
      return { ...block, content: updatedContent };
    }
    return block;
  });

  switch (target) {
    case "claude":
      return renderClaudeRules(finalBlocks, subProjectName, mapFileName);
    case "cursor":
      return renderCursorRules(finalBlocks, subProjectName, mapFileName);
    case "cline":
      return renderClineRules(finalBlocks, subProjectName, mapFileName);
  }
}

export function renderMap(
  target: OutputTarget,
  subProject: SubProject,
  tree: TreeNode,
  rulesFileName: string
): string {
  switch (target) {
    case "claude":
      return renderClaudeMap(subProject, tree, rulesFileName);
    case "cursor":
      return renderCursorMap(subProject, tree, rulesFileName);
    case "cline":
      return renderClineMap(subProject, tree, rulesFileName);
  }
}

export function renderOutput(
  target: OutputTarget,
  blocks: RuleBlock[],
): string {
  const mapFile = OUTPUT_CONFIGS[target].mapFile;
  return renderRules(target, blocks, "Project", mapFile);
}

export {
  renderClaudeRules,
  renderClaudeMap,
  renderCursorRules,
  renderCursorMap,
  renderClineRules,
  renderClineMap,
};
