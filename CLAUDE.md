# Omega — Rules

> **File Map**: See [CLAUDE_MAP.md](./CLAUDE_MAP.md) before navigating this project.
> Update CLAUDE_MAP.md whenever a file is added or removed.

---

# Omega — Rules

> **File Map**: See [CLAUDE_MAP.md](./CLAUDE_MAP.md) before navigating this project.
> Update CLAUDE_MAP.md whenever a file is added or removed.

---

## Project Overview

This is a React application built with Vite and TypeScript. Components are function-based with hooks.

---

## File Structure

```
src/
  components/  → Reusable UI components
  pages/       → Route-level page components
  hooks/       → Custom React hooks
  types/       → Shared TypeScript types
  utils/       → Pure utility functions
public/        → Static assets
```

---

## Code Style

- TypeScript strict mode. No `any`.
- Functional components with hooks only.
- Named exports preferred over default exports.
- Co-locate component styles or use Tailwind utility classes.
- File names: PascalCase for components, camelCase for utilities.

---

## Ignore Patterns

```
node_modules/
dist/
*.env*
*.lock
```

---

## Routing Map Reference

Always consult the project directory routing map in CLAUDE_MAP.md before creating, renaming, or refactoring files to maintain codebase layout consistency.