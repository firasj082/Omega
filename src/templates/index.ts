import type { Loadout, ProjectType, RuleBlock } from "../types";
import { nextjsTemplate } from "./nextjs";
import { reactViteTemplate } from "./react-vite";
import { vueTemplate } from "./vue";
import { pythonFastapiTemplate } from "./python-fastapi";
import { pythonGeneralTemplate } from "./python-general";
import { nodeExpressTemplate } from "./node-express";
import { rustTemplate } from "./rust";
import { goTemplate } from "./go";
import { unknownTemplate } from "./unknown";

const BUILT_IN_DATE = "2024-01-01T00:00:00.000Z";

const TEMPLATE_REGISTRY: Record<
  ProjectType,
  { name: string; description: string; blocks: RuleBlock[] }
> = {
  nextjs: {
    name: "Next.js App Router",
    description: "Rules for Next.js projects using the App Router and TypeScript.",
    blocks: nextjsTemplate,
  },
  "react-vite": {
    name: "React + Vite",
    description: "Rules for React applications built with Vite and TypeScript.",
    blocks: reactViteTemplate,
  },
  vue: {
    name: "Vue 3",
    description: "Rules for Vue 3 projects using the Composition API.",
    blocks: vueTemplate,
  },
  nuxt: {
    name: "Nuxt 3",
    description: "Rules for Nuxt 3 full-stack Vue applications.",
    blocks: vueTemplate,
  },
  "python-fastapi": {
    name: "Python FastAPI",
    description: "Rules for FastAPI Python web applications.",
    blocks: pythonFastapiTemplate,
  },
  "python-django": {
    name: "Python Django",
    description: "Rules for Django Python web applications.",
    blocks: pythonGeneralTemplate,
  },
  "python-general": {
    name: "Python General",
    description: "Rules for general Python projects.",
    blocks: pythonGeneralTemplate,
  },
  "node-express": {
    name: "Node Express",
    description: "Rules for Node.js Express API projects.",
    blocks: nodeExpressTemplate,
  },
  rust: {
    name: "Rust",
    description: "Rules for Rust projects using Cargo.",
    blocks: rustTemplate,
  },
  go: {
    name: "Go",
    description: "Rules for Go projects using modules.",
    blocks: goTemplate,
  },
  laravel: {
    name: "Laravel",
    description: "Rules for Laravel PHP web applications.",
    blocks: unknownTemplate,
  },
  unknown: {
    name: "Generic Project",
    description: "Fallback rules for unrecognized project types.",
    blocks: unknownTemplate,
  },
};

export function getTemplateForType(type: ProjectType): RuleBlock[] {
  return TEMPLATE_REGISTRY[type].blocks.map((block) => ({ ...block }));
}

export function getBuiltInLoadouts(): Loadout[] {
  return (Object.keys(TEMPLATE_REGISTRY) as ProjectType[]).map((type) => {
    const entry = TEMPLATE_REGISTRY[type];
    return {
      id: `builtin-${type}`,
      name: entry.name,
      description: entry.description,
      projectTypes: [type],
      blocks: entry.blocks.map((block) => ({ ...block })),
      isBuiltIn: true,
      createdAt: BUILT_IN_DATE,
      updatedAt: BUILT_IN_DATE,
    };
  });
}

export function getSuggestedLoadoutIds(type: ProjectType): string[] {
  return [`builtin-${type}`, "builtin-unknown"];
}

export { TEMPLATE_REGISTRY };
