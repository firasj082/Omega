import type { RuleBlock } from "../types";

export const nodeExpressTemplate: RuleBlock[] = [
  {
    id: "express-overview",
    type: "section",
    title: "Project Overview",
    content:
      "This is a Node.js Express API. TypeScript is used for type safety across routes and services.",
    order: 0,
  },
  {
    id: "express-structure",
    type: "file-structure",
    title: "File Structure",
    content: `src/
  routes/      → Express route definitions
  controllers/ → Request handlers
  services/    → Business logic
  middleware/  → Express middleware
  types/       → Shared TypeScript types
tests/         → Test suite`,
    order: 1,
  },
  {
    id: "express-style",
    type: "section",
    title: "Code Style",
    content: `- TypeScript strict mode. No \`any\`.
- Separate routes, controllers, and services.
- Use async/await. Handle errors with middleware.
- Validate request bodies with zod or similar.
- Environment variables via dotenv. Never hardcode secrets.`,
    order: 2,
  },
  {
    id: "express-ignore",
    type: "ignore-patterns",
    title: "Ignore Patterns",
    content: `node_modules/
dist/
*.env*
*.lock
coverage/`,
    order: 3,
  },
];
