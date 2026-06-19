# ContextCraft — Project Brief for Cursor

## What This App Is

A desktop application that lets you select a project folder, detects the project type automatically,
and generates a structured AI rules file (CLAUDE.md, .cursorrules, .clinerules, etc.) for that project.
Users can pick from saved rule loadouts or build their own using a block-based editor.
The goal is to give AI coding tools the upfront context they need so they stop exploring blindly,
follow project conventions strictly, and reduce wasted back-and-forth corrections.

---

## Tech Stack — Use Exactly This, No Substitutions

| Layer | Choice | Reason |
|---|---|---|
| Desktop shell | Tauri 2.x | Lightweight, native file access, no bundled Chromium |
| Frontend | React 18 + TypeScript (strict mode) | Type safety throughout |
| Build tool | Vite | Fast HMR, Tauri native integration |
| Styling | Tailwind CSS v4 | Utility-first, no runtime overhead |
| UI components | shadcn/ui | Accessible, unstyled base, works with Tailwind |
| State | Zustand | Minimal, no boilerplate |
| Persistence | @tauri-apps/plugin-store | JSON store for loadouts, lives in appDataDir |
| File I/O | @tauri-apps/plugin-fs | Read folder contents, write output files |
| Dialog | @tauri-apps/plugin-dialog | Native folder picker |
| Drag-and-drop | @dnd-kit/core | Block reordering in editor |
| Icons | lucide-react | Consistent icon set |

---

## Folder Structure — Scaffold This Exactly

```
contextcraft/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   └── commands/
│   │       ├── mod.rs
│   │       ├── detector.rs       # Scan folder, detect project type
│   │       └── writer.rs         # Write rule file to target folder
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── src/
│   ├── components/
│   │   ├── ui/                   # shadcn/ui generated components only
│   │   ├── editor/
│   │   │   ├── BlockEditor.tsx   # Main block-based rule editor
│   │   │   ├── RuleBlock.tsx     # Single draggable block
│   │   │   └── AddBlockMenu.tsx  # Dropdown to add block types
│   │   ├── loadouts/
│   │   │   ├── LoadoutList.tsx   # List of saved loadouts
│   │   │   ├── LoadoutCard.tsx   # Single loadout preview card
│   │   │   └── LoadoutForm.tsx   # Create / rename a loadout
│   │   ├── detector/
│   │   │   └── ProjectBadge.tsx  # Shows detected project type
│   │   └── layout/
│   │       ├── Sidebar.tsx       # App navigation
│   │       └── TopBar.tsx        # Current folder + output target selector
│   │
│   ├── pages/
│   │   ├── Home.tsx              # Folder picker + detection result
│   │   ├── Editor.tsx            # Block editor for current session
│   │   └── Loadouts.tsx          # Manage saved loadouts
│   │
│   ├── store/
│   │   ├── useProjectStore.ts    # Current folder, detected type, active loadout
│   │   └── useLoadoutStore.ts    # All saved loadouts, CRUD
│   │
│   ├── templates/
│   │   ├── index.ts              # Template registry + resolver
│   │   ├── nextjs.ts
│   │   ├── react-vite.ts
│   │   ├── vue.ts
│   │   ├── python-fastapi.ts
│   │   ├── python-general.ts
│   │   ├── node-express.ts
│   │   ├── rust.ts
│   │   ├── go.ts
│   │   └── unknown.ts            # Generic fallback template
│   │
│   ├── writers/
│   │   ├── index.ts              # Writer registry
│   │   ├── claudeWriter.ts       # Outputs CLAUDE.md
│   │   ├── cursorWriter.ts       # Outputs .cursorrules
│   │   └── clineWriter.ts        # Outputs .clinerules
│   │
│   ├── types/
│   │   └── index.ts              # All shared TypeScript types
│   │
│   ├── utils/
│   │   ├── detector.ts           # Client-side detection helper (calls Tauri command)
│   │   └── id.ts                 # nanoid wrapper for generating IDs
│   │
│   ├── App.tsx
│   └── main.tsx
│
├── .cursorrules                  # Rules for Cursor to follow while building THIS project
├── package.json
└── README.md
```

---

## Data Models — types/index.ts

Define all types here. Import from here everywhere. Never redefine types inline.

