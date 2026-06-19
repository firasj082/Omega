import type { RuleBlock } from "@/types";

export function renderCline(blocks: RuleBlock[]): string {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);

  return sorted
    .map((block) => {
      if (block.type === "freeform") {
        return block.content.trim();
      }
      if (block.type === "ignore-patterns") {
        return `## ${block.title}\n\n\`\`\`\n${block.content.trim()}\n\`\`\``;
      }
      if (block.type === "file-structure") {
        return `## ${block.title}\n\n\`\`\`\n${block.content.trim()}\n\`\`\``;
      }
      return `## ${block.title}\n\n${block.content.trim()}`;
    })
    .join("\n\n---\n\n");
}
