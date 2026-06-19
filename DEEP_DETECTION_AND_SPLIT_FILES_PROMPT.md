# Fix Prompt: Deep Project Detection + Split Rules/Map File Output

This extends the existing ContextCraft project.
Read all previous prompts and the current Omega file first.
Only modify what is specified here. Do not redo existing work.

---

## Problems Being Fixed

**Problem 1 — Detection too shallow:**
Large projects that contain frontend, backend, admin, and api folders as direct
subdirectories are being treated as a single unknown sub-project instead of being
broken into their actual sub-projects. This happens because the detector only checks
for named monorepo indicators (turbo.json, nx.json) and misses custom multi-stack
projects that have no tooling manifest at the root.

**Problem 2 — Rules and routing in one file:**
Generating all rules and file routing into a single file causes the AI to lose
attention on routing content in large projects. The file must be split into two:
a short rules file and a separate map file, with the rules file explicitly
referencing the map file.

---

## Fix 1 — Rewrite the Detection Engine

### The core logic change

Stop treating monorepo detection as a prerequisite for deep scanning.
Instead, always scan subdirectories and let the file evidence decide.

**New detection algorithm — detector.rs:**

```
Step 1: Scan root level for indicator files
Step 2: Scan ALL direct subdirectories for indicator files (unconditionally)
Step 3: If 2 or more subdirectories each have their own indicator files
        → treat the root as a multi-stack project regardless of turbo/nx/lerna
Step 4: For each subdirectory that has indicator files → create a SubProject
Step 5: For subdirectories with NO indicator files → scan THEIR children (level 3)
        This catches structures like: src/frontend/, src/backend/ one level deeper
Step 6: Stop at level 3. Never scan level 4 for sub-project detection.
        (Tree display still goes 4 levels deep — this is separate from detection)
```

### Indicator files that prove a directory is its own sub-project

A directory is its own sub-project if it contains ANY of these:

```rust
const SUBPROJECT_INDICATORS: &[&str] = &[
  // JavaScript / TypeScript
  "package.json",
  "next.config.ts", "next.config.js",
  "vite.config.ts", "vite.config.js",
  "nuxt.config.ts",
  // Python
  "pyproject.toml",
  "requirements.txt",
  "manage.py",          // Django specifically
  "main.py",
  // Rust
  "Cargo.toml",
  // Go
  "go.mod",
  // PHP
  "composer.json",
  "artisan",
  // Ruby
  "Gemfile",
  // Java / Kotlin
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
];
```

If a directory contains any of these → it is a sub-project candidate.
Run the existing single-project type detection logic on it to determine ProjectType.

### Monorepo type detection — updated logic

```rust
fn detect_monorepo_type(root_path: &str, subproject_count: usize) -> (bool, MonorepoType) {
  // Named tooling — check root for these first
  if file_exists(root_path, "turbo.json")           { return (true, Some("turborepo")) }
  if file_exists(root_path, "nx.json")              { return (true, Some("nx")) }
  if file_exists(root_path, "lerna.json")           { return (true, Some("lerna")) }
  if file_exists(root_path, "pnpm-workspace.yaml")  { return (true, Some("pnpm-workspace")) }

  // Custom multi-stack — no tooling manifest but clearly multiple projects
  if subproject_count >= 2 { return (true, Some("custom")) }

  // Single project
  (false, None)
}
```

### Sub-project naming

Use the actual folder name as the sub-project name, not a generic label.
If a `package.json` exists inside the folder and has a `"name"` field,
use that instead of the folder name.

```rust
fn resolve_subproject_name(dir_path: &str, folder_name: &str) -> String {
  if let Ok(content) = fs::read_to_string(format!("{}/package.json", dir_path)) {
    if let Ok(json) = serde_json::from_str::<Value>(&content) {
      if let Some(name) = json["name"].as_str() {
        if !name.is_empty() && !name.starts_with('@') {
          return name.to_string()
        }
      }
    }
  }
  folder_name.to_string()
}
```

