# Correction Prompt: Performance, Correctness & Best Practices

This overrides and corrects specific parts of all previous ContextCraft prompts.
Read all previous prompts first. Then apply every correction below.
Where this prompt conflicts with a previous prompt, this prompt wins.

---

## Problems Found in Previous Prompts

These are real issues that will cause slowness or broken behavior.
They must all be fixed before building anything else on top of them.

---

## Rust Fixes

### Fix R1 — DETECTION_SKIP_DIRS must be a HashSet, not a slice

**Previous prompt used:**
```rust
const DETECTION_SKIP_DIRS: &[&str] = &["node_modules", ".git", ...];
```

**Problem:** Checking if a directory name is in a `&[&str]` is O(n) linear search.
This runs for every single directory found during traversal.
On a project with 10,000 directories (common in Node.js projects), this is 10,000 × n comparisons.

**Fix — use a static HashSet via `once_cell`:**

Add to `Cargo.toml`:
```toml
once_cell = "1"
```

```rust
use once_cell::sync::Lazy;
use std::collections::HashSet;

static SKIP_DIRS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
  [
    "node_modules", ".git", "dist", "build", ".next", "out",
    "__pycache__", "target", ".turbo", ".cache", "coverage",
    ".venv", "venv", "env", ".env", "vendor", "tmp", "temp",
    ".idea", ".vscode", "public", "static", "assets", "media",
    "uploads", "logs", "migrations", "fixtures",
  ].into_iter().collect()
});

// Usage — O(1) lookup:
if SKIP_DIRS.contains(dir_name) { continue; }
```

Apply the same pattern to `SUBPROJECT_INDICATORS` — use a `HashSet` for O(1) existence checks.

---

### Fix R2 — Scan subdirectories in parallel using Rayon

**Previous prompt:** Sequential directory scanning — one directory at a time.

**Problem:** Large projects have many subdirectories. Scanning them one at a time
blocks the thread and is unnecessarily slow. Disk I/O for directory reads can be
parallelized on modern SSDs.

Add to `Cargo.toml`:
```toml
rayon = "1"
```

```rust
use rayon::prelude::*;

// Replace sequential scanning with parallel:
let sub_projects: Vec<SubProject> = candidate_dirs
  .par_iter()                           // parallel iterator
  .filter_map(|dir_path| {
    let indicators = check_indicators(dir_path);
    if indicators.is_empty() { return None; }
    Some(build_subproject(dir_path, &root_path, indicators))
  })
  .collect();
```

Use `par_iter()` for the subdirectory scan only — not for the tree builder,
which must maintain insertion order for correct tree structure.

---

### Fix R3 — Never read file contents during tree building

**Previous prompt (EXISTING_FILE_EDITOR_PROMPT) said:**
> "read content" during tree scan for existing rule files

**Problem:** Reading every `CLAUDE.md` found across the entire project tree during
the initial scan is expensive. A project with 10 sub-projects each having a CLAUDE.md
means 10 file reads blocking the scan.

**Fix — check existence only during scan. Read content lazily.**

During tree build: only set `existingRuleFiles` with metadata (path, size, lastModified).
Do NOT set `content` yet. Leave `content` as an empty string.

```rust
pub struct ExistingRuleFile {
  pub filename: String,
  pub absolute_path: String,
  pub relative_path: String,
  pub output_target: String,
  pub size_bytes: u64,
  pub last_modified: String,
  pub content: String,     // EMPTY during scan. Populated on demand.
}
```

Add a separate Tauri command called when the user actually clicks to open a file:
```rust
#[tauri::command]
pub fn read_rule_file_content(absolute_path: String) -> Result<String, String> {
  fs::read_to_string(&absolute_path)
    .map_err(|e| e.to_string())
}
```

The frontend calls `read_rule_file_content` only when the user clicks "Open in Editor".
Never speculatively read file contents.

---

### Fix R4 — Use walkdir for filesystem traversal

**Previous prompt:** Manual recursive tree building with `fs::read_dir`.

