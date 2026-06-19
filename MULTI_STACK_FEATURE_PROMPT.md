# Feature Prompt: Multi-Stack Detection + Interactive Project Tree

This extends the existing ContextCraft project brief.
Read the original CURSOR_PROJECT_PROMPT.md first, then apply everything below on top of it.
Do not redo work that already exists. Only add or modify what is specified here.

---

## What This Feature Does

When a user selects a folder, instead of detecting a single project type, the app now:
1. Scans for monorepo indicators and known sub-directories
2. Builds a full file tree the user can browse and interact with
3. Lets the user click any folder node to manually mark it as a sub-project
4. Lets the user override the auto-detected type on any node
5. Lets the user assign a loadout to each marked sub-project
6. Lets the user choose where to generate the rule file for each sub-project
7. Generates one rule file per sub-project in the correct location

---

## Updated & New Types — add to types/index.ts

```typescript
// ─── Sub-Project ─────────────────────────────────────────────────────────────

export type DetectionSource = 'auto' | 'manual'

export type MonorepoType =
  | 'turborepo'
  | 'nx'
  | 'pnpm-workspace'
  | 'lerna'
  | 'custom'
  | null

export interface SubProject {
  id: string
  name: string                      // folder name e.g. "frontend"
  relativePath: string              // relative to root e.g. "apps/frontend"
  absolutePath: string              // full disk path
  projectType: ProjectType
  detectionSource: DetectionSource  // was it auto-detected or manually set by user
  confidence: 'high' | 'medium' | 'low'
  detectedFiles: string[]           // which files triggered auto-detection
  assignedLoadoutId: string | null
  outputTarget: OutputTarget        // can be set per sub-project
  included: boolean                 // user can exclude a sub-project from generation
}

// ─── Tree Node ───────────────────────────────────────────────────────────────

export interface TreeNode {
  name: string
  relativePath: string
  absolutePath: string
  isDirectory: boolean
  children: TreeNode[]
  subProjectId: string | null       // set if this node is a marked sub-project
  depth: number                     // 0 = root
}

// ─── Updated Detection Result ─────────────────────────────────────────────────

export interface DetectionResult {
  rootPath: string
  isMonorepo: boolean
  monorepoType: MonorepoType
  rootProjectType: ProjectType      // what the root itself looks like
  subProjects: SubProject[]         // populated for monorepos, single item for simple projects
  tree: TreeNode                    // full browsable tree of the selected folder
}

// ─── Generation ──────────────────────────────────────────────────────────────

export type RuleFileStrategy = 'per-subproject' | 'combined-root'

export interface GenerationPlan {
  strategy: RuleFileStrategy
  entries: GenerationEntry[]
}

export interface GenerationEntry {
  subProjectId: string
  subProjectName: string
  outputPath: string                // absolute path where the file will be written
  loadoutId: string
  outputTarget: OutputTarget
}
```

---

## Updated Rust Commands — src-tauri/src/commands/

### detector.rs — replace detect_project

The command now returns a full `DetectionResult` including the tree.

```rust
// Pseudocode — implement in idiomatic Rust

pub fn detect_project(root_path: String) -> DetectionResult {

  // Step 1: build tree (max 4 levels deep, skip node_modules/.git/dist/build/.next)
  let tree = build_tree(&root_path, 0, 4)

  // Step 2: check root for monorepo indicators
  let (is_monorepo, monorepo_type) = detect_monorepo(&root_path)

  // Step 3: collect candidate directories to scan
  // Always scan root itself
  // If monorepo: also scan known sub-dirs one level deep
  let known_subdirs = ["apps", "packages", "libs", "frontend", "backend",
                        "client", "server", "web", "api", "mobile", "shared",
                        "core", "services", "src"]

  let candidates = if is_monorepo {
    collect_existing_subdirs(&root_path, &known_subdirs)
  } else {
    vec![root_path.clone()]
  }

  // Step 4: detect project type for each candidate
  let sub_projects = candidates.iter().map(|path| {
    let (project_type, confidence, detected_files) = detect_single_project(path)
    SubProject {
      id: generate_id(),
      name: folder_name(path),
      relative_path: relative_to_root(path, &root_path),
      absolute_path: path.clone(),
      project_type,
      detection_source: DetectionSource::Auto,
      confidence,
      detected_files,
      assigned_loadout_id: None,
      output_target: OutputTarget::Claude,
      included: true,
    }
  }).collect()

  DetectionResult { root_path, is_monorepo, monorepo_type,
                    root_project_type, sub_projects, tree }
}
```