### What the updated DetectionResult looks like for a large project

Given a project structure like:
```
my-app/
├── frontend/     (Next.js)
├── backend/      (FastAPI)
├── admin/        (React + Vite)
└── api/          (Express)
```

The result should be:
```json
{
  "rootPath": "/my-app",
  "isMonorepo": true,
  "monorepoType": "custom",
  "rootProjectType": "unknown",
  "subProjects": [
    { "name": "frontend", "relativePath": "frontend", "projectType": "nextjs" },
    { "name": "backend",  "relativePath": "backend",  "projectType": "python-fastapi" },
    { "name": "admin",    "relativePath": "admin",    "projectType": "react-vite" },
    { "name": "api",      "relativePath": "api",      "projectType": "node-express" }
  ]
}
```

Not this:
```json
{
  "subProjects": [
    { "name": "my-app", "projectType": "unknown" }
  ]
}
```

### Directories to always skip during detection (never create SubProject for these)

```rust
const DETECTION_SKIP_DIRS: &[&str] = &[
  "node_modules", ".git", "dist", "build", ".next", "out",
  "__pycache__", "target", ".turbo", ".cache", "coverage",
  ".venv", "venv", "env", ".env", "vendor", "tmp", "temp",
  ".idea", ".vscode", "public", "static", "assets", "media",
  "uploads", "logs", "migrations", "fixtures",
];
```

These are skipped for sub-project detection only.
The tree display still shows them (greyed out) so the user can see the full structure.

---

## Fix 2 — Split Output Into Two Files Per Sub-Project

Every generation target now produces TWO files instead of one.

### File 1 — Rules file (CLAUDE.md / .cursorrules / .clinerules)

Short. Always under 80 lines. Contains only:
- A reference to the map file at the very top
- Tech stack table
- Coding rules blocks from the loadout
- Ignore patterns

### File 2 — Map file (CLAUDE_MAP.md / .cursorrules_map / .clinerules_map)

No size limit. Contains only:
- Full file routing for this sub-project
- Auto-generated from the actual detected folder tree
- No rules, no tech stack — routing only

### Output file naming per target

```typescript
export const OUTPUT_CONFIGS: Record<OutputTarget, { rulesFile: string, mapFile: string, format: string }> = {
  claude: { rulesFile: 'CLAUDE.md',        mapFile: 'CLAUDE_MAP.md',        format: 'markdown'  },
  cursor: { rulesFile: '.cursorrules',     mapFile: '.cursorrules_map',     format: 'plaintext' },
  cline:  { rulesFile: '.clinerules',      mapFile: '.clinerules_map',      format: 'markdown'  },
}
```

---

## Updated Types — types/index.ts

```typescript
// Update GenerationEntry
export interface GenerationEntry {
  subProjectId: string
  subProjectName: string
  rulesOutputPath: string      // absolute path for rules file
  mapOutputPath: string        // absolute path for map file
  loadoutId: string
  outputTarget: OutputTarget
  existingRulesFile: ExistingRuleFile | null
  existingMapFile: ExistingRuleFile | null
}

// Update OutputConfig
export interface OutputConfig {
  rulesFile: string
  mapFile: string
  format: 'markdown' | 'plaintext'
}
```

---

## Updated Writers

### claudeWriter.ts — split into two functions

```typescript
import type { RuleBlock, SubProject, TreeNode } from '../types'

// ─── File 1: Rules ───────────────────────────────────────────────────────────

export function renderClaudeRules(
  blocks: RuleBlock[],
  subProjectName: string,
  mapFileName: string = 'CLAUDE_MAP.md'
): string {
  const sorted = [...blocks].sort((a, b) => a.order - b.order)

  const rulesContent = sorted.map(block => {
    if (block.type === 'freeform') return block.content.trim()
    if (block.type === 'ignore-patterns') {
      return `## Ignore Completely\n\n${block.content.trim()}`
    }
    return `## ${block.title}\n\n${block.content.trim()}`
  }).join('\n\n---\n\n')

  return [
    `# ${subProjectName} — Rules`,
    ``,
    `> **File Map**: See [${mapFileName}](./${mapFileName}) before navigating this project.`,
    `> Update ${mapFileName} whenever a file is added or removed.`,
    ``,
    `---`,
    ``,
    rulesContent,
  ].join('\n')
}