```typescript
// ─── Block ─────────────────────────────────────────────────────────────────

export type BlockType =
  | 'section'           // Titled section with freeform content
  | 'freeform'          // No title, raw text passthrough
  | 'ignore-patterns'   // List of glob patterns to ignore
  | 'file-structure'    // Describes folder layout

export interface RuleBlock {
  id: string
  type: BlockType
  title: string         // Empty string for freeform blocks
  content: string
  order: number
}

// ─── Loadout ────────────────────────────────────────────────────────────────

export type ProjectType =
  | 'nextjs'
  | 'react-vite'
  | 'vue'
  | 'nuxt'
  | 'python-fastapi'
  | 'python-django'
  | 'python-general'
  | 'node-express'
  | 'rust'
  | 'go'
  | 'laravel'
  | 'unknown'

export interface Loadout {
  id: string
  name: string
  description: string
  projectTypes: ProjectType[]   // Which project types this loadout is suited for
  blocks: RuleBlock[]
  isBuiltIn: boolean            // Built-in templates cannot be deleted
  createdAt: string             // ISO string
  updatedAt: string             // ISO string
}

// ─── Detection ──────────────────────────────────────────────────────────────

export interface DetectionResult {
  projectType: ProjectType
  confidence: 'high' | 'medium' | 'low'
  detectedFiles: string[]       // Which files triggered detection
  suggestedLoadoutIds: string[] // IDs of loadouts matching this project type
}

// ─── Output ─────────────────────────────────────────────────────────────────

export type OutputTarget = 'claude' | 'cursor' | 'cline'

export interface OutputConfig {
  target: OutputTarget
  filename: string   // e.g. 'CLAUDE.md', '.cursorrules', '.clinerules'
  format: 'markdown' | 'plaintext'
}

export const OUTPUT_CONFIGS: Record<OutputTarget, OutputConfig> = {
  claude: { target: 'claude', filename: 'CLAUDE.md', format: 'markdown' },
  cursor: { target: 'cursor', filename: '.cursorrules', format: 'plaintext' },
  cline:  { target: 'cline',  filename: '.clinerules', format: 'markdown' },
}
```

---

## Project Type Detection Logic — detector.rs (Rust)

Detection priority order (first match wins):

```
next.config.ts / next.config.js          → nextjs
vite.config.ts + src/                    → react-vite
nuxt.config.ts                           → nuxt
vue.config.js / vite.config.ts (vue dep) → vue
pyproject.toml + fastapi in deps         → python-fastapi
pyproject.toml + django in deps          → python-django
pyproject.toml / requirements.txt        → python-general
Cargo.toml                               → rust
go.mod                                   → go
artisan (Laravel CLI file)               → laravel
package.json + express in deps           → node-express
anything else                            → unknown
```

The Tauri command `detect_project(path: String)` returns a `DetectionResult` as JSON.
Read only the root level of the folder — do not recurse deep, just check root files.

---

## Block-Based Editor Behavior

The editor is the core UI. Follow these rules precisely:

1. **Blocks are the unit of composition.** A loadout is an ordered array of blocks.
2. **Each block has a title and a content textarea.** Freeform blocks have no visible title input.
3. **Blocks are draggable** using @dnd-kit/core. Drag handle is a grip icon on the left.
4. **Blocks can be deleted** with a trash icon on the right (with a confirmation for non-empty blocks).
5. **Block title is editable inline** — clicking it turns it into an input, blur saves it.
6. **Content textarea auto-resizes** to fit its content (no fixed height, grows as user types).
7. **Add Block button** opens a small popover with block type options.
8. **Order field** is the index in the blocks array — always recalculate on drag end.

---

## Writer Behavior — claudeWriter.ts example

```typescript
export function renderClaude(blocks: RuleBlock[]): string {
  const sorted = [...blocks].sort((a, b) => a.order - b.order)
  
  return sorted.map(block => {
    if (block.type === 'freeform') {
      return block.content.trim()
    }
    return `## ${block.title}\n\n${block.content.trim()}`
  }).join('\n\n---\n\n')
}
```

Each writer formats blocks according to its target's expected format.
Writers are pure functions — they take blocks and return a string. No side effects.
Tauri's `write_file` command does the actual disk write.

---

## Store Definitions

### useProjectStore.ts
```typescript
interface ProjectStore {
  folderPath: string | null
  detection: DetectionResult | null
  activeLoadoutId: string | null
  outputTarget: OutputTarget
  editorBlocks: RuleBlock[]        // Current working blocks in editor
  
  setFolder: (path: string) => void
  setDetection: (result: DetectionResult) => void
  setActiveLoadout: (id: string) => void
  setOutputTarget: (target: OutputTarget) => void
  setEditorBlocks: (blocks: RuleBlock[]) => void
  updateBlock: (id: string, patch: Partial<RuleBlock>) => void
  addBlock: (type: BlockType) => void
  removeBlock: (id: string) => void
  reorderBlocks: (activeId: string, overId: string) => void
}
```

### useLoadoutStore.ts
```typescript
interface LoadoutStore {
  loadouts: Loadout[]

  loadFromDisk: () => Promise<void>         // Load from plugin-store on app start
  saveLoadout: (loadout: Loadout) => Promise<void>
  deleteLoadout: (id: string) => Promise<void>
  duplicateLoadout: (id: string) => Promise<void>
  getByProjectType: (type: ProjectType) => Loadout[]
}
```

---

## UI Flow — Pages

### Home.tsx
1. Large folder picker area (click or drag a folder onto it)
2. On selection: call Tauri `detect_project` command
3. Show `ProjectBadge` with detected type and confidence
4. Show list of suggested loadouts for that project type
5. User picks a loadout → loads its blocks into `editorBlocks` in store
6. CTA button: "Open Editor" → navigate to `/editor`

### Editor.tsx
1. TopBar shows: current folder path, output target dropdown (Claude / Cursor / Cline)
2. `BlockEditor` renders all `editorBlocks` from store
3. Sidebar shows current loadout name with a "Save as Loadout" button
4. Bottom bar: "Generate File" button → calls writer → calls Tauri `write_file` → shows success toast

### Loadouts.tsx
1. Grid of `LoadoutCard` components
2. Each card shows: name, description, project type tags, block count, edit / duplicate / delete actions
3. "New Loadout" button → opens `LoadoutForm` → creates empty loadout → navigates to editor with it loaded
4. Built-in loadouts show a lock icon — they can be duplicated but not deleted or renamed

---

## Built-In Template Structure (example: nextjs.ts)

```typescript
import type { RuleBlock } from '../types'

