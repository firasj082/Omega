# Feature Prompt: Existing Rule File Detection + In-Place Editor

This extends the existing ContextCraft project.
Read CURSOR_PROJECT_PROMPT.md and MULTI_STACK_FEATURE_PROMPT.md first.
Only add or modify what is specified here. Do not redo existing work.

---

## What This Feature Does

When the tree is built and rendered:
1. The Rust detector checks every directory node for existing rule files (CLAUDE.md, .cursorrules, .clinerules)
2. If found, those file nodes render with a distinct amber color and an edit icon
3. The parent directory node also gets a distinct visual indicator showing it already has a rule file
4. Clicking either the file node or the indicator on the directory opens the editor with the file content pre-loaded as blocks
5. The user can view, edit, and save changes back to the same file
6. The editor clearly shows whether it is editing an existing file or creating a new one

---

## Updated Types — add to types/index.ts

```typescript
// ─── Existing Rule File ──────────────────────────────────────────────────────

export interface ExistingRuleFile {
  filename: string           // e.g. 'CLAUDE.md'
  absolutePath: string
  relativePath: string       // relative to project root
  outputTarget: OutputTarget // inferred from filename
  sizeBytes: number
  lastModified: string       // ISO string
  content: string            // raw file content, read on detection
}

// ─── Updated TreeNode — add this field ───────────────────────────────────────

// Add to existing TreeNode interface:
existingRuleFiles: ExistingRuleFile[]   // empty array if none found

// ─── Updated SubProject — add these fields ───────────────────────────────────

// Add to existing SubProject interface:
existingRuleFiles: ExistingRuleFile[]
editingExistingFile: ExistingRuleFile | null   // which file is open in editor, null if new

// ─── Editor Session ──────────────────────────────────────────────────────────

export type EditorMode = 'new' | 'editing-existing'

export interface EditorSession {
  subProjectId: string
  mode: EditorMode
  sourceFile: ExistingRuleFile | null   // null when mode is 'new'
  blocks: RuleBlock[]
  isDirty: boolean                      // true if blocks differ from source content
  outputPath: string                    // where the file will be written
  outputTarget: OutputTarget
}
```

---

## Updated Rust — detector.rs

After building each TreeNode for a directory, scan it for rule files before returning:

```rust
// Rule files to look for in every directory
const RULE_FILENAMES: &[&str] = &[
  "CLAUDE.md",
  ".cursorrules",
  ".clinerules",
];

fn scan_existing_rule_files(dir_path: &str) -> Vec<ExistingRuleFile> {
  RULE_FILENAMES.iter().filter_map(|filename| {
    let file_path = format!("{}/{}", dir_path, filename);
    if Path::new(&file_path).exists() {
      let content = fs::read_to_string(&file_path).unwrap_or_default();
      let metadata = fs::metadata(&file_path).ok()?;
      Some(ExistingRuleFile {
        filename: filename.to_string(),
        absolute_path: file_path.clone(),
        relative_path: relative_to_root(&file_path, &root_path),
        output_target: infer_target_from_filename(filename),
        size_bytes: metadata.len(),
        last_modified: system_time_to_iso(metadata.modified().ok()?),
        content,
      })
    } else {
      None
    }
  }).collect()
}

fn infer_target_from_filename(filename: &str) -> OutputTarget {
  match filename {
    "CLAUDE.md"    => OutputTarget::Claude,
    ".cursorrules" => OutputTarget::Cursor,
    ".clinerules"  => OutputTarget::Cline,
    _              => OutputTarget::Claude,
  }
}
```

Call `scan_existing_rule_files` on every directory node when building the tree.
Attach the result to the `existingRuleFiles` field of each `TreeNode`.
Also attach it to the matching `SubProject` when sub-projects are resolved.

---

## New Utility — src/utils/ruleFileParser.ts

Parses raw rule file content back into an array of RuleBlock objects.
This is needed to pre-populate the editor when opening an existing file.

