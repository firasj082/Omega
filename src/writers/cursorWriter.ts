import type { RuleBlock } from "@/types";

export function renderCursor(blocks: RuleBlock[]): string {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);

  return sorted
    .map((block) => {
      if (block.type === "freeform") {
        return block.content.trim();
      }
      if (block.type === "ignore-patterns") {
        return `${block.title}:\n${block.content.trim()}`;
      }
      if (block.type === "file-structure") {
        return `${block.title}:\n${block.content.trim()}`;
      }
      return `${block.title}\n${block.content.trim()}`;
    })
    .join("\n\n");
}