**Problem:** Manual recursion does not handle symlinks safely, does not handle
permission errors gracefully, and risks stack overflow on deeply nested structures.

Add to `Cargo.toml`:
```toml
walkdir = "2"
```

```rust
use walkdir::{WalkDir, DirEntry};

pub fn build_tree(root_path: &str, max_depth: usize) -> TreeNode {
  let walker = WalkDir::new(root_path)
    .max_depth(max_depth)
    .follow_links(false)           // never follow symlinks
    .same_file_system(true)        // stay on same filesystem
    .into_iter()
    .filter_entry(|e| !is_skip_dir(e));

  // Build tree iteratively from walkdir entries
  // walkdir returns entries in breadth-first order with depth info
  build_tree_from_entries(walker, root_path)
}

fn is_skip_dir(entry: &DirEntry) -> bool {
  entry.file_type().is_dir()
    && SKIP_DIRS.contains(entry.file_name().to_str().unwrap_or(""))
}
```

`build_tree_from_entries` assembles the `TreeNode` structure iteratively
using a path-keyed HashMap to find parent nodes, avoiding recursion entirely.

---

### Fix R5 — Cap the tree payload sent over IPC

**Previous prompt:** Full tree including all files sent as one JSON blob.

**Problem:** A Next.js project's `src/` folder alone can have 2,000+ files across
4 levels. Serializing and deserializing this as JSON over the Tauri IPC bridge
creates a massive payload that freezes the UI on load.

**Fix — send a lightweight summary tree first, fetch children on demand.**

Change the `detect_project` command to return only 2 levels deep for initial display.

Add a new command for lazy expansion:
```rust
#[tauri::command]
pub fn expand_tree_node(
  absolute_path: String,
  max_depth: usize,         // always 1 — fetch one level at a time
) -> Result<Vec<TreeNode>, String>
```

The frontend tree starts collapsed at depth 2. When the user expands a node,
it calls `expand_tree_node` to fetch that node's children. This keeps the
initial payload small and the UI responsive.

Update `TreeNode` to support lazy loading:
```typescript
export interface TreeNode {
  name: string
  relativePath: string
  absolutePath: string
  isDirectory: boolean
  children: TreeNode[]
  isExpanded: boolean
  isLoaded: boolean        // false = children not yet fetched
  subProjectId: string | null
  existingRuleFiles: ExistingRuleFile[]
  depth: number
}
```

Initial scan populates `isLoaded: true` for depth 0 and 1.
All deeper nodes have `isLoaded: false` until expanded.

---

### Fix R6 — Parse package.json minimally

**Previous prompt used:**
```rust
serde_json::from_str::<Value>(&content)
```

**Problem:** Deserializing the entire `package.json` as a `serde_json::Value`
just to read the `name` field is wasteful. `package.json` files can be large.

**Fix — use a minimal targeted struct:**

```rust
#[derive(Deserialize)]
struct PackageJsonName {
  name: Option<String>,
}

fn resolve_subproject_name(dir_path: &str, folder_name: &str) -> String {
  let pkg_path = format!("{}/package.json", dir_path);
  if let Ok(content) = fs::read_to_string(&pkg_path) {
    // Read only first 512 bytes — name field is always near the top
    let preview = &content[..content.len().min(512)];
    if let Ok(pkg) = serde_json::from_str::<PackageJsonName>(preview) {
      if let Some(name) = pkg.name {
        if !name.is_empty() && !name.starts_with('@') {
          return name;
        }
      }
    }
  }
  folder_name.to_string()
}
```

---

## Frontend Fixes

### Fix F1 — Virtualize the tree with @tanstack/virtual

**Previous prompt:** `ProjectTree.tsx` renders all nodes with no virtualization.

**Problem:** A project with 500 visible tree nodes renders 500 DOM elements simultaneously.
This causes visible lag on scroll, expand, and hover. React renders all of them
even when most are off screen.

Add dependency:
```
@tanstack/react-virtual
```

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

