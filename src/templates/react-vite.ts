import type { RuleBlock } from "../types";

export const reactViteTemplate: RuleBlock[] = [
  {
    id: "react-vite-overview",
    type: "section",
    title: "Project Overview",
    content:
      "This is a React application built with Vite and TypeScript. Components are function-based with hooks.",
    order: 0,
  },
  {
    id: "react-vite-structure",
    type: "file-structure",
    title: "File Structure",
    content: `src/
  components/  → Reusable UI components
  pages/       → Route-level page components
  hooks/       → Custom React hooks
  types/       → Shared TypeScript types
  utils/       → Pure utility functions
public/        → Static assets`,
    order: 1,
  },
  {
    id: "react-vite-style",
    type: "section",
    title: "Code Style",
    content: `- TypeScript strict mode. No \`any\`.
- Functional components with hooks only.
- Named exports preferred over default exports.
- Co-locate component styles or use Tailwind utility classes.
- File names: PascalCase for components, camelCase for utilities.`,
    order: 2,
  },
  {
    id: "react-vite-ignore",
    type: "ignore-patterns",
    title: "Ignore Patterns",
    content: `node_modules/
dist/
*.env*
*.lock`,
    order: 3,
  },
];
