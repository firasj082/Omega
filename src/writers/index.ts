import type { OutputTarget, RuleBlock } from "@/types";
import { renderClaude } from "./claudeWriter";
import { renderCursor } from "./cursorWriter";
import { renderCline } from "./clineWriter";

export function renderOutput(
  target: OutputTarget,
  blocks: RuleBlock[],
): string {
  switch (target) {
    case "claude":
      return renderClaude(blocks);
    case "cursor":
      return renderCursor(blocks);
    case "cline":
      return renderCline(blocks);
  }
}

export { renderClaude, renderCursor, renderCline };