// Flatten the tree into a list of visible nodes first
// Then virtualize the flat list — only render what's on screen

const flatNodes = useMemo(() =>
  flattenVisibleTree(tree, expandedPaths),
  [tree, expandedPaths]
)

const virtualizer = useVirtualizer({
  count: flatNodes.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 32,        // each row is 32px
  overscan: 10,                  // render 10 rows above and below viewport
})
```

Each row renders a `TreeNode` component. The virtualizer ensures only ~20 rows
render at any time regardless of tree size.

---

### Fix F2 — Keep the tree out of Zustand

**Previous prompt:** Stored `tree: TreeNode | null` in `useProjectStore`.

**Problem:** Every time any store field changes (selected node, loadout assignment,
block edit), all subscribers to `useProjectStore` re-render — including the tree.
Storing a large tree object in Zustand causes cascading re-renders across the entire app.

**Fix — store the tree in a React ref and expose it through a dedicated context.**

```typescript
// src/context/TreeContext.tsx

interface TreeContextValue {
  tree: TreeNode | null
  setTree: (tree: TreeNode) => void
  getNode: (path: string) => TreeNode | null
  expandNode: (path: string) => Promise<void>
  flatNodes: TreeNode[]
}

export const TreeContext = createContext<TreeContextValue>(null!)

// TreeProvider wraps only the Home page and ProjectTree components
// It does NOT wrap the entire app
```

`useProjectStore` keeps only what's needed for generation:
`subProjects`, `selectedNodePath`, `editorSession`.
The full tree object lives in `TreeContext` and never enters Zustand.

---

### Fix F3 — Use fine-grained Zustand selectors everywhere

**Previous prompt:** Did not specify how components should subscribe to the store.

**Problem:** Without selectors, every component that calls `useProjectStore()`
re-renders on every single store change, even unrelated ones.

**Rule — every component must use a specific selector, never the full store:**

```typescript
// WRONG — re-renders on every store change
const store = useProjectStore()

// CORRECT — only re-renders when selectedNodePath changes
const selectedNodePath = useProjectStore(state => state.selectedNodePath)

// CORRECT — multiple fields with shallow equality
const { subProjects, outputTarget } = useProjectStore(
  useShallow(state => ({
    subProjects: state.subProjects,
    outputTarget: state.outputTarget,
  }))
)
```

Install the shallow comparison utility:
```
zustand/shallow is built-in — import { useShallow } from 'zustand/react/shallow'
```

Apply this pattern to every component without exception.

---

### Fix F4 — Memoize buildGenerationPlan

**Previous prompt:** `buildGenerationPlan` defined as a store method called directly.

**Problem:** Store methods are not memoized. Calling `buildGenerationPlan()` inside
a render recalculates the entire plan on every render cycle, including renders
triggered by unrelated state changes.

**Fix — use a Zustand derived selector with memoization:**

```typescript
// In GenerationPanel.tsx
import { useMemo } from 'react'

const subProjects = useProjectStore(state => state.subProjects)
const loadouts = useLoadoutStore(state => state.loadouts)

const generationPlan = useMemo(
  () => buildGenerationPlan(subProjects, loadouts),
  [subProjects, loadouts]
)
```

`buildGenerationPlan` becomes a standalone pure function imported from `src/utils/generation.ts`,
not a method on the store. Pure functions are easier to test and memoize.

---

### Fix F5 — Debounce dirty state comparison

**Previous prompt:** `markSessionDirty` compares blocks on every change.

**Problem:** Comparing two arrays of blocks on every keystroke (onChange of textarea)
is expensive — especially for loadouts with many blocks. At 60 WPM the user types
a character every ~250ms, triggering a full block comparison each time.

**Fix — debounce the dirty check:**

```typescript
import { useDebouncedCallback } from 'use-debounce'

// Add dependency: use-debounce

const checkDirty = useDebouncedCallback(() => {
  const isDirty = !blocksAreEqual(currentBlocks, sourceBlocks)
  useProjectStore.getState().setSessionDirty(isDirty)
}, 500)   // 500ms after user stops typing

