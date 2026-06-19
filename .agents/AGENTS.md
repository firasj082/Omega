# Omega — Workspace Rules

- TypeScript strict mode is on. No `any`. No `as unknown as X`.
- No inline styles. Use Tailwind classes only.
- No magic strings. Constants go in `types/index.ts`.
- All Tauri commands are typed with explicit generics.
- Stores are the only global state. No Context API for app state.
- Components stay under 150 lines — split if larger.
- Writers are pure functions. No async, no side effects.
- All async operations show loading state.
- Error states need user-facing messages.
- No `console.log` in production code.
- shadcn/ui components are not modified directly — wrap if needed.
- Drag-and-drop uses @dnd-kit only.
