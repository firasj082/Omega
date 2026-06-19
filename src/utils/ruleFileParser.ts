import type { RuleBlock, OutputTarget } from "../types";
import { generateId } from "./id";

export function parseRuleFileToBlocks(
  content: string,
  target: OutputTarget
): RuleBlock[] {
  if (target === "claude" || target === "cline") {
    return parseMarkdownToBlocks(content);
  }
  return parsePlaintextToBlocks(content);
}

function parseMarkdownToBlocks(content: string): RuleBlock[] {
  // Split on the divider used by claudeWriter: '\n\n---\n\n'
  // Each chunk is either:
  //   - A section: starts with '## Title\n\n' followed by content
  //   - A freeform block: no heading, raw content
  const chunks = content.split(/\r?\n\r?\n---\r?\n\r?\n/).filter((c) => c.trim());

  return chunks.map((chunk, index) => {
    const headingMatch = chunk.match(/^## (.+)\r?\n\r?\n([\s\S]*)$/);
    if (headingMatch) {
      return {
        id: generateId(),
        type: "section" as const,
        title: headingMatch[1].trim(),
        content: headingMatch[2].trim(),
        order: index,
      };
    }
    return {
      id: generateId(),
      type: "freeform" as const,
      title: "",
      content: chunk.trim(),
      order: index,
    };
  });
}

function parsePlaintextToBlocks(content: string): RuleBlock[] {
  // .cursorrules files are unstructured plaintext
  // Try to split on blank lines between sections
  // If no clear sections, return as a single freeform block
  const lines = content.split(/\r?\n/);
  const sections: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.trim() === "" && current.length > 0) {
      sections.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    sections.push(current);
  }

  if (sections.length <= 1) {
    return [
      {
        id: generateId(),
        type: "freeform",
        title: "",
        content: content.trim(),
        order: 0,
      },
    ];
  }

  return sections.map((section, index) => ({
    id: generateId(),
    type: "freeform" as const,
    title: "",
    content: section.join("\n").trim(),
    order: index,
  }));
}