// Call checkDirty() in onChange, not setSessionDirty() directly
```

`blocksAreEqual` compares content only, not IDs or order numbers.

---

## Map File Content Fixes

### Fix M1 — The map must be smart, not exhaustive

**Previous prompt:** `buildMapContent` listed every single file found in the tree.

**Problem:** A Next.js `src/components/` folder with 80 components listed individually
creates a map that is longer than the rules file. An AI reading a 300-line map
file for one sub-project gets no more value than reading the directory itself.
The whole point of the map is to provide orientation, not a census.

**Fix — the map uses a tiered listing strategy:**

```typescript
const MAP_FILE_THRESHOLD = 8  // directories with more files than this get summarized

function buildMapContent(tree: TreeNode, rootRelativePath: string): string {
  const lines: string[] = []

  function walkNode(node: TreeNode, depth: number): void {
    if (!node.isDirectory) return

    const dirFiles = node.children.filter(c => !c.isDirectory)
    const dirFolders = node.children.filter(c => c.isDirectory)
    const relPath = node.relativePath.replace(rootRelativePath + '/', '') || '.'

    if (depth > 0) {
      lines.push(`\n### ${relPath}/`)
    }

    if (dirFiles.length > MAP_FILE_THRESHOLD) {
      // Too many files — summarize the directory, only list key files
      const keyFiles = dirFiles.filter(f => isKeyFile(f.name))
      lines.push(`(${dirFiles.length} files)`)
      keyFiles.forEach(f => {
        lines.push(`- \`${f.name}\` — ${guessFilePurpose(f.name)}`)
      })
      if (keyFiles.length < dirFiles.length) {
        lines.push(`- ... and ${dirFiles.length - keyFiles.length} more`)
      }
    } else {
      // Few enough files — list them all
      dirFiles.forEach(f => {
        lines.push(`- \`${f.name}\` — ${guessFilePurpose(f.name)}`)
      })
    }

    dirFolders.forEach(child => walkNode(child, depth + 1))
  }

  walkNode(tree, 0)
  return lines.join('\n')
}
```

**Key files that are always listed individually regardless of directory size:**

```typescript
function isKeyFile(filename: string): boolean {
  const KEY_PATTERNS = [
    // Entry points
    /^main\.(ts|tsx|js|jsx|py|rs|go)$/,
    /^index\.(ts|tsx|js|jsx)$/,
    /^app\.(ts|tsx|js|jsx|py)$/,
    /^server\.(ts|js)$/,
    // Config files
    /^(next|vite|nuxt|tailwind|tsconfig|jest|vitest)\.config/,
    /^(package|pyproject|cargo|go)(\.(toml|json|mod))?$/i,
    /^\.(env|cursorrules|clinerules)(.example)?$/,
    /^CLAUDE.*\.md$/,
    // Architecture files
    /^(types|constants|config|schema)\.(ts|js|py)$/,
    /^(store|state|context)\.(ts|tsx)$/,
    /^(router|routes|routing)\.(ts|tsx|js)$/,
    /^(middleware|auth|api)\.(ts|tsx|js|py)$/,
  ]
  return KEY_PATTERNS.some(pattern => pattern.test(filename))
}
```

**Purpose hints for key files:**

```typescript
function guessFilePurpose(filename: string): string {
  if (/^main\./i.test(filename))        return 'entry point'
  if (/^index\./i.test(filename))       return 'module index'
  if (/types/i.test(filename))          return 'shared types'
  if (/store|state/i.test(filename))    return 'global state'
  if (/router|routes/i.test(filename))  return 'routing'
  if (/middleware/i.test(filename))     return 'middleware'
  if (/config/i.test(filename))         return 'configuration'
  if (/schema/i.test(filename))         return 'data schema'
  if (/constants/i.test(filename))      return 'constants'
  if (/auth/i.test(filename))           return 'authentication'
  return ''
}
```

This keeps the map file focused on what the AI actually needs to navigate the project,
not a complete inventory of every file.

---

### Fix M2 — Cap map file size

Add a hard limit to map file generation:

```typescript
const MAX_MAP_LINES = 150

