# Omega — Strict Project Rules and Routing Directory

This file defines the project's strict architecture, coding rules, and routing paths to keep development consistent and reduce token usage during scans.

> [!IMPORTANT]
> Whenever a new file is added or updated in this workspace, this file MUST be updated with its correct path and purpose under the **Routing & File Mapping** section.

---

## 1. Strict Coding Rules

- **TypeScript Strict Mode**: Absolutely no `any` or `as unknown as X`. Proper type annotations only.
- **Tailwind Only**: No inline styles or custom style systems. Use Tailwind classes.
- **Design Tokens**: Standardize colors and sizes.
- **Single Source of Truth**: All shared types live in `src/types/index.ts`. Never define types inline.
- **Zustand Only**: Global state must reside inside Zustand stores under `src/store/`. Do not use React Context.
- **Component Size**: Keep components under 150 lines. Split them into sub-components if they exceed this limit.
- **Pure Writers**: All generator writers (`src/writers/`) must be pure functions. No async, no side effects.
- **Error Handling**: Every asynchronous operation must show a loading state and handle errors with user-friendly toast/alert notifications.
- **No Console Logging**: Clean up all `console.log` statements before committing/finishing tasks.
- **shadcn/ui Integrity**: Do not modify UI primitives directly. Wrap them if custom overrides are needed.

---

## 2. Routing & File Mapping

### Frontend Stack (`src/`)
- `src/main.tsx` — React entry point.
- `src/App.tsx` — Main routing and root layouts.
- `src/index.css` — Tailwind base imports and color variable tokens.
- `src/vite-env.d.ts` — Vite environment types.
- `src/types/index.ts` — Shared interfaces and constants.
- `src/lib/utils.ts` — UI className merge utility (`cn`).
- `src/utils/id.ts` — Nanoid generator wrapper.
- `src/utils/detector.ts` — Folder scanner API bridge to Tauri.
- `src/utils/ruleFileParser.ts` — Parses raw rule file content into RuleBlock arrays.

#### Pages (`src/pages/`)
- `src/pages/Home.tsx` — Folder picker, detection results, and monorepo workspace picker.
- `src/pages/Editor.tsx` — Visual rule builder workspace, block manager, preview & generation.
- `src/pages/Loadouts.tsx` — Saved template list page.

#### Stores (`src/store/`)
- `src/store/useProjectStore.ts` — Workspace tree state, sub-projects, node selection, generation strategies.
- `src/store/useLoadoutStore.ts` — Persisted templates database.

#### Components (`src/components/`)
- `src/components/ui/` — shadcn/ui components (badge, button, card, dialog, input, label, popover, select, separator, textarea).
- `src/components/detector/ProjectBadge.tsx` — Status display of detected tech-stack type.
- `src/components/editor/BlockEditor.tsx` — Sortable block list container.
- `src/components/editor/RuleBlock.tsx` — Draggable rule text card block.
- `src/components/editor/AddBlockMenu.tsx` — Block type insertion popover.
- `src/components/layout/Sidebar.tsx` — Navigation panel.
- `src/components/layout/TopBar.tsx` — Folder path and global rules mode.
- `src/components/tree/ProjectTree.tsx` — Recursive tree view root component.
- `src/components/tree/TreeNode.tsx` — Individual tree node with expand/collapse and context actions.
- `src/components/tree/NodeDetailPanel.tsx` — Right-side detail/config panel for the selected tree node.
- `src/components/generation/GenerationPanel.tsx` — Batch generation panel for multi-project output.
- `src/components/generation/ReviewModal.tsx` — Pre-generation review and confirmation dialog.
- `src/components/loadouts/LoadoutCard.tsx` — Individual loadout display card.
- `src/components/loadouts/LoadoutForm.tsx` — Create/edit loadout form dialog.
- `src/components/loadouts/LoadoutList.tsx` — Scrollable list of saved loadouts.

#### Templates (`src/templates/`)
- `src/templates/index.ts` — Built-in templates index.
- Template definitions: `nextjs.ts`, `react-vite.ts`, `vue.ts`, `nuxt.ts`, `python-fastapi.ts`, `python-django.ts`, `python-general.ts`, `node-express.ts`, `rust.ts`, `go.ts`, `unknown.ts`.

#### Writers (`src/writers/`)
- `src/writers/index.ts` — Dispatcher for target writers.
- `src/writers/claudeWriter.ts` — Generates `CLAUDE.md`.
- `src/writers/cursorWriter.ts` — Generates `.cursorrules`.
- `src/writers/clineWriter.ts` — Generates `.clinerules`.

### Backend Stack (`src-tauri/`)
- `src-tauri/tauri.conf.json` — Desktop settings (window sizes, productName, assets directory).
- `src-tauri/Cargo.toml` — Cargo dependencies.
- `src-tauri/src/main.rs` — Rust application entry.
- `src-tauri/src/lib.rs` — Plugin setups and command registration.
- `src-tauri/src/commands/mod.rs` — Command modules registration.
- `src-tauri/src/commands/detector.rs` — Project detection engine and path tree builders.
- `src-tauri/src/commands/writer.rs` — Disk files generator.