### Tree builder rules

- Max depth: 4 levels
- Skip these directories entirely at any depth:
  `node_modules`, `.git`, `dist`, `build`, `.next`, `__pycache__`,
  `target`, `.turbo`, `.cache`, `coverage`, `out`, `.venv`, `venv`
- Skip hidden files (starting with `.`) except known config files:
  `.cursorrules`, `.clinerules`, `CLAUDE.md`, `.env.example`
- Each TreeNode includes: name, relativePath, absolutePath, isDirectory, children, depth
- Files are included in the tree (isDirectory: false, children: [])
- Sort: directories first, then files, both alphabetically

### writer.rs — add write_multiple command

```rust
// Writes multiple rule files in one call
pub fn write_rule_files(entries: Vec<GenerationEntry>, blocks_map: Map<String, Vec<RuleBlock>>) -> Vec<WriteResult>

pub struct WriteResult {
  pub sub_project_id: String,
  pub output_path: String,
  pub success: bool,
  pub error: Option<String>,
}
```

---

## New & Updated Frontend Components

### src/components/tree/

Create this folder with the following components:

---

#### ProjectTree.tsx

The main tree panel. Renders the full folder tree of the selected project.

Props:
```typescript
interface ProjectTreeProps {
  tree: TreeNode
  subProjects: SubProject[]
  onNodeClick: (node: TreeNode) => void
  onNodeMarkAsProject: (node: TreeNode) => void
  selectedNodePath: string | null
}
```

Behavior:
- Renders a scrollable tree panel
- Root node is always expanded
- All other nodes are collapsed by default
- Clicking a directory node expands or collapses it
- Clicking a directory node also fires `onNodeClick` to show its details in a side panel
- Nodes that are marked as sub-projects show a colored left border and a stack icon
- File nodes are rendered but not clickable as project markers
- Show count of files inside each directory as a dim label: `(12 files)`

Visual states for directory nodes:
```
Normal:           📁 frontend/
Auto-detected:    📁 frontend/   [Next.js ✦]        ← colored badge, auto icon
Manually marked:  📁 frontend/   [Python ✎]         ← colored badge, pencil icon
Excluded:         📁 frontend/   [excluded]          ← dim, strikethrough name
```

---

#### TreeNode.tsx

Single row in the tree. Handles its own expand/collapse state.

Props:
```typescript
interface TreeNodeProps {
  node: TreeNode
  depth: number
  subProject: SubProject | null     // null if this node is not a sub-project
  isSelected: boolean
  onToggleExpand: () => void
  onClick: () => void
  onMarkAsProject: () => void
  onExclude: () => void
}
```

Layout (left to right):
```
[indent][expand chevron][folder icon][name][file count][sub-project badge][action button]
```

The action button is a small `+` icon that appears on hover for directories that are
not already marked as sub-projects. Clicking it fires `onMarkAsProject`.

For nodes that ARE marked as sub-projects, show a small `×` on hover to unmark them.

---

#### NodeDetailPanel.tsx

Shows when the user clicks a tree node. Appears as a right panel or bottom drawer.

Content:
- Full relative path of the selected folder
- If auto-detected: show which files triggered detection with a list
- If not detected: show "No project type detected automatically"
- **Project type selector** — a dropdown of all ProjectType values, pre-set to detected type or 'unknown'
- **"Mark as sub-project" toggle** — if not already marked, marks it; if marked, unmarks it
- **Loadout assignment** — dropdown of all loadouts, filtered by selected project type
- **Output target selector** — Claude / Cursor / Cline (per sub-project)
- **Output path preview** — shows exactly where the file will be written:
  `apps/frontend/CLAUDE.md`
- **Include / Exclude toggle** — exclude this sub-project from generation without removing it

Do not render this panel until a node is clicked. Show an empty state with instructions before that.

---

### src/components/generation/

#### GenerationPanel.tsx

A bottom bar or side panel that shows the full generation plan before writing files.

Shows:
```
Ready to generate 3 rule files:

  ✓  apps/web/          → apps/web/CLAUDE.md         [Next.js]
  ✓  apps/api/          → apps/api/.cursorrules       [FastAPI]
  ✗  packages/ui/       excluded
  ✓  packages/db/       → packages/db/CLAUDE.md       [Unknown — custom rules]

  [Generate All]   [Review Each]
```

"Generate All" calls the Tauri `write_rule_files` command with all included entries.
"Review Each" opens a step-by-step modal where the user previews each output before writing.