// ─── File 2: Map ─────────────────────────────────────────────────────────────

export function renderClaudeMap(
  subProject: SubProject,
  tree: TreeNode,
  rulesFileName: string = 'CLAUDE.md'
): string {
  const mapContent = buildMapContent(tree, subProject.relativePath)

  return [
    `# ${subProject.name} — File Map`,
    ``,
    `> Referenced by [${rulesFileName}](./${rulesFileName}).`,
    `> Update this file whenever a file is added or removed.`,
    ``,
    `---`,
    ``,
    mapContent,
  ].join('\n')
}

function buildMapContent(tree: TreeNode, rootRelativePath: string): string {
  const sections: string[] = []

  // Walk the tree and group by directory
  // Each directory becomes a section header
  // Each file under it becomes a bullet: `path — [purpose if known]`

  function walkNode(node: TreeNode, depth: number): void {
    if (!node.isDirectory) return

    const heading = depth === 0
      ? `## Root (${rootRelativePath}/)`
      : `### ${node.relativePath.replace(rootRelativePath + '/', '')}/`

    const fileLines = node.children
      .filter(child => !child.isDirectory)
      .map(child => {
        const shortPath = child.relativePath.replace(rootRelativePath + '/', '')
        return `- \`${shortPath}\``
      })

    if (fileLines.length > 0) {
      sections.push(`${heading}\n\n${fileLines.join('\n')}`)
    }

    node.children
      .filter(child => child.isDirectory)
      .forEach(child => walkNode(child, depth + 1))
  }

  walkNode(tree, 0)
  return sections.join('\n\n')
}
```

Apply the same split pattern to `cursorWriter.ts` and `clineWriter.ts`.
The map file for plaintext targets uses the same structure but without markdown headings —
use plain section labels instead:

```
[Root]
- src/main.ts
- src/app.ts

[src/routes/]
- src/routes/index.ts
- src/routes/auth.ts
```

---

## Updated Rust Writer Command

```rust
// Replace write_rule_files with this updated signature
pub fn write_rule_files(entries: Vec<GenerationEntry>) -> Vec<WriteResult>

pub struct WriteResult {
  pub sub_project_id: String,
  pub rules_path: String,
  pub map_path: String,
  pub rules_success: bool,
  pub map_success: bool,
  pub rules_error: Option<String>,
  pub map_error: Option<String>,
}
```

Write both files in sequence. If the rules file write fails, do not attempt
the map file write for that entry. Report both outcomes independently.

---

## Updated GenerationPanel.tsx

Show both files per entry in the generation plan:

```
Ready to generate 2 sub-projects (4 files total):

  apps/frontend/      [Next.js]
  ├── ✓  CLAUDE.md             new file
  └── ✓  CLAUDE_MAP.md         new file

  apps/backend/       [FastAPI]
  ├── ⚠  CLAUDE.md             already exists — will be overwritten
  └── ✓  CLAUDE_MAP.md         new file

  [Generate All]    [Review Each]
```

After generation, show per-file results:
```
  apps/frontend/
  ├── ✓  CLAUDE.md             written
  └── ✓  CLAUDE_MAP.md         written

  apps/backend/
  ├── ✓  CLAUDE.md             written (overwritten)
  └── ✗  CLAUDE_MAP.md         failed — permission denied
