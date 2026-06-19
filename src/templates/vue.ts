import type { RuleBlock } from "../types";

export const vueTemplate: RuleBlock[] = [
  {
    id: "vue-overview",
    type: "section",
    title: "Project Overview",
    content:
      "This is a Vue 3 application using the Composition API with TypeScript.",
    order: 0,
  },
  {
    id: "vue-structure",
    type: "file-structure",
    title: "File Structure",
    content: `src/
  components/  → Reusable Vue components
  views/       → Page-level components
  composables/ → Shared composition functions
  stores/      → Pinia stores
  types/       → Shared TypeScript types
public/        → Static assets`,
    order: 1,
  },
  {
    id: "vue-style",
    type: "section",
    title: "Code Style",
    content: `- Use Composition API with \`<script setup lang="ts">\`.
- TypeScript strict mode. No \`any\`.
- Use Pinia for global state, not Vuex.
- Component names: PascalCase. File names: PascalCase for components.
- Prefer composables over mixins.`,
    order: 2,
  },
  {
    id: "vue-ignore",
    type: "ignore-patterns",
    title: "Ignore Patterns",
    content: `node_modules/
dist/
*.env*
*.lock`,
    order: 3,
  },
];