After generation, show inline results per entry:
```
  ✓  apps/web/CLAUDE.md             written successfully
  ✓  apps/api/.cursorrules          written successfully
  ✗  packages/db/CLAUDE.md          failed — no loadout assigned
```

---

#### ReviewModal.tsx

Step-through modal for "Review Each" flow.

Shows one sub-project at a time:
- Sub-project name and path
- The rendered rule file content as a read-only monospace text block
- "Previous" / "Write This File" / "Skip" buttons
- Progress indicator: "2 of 3"

---

### Updates to existing components

#### Home.tsx — update layout

Split into two panels after folder selection:

```
Left panel (40%):    ProjectTree
Right panel (60%):   NodeDetailPanel (empty state until node clicked)

Bottom bar:          GenerationPanel (appears after at least one sub-project is assigned a loadout)
```

Before folder selection: keep the existing large folder picker UI.

---

## Updated Store — useProjectStore.ts

Add these fields and actions:

```typescript
// New fields
subProjects: SubProject[]
tree: TreeNode | null
selectedNodePath: string | null
isMonorepo: boolean

// New actions
setTree: (tree: TreeNode) => void
setSubProjects: (subProjects: SubProject[]) => void
setSelectedNode: (path: string | null) => void

markNodeAsProject: (node: TreeNode, projectType: ProjectType) => void
unmarkNode: (relativePath: string) => void
setSubProjectType: (id: string, type: ProjectType) => void
setSubProjectLoadout: (id: string, loadoutId: string | null) => void
setSubProjectTarget: (id: string, target: OutputTarget) => void
setSubProjectIncluded: (id: string, included: boolean) => void

buildGenerationPlan: () => GenerationPlan   // derived, not stored
```

`buildGenerationPlan` computes the `GenerationPlan` from current state:
- Filter to `included: true` sub-projects
- Filter to sub-projects that have `assignedLoadoutId !== null`
- For each: compute `outputPath` = `absolutePath + '/' + OUTPUT_CONFIGS[outputTarget].filename`
- Return the plan

---

## Generation Logic

### Per-subproject (default and only strategy for now)

Each sub-project gets its own rule file written into its own folder.
Do not implement "combined-root" in this phase. Leave it as a future option in the UI
but disable the button with a "coming soon" tooltip.

### Output path resolution

```typescript
function resolveOutputPath(subProject: SubProject, target: OutputTarget): string {
  const config = OUTPUT_CONFIGS[target]
  return `${subProject.absolutePath}/${config.filename}`
}
```

If a file already exists at that path, show a warning in the GenerationPanel:
```
⚠ apps/web/CLAUDE.md already exists — will be overwritten
```
Do not silently overwrite. Always warn first.

---

## Coding Rules Specific to This Feature

- The tree must never block the UI. Build it in Rust on a background thread and stream the result back.
- Never scan deeper than 4 levels. Hard-limit this in the Rust command, not just a guideline.
- Skip directories listed in the exclusion list unconditionally — do not make this configurable in v1.
- Sub-project state lives only in `useProjectStore`. Do not pass it down as deep props.
- `buildGenerationPlan` must be a pure derived function — no side effects, no async.
- The `ReviewModal` must show rendered output, not raw block data. Run it through the writer before displaying.
- Never auto-generate files without user confirmation. The user must always click "Generate All" or step through "Review Each".
- If a sub-project has no loadout assigned, exclude it from the generation plan silently and show it as an error state in `GenerationPanel`.

---

## Build Order for This Feature

Do these in order. Do not skip ahead.

1. Update `types/index.ts` with all new types above
2. Update `useProjectStore.ts` with new fields and actions
3. Implement updated `detector.rs` — tree builder first, then monorepo detection, then sub-directory scanning
4. Test the Tauri command by logging the result to console before touching UI
5. Implement `TreeNode.tsx`
6. Implement `ProjectTree.tsx` using `TreeNode.tsx`
7. Implement `NodeDetailPanel.tsx`
8. Implement `GenerationPanel.tsx`
9. Implement `ReviewModal.tsx`
10. Update `Home.tsx` with the two-panel layout
11. Implement `writer.rs` `write_rule_files` command
12. Wire `GenerationPanel` → `buildGenerationPlan` → `write_rule_files` → show results

---

## What Not to Build in This Phase

- Do not implement combined-root generation strategy yet
- Do not add file-level rule targeting (rules that apply to specific files, not folders)
- Do not add search or filter to the tree
- Do not add drag-and-drop reordering of sub-projects
- Do not add icons per file type in the tree — folder icon for directories, file icon for files only
- Do not add a file content preview when clicking file nodes
