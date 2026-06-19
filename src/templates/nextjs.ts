import type { RuleBlock } from "../types";

export const nextjsTemplate: RuleBlock[] = [
  {
    id: "nextjs-overview",
    type: "section",
    title: "Project Overview",
    content:
      "This is a Next.js application using the App Router. TypeScript is required on all files.",
    order: 0,
  },
  {
    id: "nextjs-structure",
    type: "file-structure",
    title: "File Structure",
    content: `src/app/         → App Router pages and layouts
src/components/  → Reusable React components
src/lib/         → Utility functions and helpers
src/types/       → Shared TypeScript types
public/          → Static assets`,
    order: 1,
  },
  {
    id: "nextjs-style",
    type: "section",
    title: "Code Style",
    content: `- Use TypeScript strict mode. Never use \`any\`.
- Functional components only. No class components.
- Use named exports everywhere. No default exports except page.tsx files.
- Prefer Server Components. Only add "use client" when strictly necessary.
- File names: kebab-case. Component names: PascalCase.`,
    order: 2,
  },
  {
    id: "nextjs-ignore",
    type: "ignore-patterns",
    title: "Ignore Patterns",
    content: `.next/
node_modules/
dist/
*.env*
*.lock`,
    order: 3,
  },
];