```typescript
import type { RuleBlock, OutputTarget } from '../types'
import { nanoid } from './id'

export function parseRuleFileToBlocks(
  content: string,
  target: OutputTarget
): RuleBlock[] {
  if (target === 'claude' || target === 'cline') {
    return parseMarkdownToBlocks(content)
  }
  return parsePlaintextToBlocks(content)
}

function parseMarkdownToBlocks(content: string): RuleBlock[] {
  // Split on the divider used by claudeWriter: '\n\n---\n\n'
  // Each chunk is either:
  //   - A section: starts with '## Title\n\n' followed by content
  //   - A freeform block: no heading, raw content
  
  const chunks = content.split('\n\n---\n\n').filter(c => c.trim())
  
  return chunks.map((chunk, index) => {
    const headingMatch = chunk.match(/^## (.+)\n\n([\s\S]*)$/)
    if (headingMatch) {
      return {
        id: nanoid(),
        type: 'section' as const,
        title: headingMatch[1].trim(),
        content: headingMatch[2].trim(),
        order: index,
      }
    }
    return {
      id: nanoid(),
      type: 'freeform' as const,
      title: '',
      content: chunk.trim(),
      order: index,
    }
  })
}

function parsePlaintextToBlocks(content: string): RuleBlock[] {
  // .cursorrules files are unstructured plaintext
  // Try to split on blank lines between sections
  // If no clear sections, return as a single freeform block

  const lines = content.split('\n')
  const sections: string[][] = []
  let current: string[] = []

  for (const line of lines) {
    if (line.trim() === '' && current.length > 0) {
      sections.push(current)
      current = []
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) sections.push(current)

  if (sections.length <= 1) {
    return [{
      id: nanoid(),
      type: 'freeform',
      title: '',
      content: content.trim(),
      order: 0,
    }]
  }

  return sections.map((section, index) => ({
    id: nanoid(),
    type: 'freeform' as const,
    title: '',
    content: section.join('\n').trim(),
    order: index,
  }))
}
```

---

## Updated Frontend Components

### TreeNode.tsx — visual updates

**Directory nodes with existing rule files:**

Add an indicator badge directly after the folder name:

```
📁 frontend/   [Next.js ✦]   [📄 CLAUDE.md]
```

The `[📄 CLAUDE.md]` badge:
- Background: amber-500/20, border: amber-500/40, text: amber-400
- Shows the filename only, not the full path
- If multiple rule files exist, show multiple badges: `[📄 CLAUDE.md]` `[📄 .cursorrules]`
- Clicking any badge opens the editor for that specific file
- Show a tooltip on hover: "Last modified: {date} · {size}"
- Never show this badge on file nodes — only on directory nodes

**File nodes for rule files (CLAUDE.md, .cursorrules, .clinerules):**

When a rule file appears as a child node in the tree:
- Render it with amber-400 text color instead of the default muted text
- Prefix with a distinct icon: ✦ (not a folder or plain file icon)
- Clicking it opens the editor for that file
- Show `(existing)` label in dim text after the filename

**Directory nodes that have NO existing rule files and are marked as sub-projects:**

No change from current behavior. Only add indicators when files exist.

---

### NodeDetailPanel.tsx — add existing file section

When a node is selected that has existing rule files, add a section above the
project type selector:

```
┌─ Existing Rule Files ─────────────────────────────────────┐
│                                                            │
│  📄 CLAUDE.md                                              │
│     Last modified: 2 days ago · 1.2 KB                    │
│     [Open in Editor]                                       │
│                                                            │
│  📄 .cursorrules                                           │
│     Last modified: 5 days ago · 0.8 KB                    │
│     [Open in Editor]                                       │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

"Open in Editor" button:
- Calls `parseRuleFileToBlocks(file.content, file.outputTarget)`
- Loads resulting blocks into the editor session
- Sets `EditorSession.mode` to `'editing-existing'`
- Sets `EditorSession.sourceFile` to the clicked file
- Navigates to `/editor`

---

### Editor.tsx — show editing mode clearly

At the very top of the editor, show a context bar that changes based on mode:

**New file mode:**
```
┌────────────────────────────────────────────────────────────┐
│  ✦  New file · apps/frontend/CLAUDE.md                     │
└────────────────────────────────────────────────────────────┘
```
Background: neutral, no special color.

**Editing existing file mode:**
```
┌────────────────────────────────────────────────────────────┐
│  ✎  Editing existing · apps/frontend/CLAUDE.md             │
│     Last modified 2 days ago · Changes will overwrite      │
└────────────────────────────────────────────────────────────┘
```
Background: amber-500/10, left border: amber-500.
This context bar must always be visible — do not hide it on scroll.

**Dirty state indicator:**

When `EditorSession.isDirty` is true (blocks have changed from source):
- Show a dot next to the file name: `✎  Editing existing · apps/frontend/CLAUDE.md ●`
- The dot is amber-400
- The "Generate File" / "Save" button changes label to "Save Changes" in editing mode

**Save behavior in editing mode:**

"Save Changes" in editing mode writes directly to `sourceFile.absolutePath`.
Do not ask for a target location — the file path is already known.
Show a confirmation dialog before overwriting:

```
┌─ Overwrite existing file? ────────────────────────────────┐
│                                                            │
│  This will replace the content of:                        │
│  apps/frontend/CLAUDE.md                                  │
│                                                            │
│  The original content cannot be recovered after saving.   │
│                                                            │
│  [Cancel]                          [Overwrite and Save]   │
└────────────────────────────────────────────────────────────┘
```

After a successful save, update `isDirty` to false and show a success toast.

---

### GenerationPanel.tsx — show existing file conflicts

For each entry in the generation plan, check if a rule file already exists at the output path.
If it does, show a warning inline:

```
  ⚠  apps/web/CLAUDE.md          already exists — will be overwritten
  ✓  apps/api/.cursorrules        new file
  ✓  packages/db/CLAUDE.md        new file