```

---

## Updated ReviewModal.tsx

Show two tabs per sub-project: "Rules" and "Map".
Default to showing the Rules tab first.
Both must be reviewed before the "Write This Sub-Project" button is enabled.
Dim the tab label until it has been opened at least once.

```
┌─── apps/frontend  (1 of 2) ────────────────────────────────┐
│                                                             │
│  [Rules ✓]  [Map]                                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ # frontend — Rules                                  │   │
│  │                                                     │   │
│  │ > File Map: See CLAUDE_MAP.md before navigating.   │   │
│  │                                                     │   │
│  │ ## Tech Stack                                       │   │
│  │ ...                                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Previous]  [Write This Sub-Project]  [Skip]              │
│                                  (disabled until Map read) │
└─────────────────────────────────────────────────────────────┘
```

---

## Updated buildGenerationPlan in useProjectStore.ts

```typescript
buildGenerationPlan(): GenerationPlan {
  const config = OUTPUT_CONFIGS[subProject.outputTarget]

  const rulesOutputPath = `${subProject.absolutePath}/${config.rulesFile}`
  const mapOutputPath   = `${subProject.absolutePath}/${config.mapFile}`

  const existingRulesFile = subProject.existingRuleFiles
    .find(f => f.filename === config.rulesFile) ?? null

  const existingMapFile = subProject.existingRuleFiles
    .find(f => f.filename === config.mapFile) ?? null

  return {
    subProjectId: subProject.id,
    subProjectName: subProject.name,
    rulesOutputPath,
    mapOutputPath,
    loadoutId: subProject.assignedLoadoutId!,
    outputTarget: subProject.outputTarget,
    existingRulesFile,
    existingMapFile,
  }
}
```

---

## Updated NodeDetailPanel.tsx

When showing the output path preview, now show both files:

```
Output files:
  📄 apps/frontend/CLAUDE.md          ← rules
  📄 apps/frontend/CLAUDE_MAP.md      ← file map
```

If either already exists, show it in amber as before.

---

## Build Order for These Fixes

Do these in strict order. Test each step before moving to the next.

1. Update `types/index.ts` — update GenerationEntry and OutputConfig
2. Rewrite `detector.rs` detection algorithm completely
   - Keep the tree builder as-is
   - Rewrite only the sub-project scanning logic
   - Test with a real large multi-stack project folder, log the result to console
   - Confirm all 4 sub-projects are detected before touching UI
3. Update `claudeWriter.ts` — split into renderClaudeRules and renderClaudeMap
4. Update `cursorWriter.ts` and `clineWriter.ts` with the same split
5. Update `writer.rs` with the new WriteResult structure
6. Update `buildGenerationPlan` in `useProjectStore.ts`
7. Update `GenerationPanel.tsx` to show two files per entry
8. Update `ReviewModal.tsx` with the two-tab layout
9. Update `NodeDetailPanel.tsx` output path preview
10. End-to-end test: large multi-stack project → detect 4 sub-projects
    → assign loadouts → generate → verify both files written correctly
    → open CLAUDE.md → confirm map reference is at the top
    → open CLAUDE_MAP.md → confirm routing is correct

---

## Coding Rules Specific to These Fixes

- The detection scan and the tree display scan are two separate operations.
  Do not merge them. Tree always goes 4 levels deep. Detection goes 3 levels max.
- Detection must never create a SubProject for a directory in DETECTION_SKIP_DIRS.
- The rules file reference to the map file must always be the second line of the
  output after the title. Never bury it further down.
- renderClaudeRules and renderClaudeMap are pure functions. No filesystem access.
  All filesystem operations stay in writer.rs.
- The map file content is generated from the live TreeNode data, not from the
  loadout blocks. Loadout blocks only go into the rules file.
- If a sub-project's tree data is unavailable (rare edge case), write the rules
  file only and skip the map file. Log a warning in the WriteResult, do not fail
  the entire generation.
- Never hardcode file paths in writers. Always derive them from SubProject data.

---

## What Not to Do in This Fix

- Do not change the tree display depth — it stays at 4 levels
- Do not change how existing rule file detection works — it already checks for
  existing files correctly, just extend it to also check for the map filename
- Do not add a UI to manually edit the map file inside the app —
  it is auto-generated only, the user edits it externally if needed
- Do not merge the rules and map content into one file under any condition
