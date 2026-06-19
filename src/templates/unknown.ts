import type { RuleBlock } from "../types";

export const unknownTemplate: RuleBlock[] = [
  {
    id: "unknown-overview",
    type: "section",
    title: "Project Overview",
    content:
      "Project type could not be automatically detected. Add a description of your project here.",
    order: 0,
  },
  {
    id: "unknown-structure",
    type: "file-structure",
    title: "File Structure",
    content: `Describe your project's folder layout here.
Example:
src/       → Source code
tests/     → Test files
docs/      → Documentation`,
    order: 1,
  },
  {
    id: "unknown-style",
    type: "section",
    title: "Code Style",
    content: `- Describe your coding conventions here.
- List naming conventions.
- Note any linting or formatting tools used.`,
    order: 2,
  },
  {
    id: "unknown-ignore",
    type: "ignore-patterns",
    title: "Ignore Patterns",
    content: `node_modules/
dist/
*.env*
.DS_Store`,
    order: 3,
  },
];
