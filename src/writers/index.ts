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
  switch (target) {
    case "claude":
      return renderClaudeRules(blocks, subProjectName, mapFileName);
    case "cursor":
      return renderCursorRules(blocks, subProjectName, mapFileName);
    case "cline":
      return renderClineRules(blocks, subProjectName, mapFileName);
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
  return renderRules(target, blocks, "Project", "MAP_FILE");
}

export {
  renderClaudeRules,
  renderClaudeMap,
  renderCursorRules,
  renderCursorMap,
  renderClineRules,
  renderClineMap,
};
