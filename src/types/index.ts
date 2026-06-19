// ─── Block ─────────────────────────────────────────────────────────────────

export type BlockType =
  | "section"
  | "freeform"
  | "ignore-patterns"
  | "file-structure";

export interface RuleBlock {
  id: string;
  type: BlockType;
  title: string;
  content: string;
  order: number;
}

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  section: "Section",
  freeform: "Freeform",
  "ignore-patterns": "Ignore Patterns",
  "file-structure": "File Structure",
};

export const DEFAULT_BLOCK_TITLES: Record<BlockType, string> = {
  section: "New Section",
  freeform: "",
  "ignore-patterns": "Ignore Patterns",
  "file-structure": "File Structure",
};

// ─── Loadout ────────────────────────────────────────────────────────────────

export type ProjectType =
  | "nextjs"
  | "react-vite"
  | "vue"
  | "nuxt"
  | "python-fastapi"
  | "python-django"
  | "python-general"
  | "node-express"
  | "rust"
  | "go"
  | "laravel"
  | "unknown";

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  nextjs: "Next.js",
  "react-vite": "React + Vite",
  vue: "Vue",
  nuxt: "Nuxt",
  "python-fastapi": "Python FastAPI",
  "python-django": "Python Django",
  "python-general": "Python",
  "node-express": "Node Express",
  rust: "Rust",
  go: "Go",
  laravel: "Laravel",
  unknown: "Unknown",
};

export interface Loadout {
  id: string;
  name: string;
  description: string;
  projectTypes: ProjectType[];
  blocks: RuleBlock[];
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Existing Rule File ──────────────────────────────────────────────────────

export interface ExistingRuleFile {
  filename: string           // e.g. 'CLAUDE.md'
  absolutePath: string;
  relativePath: string;       // relative to project root
  outputTarget: OutputTarget; // inferred from filename
  sizeBytes: number;
  lastModified: string;       // ISO string
  content: string;            // raw file content, read on detection
}

// ─── Sub-Project ─────────────────────────────────────────────────────────────

export type DetectionSource = "auto" | "manual";

export type MonorepoType =
  | "turborepo"
  | "nx"
  | "pnpm-workspace"
  | "lerna"
  | "custom"
  | null;

export interface SubProject {
  id: string;
  name: string;                      // folder name e.g. "frontend"
  relativePath: string;              // relative to root e.g. "apps/frontend"
  absolutePath: string;              // full disk path
  projectType: ProjectType;
  detectionSource: DetectionSource;  // was it auto-detected or manually set by user
  confidence: "high" | "medium" | "low";
  detectedFiles: string[];           // which files triggered auto-detection
  assignedLoadoutId: string | null;
  outputTarget: OutputTarget;        // can be set per sub-project
  included: boolean;                 // user can exclude a sub-project from generation
  existingRuleFiles: ExistingRuleFile[];
  editingExistingFile: ExistingRuleFile | null;   // which file is open in editor, null if new
}

// ─── Tree Node ───────────────────────────────────────────────────────────────

export interface TreeNode {
  name: string;
  relativePath: string;
  absolutePath: string;
  isDirectory: boolean;
  children: TreeNode[];
  subProjectId: string | null;       // set if this node is a marked sub-project
  depth: number;                     // 0 = root
  existingRuleFiles: ExistingRuleFile[];
}

// ─── Detection ──────────────────────────────────────────────────────────────

export interface DetectionResult {
  rootPath: string;
  isMonorepo: boolean;
  monorepoType: MonorepoType;
  rootProjectType: ProjectType;      // what the root itself looks like
  subProjects: SubProject[];         // populated for monorepos, single item for simple projects
  tree: TreeNode;                    // full browsable tree of the selected folder
}

// ─── Generation ──────────────────────────────────────────────────────────────

export type RuleFileStrategy = "per-subproject" | "combined-root";

export interface GenerationPlan {
  strategy: RuleFileStrategy;
  entries: GenerationEntry[];
}

export interface GenerationEntry {
  subProjectId: string;
  subProjectName: string;
  outputPath: string;                // absolute path where the file will be written
  loadoutId: string;
  outputTarget: OutputTarget;
}

// ─── Editor Session ──────────────────────────────────────────────────────────

export type EditorMode = "new" | "editing-existing";

export interface EditorSession {
  subProjectId: string;
  mode: EditorMode;
  sourceFile: ExistingRuleFile | null;   // null when mode is 'new'
  blocks: RuleBlock[];
  isDirty: boolean;                      // true if blocks differ from source content
  outputPath: string;                    // where the file will be written
  outputTarget: OutputTarget;
}

// ─── Output ─────────────────────────────────────────────────────────────────

export type OutputTarget = "claude" | "cursor" | "cline";

export interface OutputConfig {
  target: OutputTarget;
  filename: string;
  format: "markdown" | "plaintext";
}

export const OUTPUT_CONFIGS: Record<OutputTarget, OutputConfig> = {
  claude: { target: "claude", filename: "CLAUDE.md", format: "markdown" },
  cursor: { target: "cursor", filename: ".cursorrules", format: "plaintext" },
  cline: { target: "cline", filename: ".clinerules", format: "markdown" },
};

export const OUTPUT_TARGET_LABELS: Record<OutputTarget, string> = {
  claude: "Claude",
  cursor: "Cursor",
  cline: "Cline",
};

export const STORE_KEY = "loadouts";