function buildMapContent(tree: TreeNode, rootRelativePath: string): string {
  const lines: string[] = []

  // ... walk tree and fill lines ...

  if (lines.length > MAX_MAP_LINES) {
    const truncated = lines.slice(0, MAX_MAP_LINES)
    truncated.push('')
    truncated.push(`> Map truncated at ${MAX_MAP_LINES} lines.`)
    truncated.push(`> Run ContextCraft again to regenerate with a deeper scan.`)
    return truncated.join('\n')
  }

  return lines.join('\n')
}
```

150 lines is the ceiling. An AI reads a 150-line map fully and uses it.
An AI skims a 400-line map and misses things.

---

## Updated Dependencies to Add

Add these to `package.json`:
```json
{
  "@tanstack/react-virtual": "^3.x",
  "use-debounce": "^10.x"
}
```

Add these to `Cargo.toml`:
```toml
[dependencies]
once_cell = "1"
rayon = "1"
walkdir = "2"
```

---

## Updated Build Order

Replace the build order in all previous prompts with this one.
Each step must be verified before the next begins.

1. Update `Cargo.toml` and `package.json` with new dependencies
2. Fix `detector.rs`:
   - Replace `DETECTION_SKIP_DIRS` slice with `HashSet` via `once_cell`
   - Replace `SUBPROJECT_INDICATORS` slice with `HashSet`
   - Replace manual recursion with `walkdir`
   - Add `rayon` parallel scanning for subdirectories
   - Make `detect_project` return only 2 levels of tree initially
   - Add `expand_tree_node` command for lazy expansion
   - Add `read_rule_file_content` command (existence-check only during scan)
   - Fix `package.json` reading with minimal struct
   - Test: log full result for a large multi-stack project to console
3. Fix `writer.rs`: update WriteResult with per-file outcomes
4. Fix `claudeWriter.ts`, `cursorWriter.ts`, `clineWriter.ts`:
   - Split into rules and map functions
   - Replace exhaustive file listing with smart tiered map
   - Add MAP_FILE_THRESHOLD and MAX_MAP_LINES
5. Move `buildGenerationPlan` from store to `src/utils/generation.ts` as pure function
6. Fix `useProjectStore.ts`:
   - Remove `tree` from store — move to TreeContext
   - Add `useShallow` selectors to all store accesses
   - Fix `markSessionDirty` to use debounced comparison
7. Create `src/context/TreeContext.tsx`
8. Fix `ProjectTree.tsx` — add `@tanstack/react-virtual` virtualization
9. Update `TreeNode.tsx` — add `isLoaded` / lazy expand support
10. Update `NodeDetailPanel.tsx`, `GenerationPanel.tsx`, `ReviewModal.tsx`
11. End-to-end test on a large project (1000+ files):
    - Initial load must complete in under 2 seconds
    - Tree expansion must feel instant
    - Generation must produce correct split files
    - Map file must be under 150 lines
    - Rules file must be under 80 lines
    - Rules file line 2 must reference the map file

---

## Performance Targets

These are the minimum acceptable benchmarks.
If any of these are not met, do not proceed — investigate and fix first.

| Operation | Target |
|---|---|
| Initial folder scan + detection | < 2 seconds for any project size |
| Tree render (1000+ nodes) | No visible lag, scroll at 60fps |
| Node expand (lazy load) | < 300ms per expand |
| File write (all sub-projects) | < 1 second per file |
| Map file size | < 150 lines |
| Rules file size | < 80 lines |
| IPC payload (initial tree) | < 100KB |

---

## What Not to Change

- Do not change the block editor — it does not have performance issues
- Do not change the loadout store — it is already lean
- Do not change the ruleFileParser — it only runs on user action, not on scan
- Do not change the writer format — only the content strategy changes
- Do not add more dependencies than listed here