```

The `⚠` rows use amber-400 color for the icon and file path.
Add a global notice at the top if any conflicts exist:

```
┌────────────────────────────────────────────────────────────┐
│  ⚠  2 files will be overwritten. Review before generating. │
└────────────────────────────────────────────────────────────┘
```

"Generate All" when conflicts exist:
- If any entry has an existing file, show the overwrite confirmation dialog once for all
- List all files that will be overwritten in the dialog
- One confirmation covers all of them — do not ask per file

---

## Updated Store — add to useProjectStore.ts

```typescript
// New fields
editorSession: EditorSession | null

// New actions
openExistingFile: (file: ExistingRuleFile, subProjectId: string) => void
closeEditorSession: () => void
setSessionBlocks: (blocks: RuleBlock[]) => void
markSessionDirty: () => void

// openExistingFile implementation:
openExistingFile(file, subProjectId) {
  const blocks = parseRuleFileToBlocks(file.content, file.outputTarget)
  set({
    editorSession: {
      subProjectId,
      mode: 'editing-existing',
      sourceFile: file,
      blocks,
      isDirty: false,
      outputPath: file.absolutePath,
      outputTarget: file.outputTarget,
    }
  })
}
```

`markSessionDirty` is called inside `updateBlock`, `addBlock`, `removeBlock`,
and `reorderBlocks` when an `editorSession` is active.
Compare current blocks to parsed source blocks to determine dirty state —
do not just set `isDirty: true` on any change.

---

## New Tauri Command — writer.rs

```rust
// Read a rule file from disk — used to refresh content if file changes externally
pub fn read_rule_file(absolute_path: String) -> Result<String, String>
```

This is a simple file read. Wrap it in the standard Tauri command macro.
Call it when the user opens NodeDetailPanel on a node with existing files,
to ensure the content is current and not stale from the initial tree scan.

---

## Coding Rules Specific to This Feature

- Never parse file content in Rust beyond reading it as a string — all parsing logic lives in `ruleFileParser.ts`
- `parseRuleFileToBlocks` must handle malformed or unexpected content gracefully — always return at least one freeform block with the raw content rather than throwing
- `isDirty` is computed by comparing block content, not by tracking edit events
- The amber color used for existing file indicators must be consistent everywhere: use `amber-400` for text and icons, `amber-500/20` for backgrounds, `amber-500/40` for borders — no other amber shades
- The overwrite confirmation dialog is non-negotiable — never skip it even if the user has confirmed before
- `EditorSession` is the single source of truth for what is open in the editor — do not derive editor state from `SubProject` or `TreeNode` directly
- When navigating away from the editor with `isDirty: true`, show an unsaved changes warning before leaving

---

## Build Order for This Feature

1. Add new types to `types/index.ts`
2. Update `detector.rs` to scan for existing rule files in every directory node
3. Test the updated command — log results for a real project folder before touching UI
4. Implement `ruleFileParser.ts` — write unit tests for both markdown and plaintext parsing
5. Add `editorSession` and related actions to `useProjectStore.ts`
6. Update `TreeNode.tsx` with amber badges and click handlers for existing files
7. Update `NodeDetailPanel.tsx` with the existing files section
8. Update `Editor.tsx` with the context bar and dirty state indicator
9. Update `GenerationPanel.tsx` with conflict warnings
10. Add the `read_rule_file` Tauri command and wire it to `NodeDetailPanel`
11. Test the full round-trip: detect existing file → open in editor → edit → save → verify on disk

---

## What Not to Build in This Phase

- Do not add a diff view showing what changed between original and edited content
- Do not add file history or undo beyond the editor's existing block-level undo
- Do not add syntax highlighting to the editor content areas
- Do not add the ability to delete existing rule files from within the app
- Do not auto-reload the file if it changes on disk while the app is open