export const nextjsTemplate: RuleBlock[] = [
  {
    id: 'nextjs-overview',
    type: 'section',
    title: 'Project Overview',
    content: 'This is a Next.js application using the App Router. TypeScript is required on all files.',
    order: 0,
  },
  {
    id: 'nextjs-structure',
    type: 'file-structure',
    title: 'File Structure',
    content: `src/app/         → App Router pages and layouts
src/components/  → Reusable React components
src/lib/         → Utility functions and helpers
src/types/       → Shared TypeScript types
public/          → Static assets`,
    order: 1,
  },
  {
    id: 'nextjs-style',
    type: 'section',
    title: 'Code Style',
    content: `- Use TypeScript strict mode. Never use \`any\`.
- Functional components only. No class components.
- Use named exports everywhere. No default exports except page.tsx files.
- Prefer Server Components. Only add "use client" when strictly necessary.
- File names: kebab-case. Component names: PascalCase.`,
    order: 2,
  },
  {
    id: 'nextjs-ignore',
    type: 'ignore-patterns',
    title: 'Ignore Patterns',
    content: `.next/
node_modules/
dist/
*.env*
*.lock`,
    order: 3,
  },
]
```

Follow the same structure for every template file.

---

## Coding Rules — Cursor Must Follow These While Building

- **TypeScript strict mode is on.** No `any`. No `as unknown as X`. Fix types properly.
- **No inline styles.** Use Tailwind classes only.
- **No magic strings.** Constants go in `types/index.ts` or a dedicated `constants.ts`.
- **All Tauri commands are typed.** Use `invoke<ReturnType>('command_name', args)` with explicit generics.
- **Stores are the only global state.** Do not use Context API for app state.
- **Components are small.** If a component exceeds 150 lines, split it.
- **Writers are pure functions.** They take data, return strings. No async, no side effects.
- **All async operations show loading state.** No fire-and-forget without feedback.
- **Error states are handled everywhere.** Failed detection, failed write, missing folder — all need user-facing messages.
- **No `console.log` in production code.** Use proper error boundaries.
- **shadcn/ui components are not modified directly.** Wrap them if customization is needed.
- **Drag-and-drop uses @dnd-kit only.** Do not use HTML5 drag events.

---

## Build Phases — Do These In Order

### Phase 1 — Scaffold
Set up Tauri 2.x with React + TypeScript + Vite + Tailwind + shadcn/ui.
Confirm the app launches and hot-reloads correctly.
Install all dependencies listed in the tech stack.
Set up the folder structure exactly as defined above.
Create all empty files as stubs with TODO comments.

### Phase 2 — Types + Store
Implement `types/index.ts` fully.
Implement `useProjectStore.ts` and `useLoadoutStore.ts`.
No UI yet — just the data layer.

### Phase 3 — Detection
Implement `detector.rs` Tauri command.
Wire it to the frontend detector utility.
Test with a few real project folders.

### Phase 4 — Templates
Implement all template files under `src/templates/`.
Implement the template registry in `templates/index.ts`.

### Phase 5 — Editor
Implement `BlockEditor.tsx`, `RuleBlock.tsx`, `AddBlockMenu.tsx`.
Wire to `useProjectStore.editorBlocks`.
Drag-and-drop reordering must work before moving on.

### Phase 6 — Writers
Implement all three writers.
Implement the Tauri `write_file` command.
Test end-to-end: pick folder → load template → generate file → verify file on disk.

### Phase 7 — Loadout Management
Implement `LoadoutList.tsx`, `LoadoutCard.tsx`, `LoadoutForm.tsx`.
Implement `useLoadoutStore` persistence via plugin-store.
Built-in templates must be seeded on first launch if store is empty.

### Phase 8 — Polish
Add toast notifications for success/error states.
Add keyboard shortcuts (Cmd/Ctrl+S to generate file).
Add empty states for no loadouts, no folder selected.
Confirm app works on Windows and macOS.

---

## What Not To Build

- No cloud sync. Loadouts live locally in appDataDir only.
- No user accounts.
- No AI inside the app. This app produces files for AI tools, it does not use AI itself.
- No auto-update system in v1.
- No custom themes or dark/light toggle in v1. Pick one and ship it.
- No in-app markdown preview of the output file. Show a plain text preview only.

---

## Start Here

Begin with Phase 1. Scaffold the full project with `create-tauri-app`, configure Vite and Tailwind,
install all dependencies, and create the complete folder structure with empty stub files.
Do not begin Phase 2 until the app compiles and launches without errors.
