import { useProjectStore } from "@/store/useProjectStore";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import type { TreeNode, ExistingRuleFile, ProjectType, OutputTarget } from "@/types";
import { PROJECT_TYPE_LABELS, OUTPUT_CONFIGS, OUTPUT_TARGET_LABELS } from "@/types";
import { cn } from "@/lib/utils";
import { AlertCircle, FileText, Check, Plus, Trash2, ExternalLink } from "lucide-react";

interface NodeDetailPanelProps {
  node: TreeNode | null;
  onOpenExistingFile: (file: ExistingRuleFile, subProjectId: string) => void;
}

export function NodeDetailPanel({ node, onOpenExistingFile }: NodeDetailPanelProps) {
  const {
    subProjects,
    markNodeAsProject,
    unmarkNode,
    setSubProjectType,
    setSubProjectLoadout,
    setSubProjectTarget,
    setSubProjectIncluded,
  } = useProjectStore();

  const loadouts = useLoadoutStore((s) => s.loadouts);

  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--color-card)] rounded-md border border-[var(--color-border)] p-8 text-center">
        <FileText className="h-10 w-10 text-[var(--color-muted-foreground)] opacity-40 mb-3" />
        <h3 className="text-sm font-semibold text-[var(--color-foreground)]">No node selected</h3>
        <p className="text-xs text-[var(--color-muted-foreground)] mt-1 max-w-xs">
          Click any directory node in the workspace tree to view details and assign custom rule sets.
        </p>
      </div>
    );
  }

  // Find if this node corresponds to a subproject
  const subProject = node.subProjectId
    ? subProjects.find((sp) => sp.id === node.subProjectId) || null
    : null;

  // Filter loadouts by the selected subproject's type
  const availableLoadouts = subProject
    ? loadouts.filter((l) => l.projectTypes.includes(subProject.projectType))
    : [];

  const handleMarkAsProject = () => {
    // Detect project type or default to unknown
    const defaultType = subProject ? subProject.projectType : "unknown";
    markNodeAsProject(node, defaultType as ProjectType);
  };

  const handleUnmarkProject = () => {
    unmarkNode(node.relativePath);
  };

  return (
    <div className="flex h-full flex-col bg-[var(--color-card)] rounded-md border border-[var(--color-border)] overflow-hidden">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Node Details: {node.name}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-5">
        {/* Relative Path */}
        <div>
          <label className="text-xs font-medium text-[var(--color-muted-foreground)] uppercase tracking-wider block">
            Workspace Path
          </label>
          <div className="text-sm font-mono bg-[var(--color-muted)] p-2 rounded mt-1 overflow-x-auto select-all border border-[var(--color-border)]">
            {node.relativePath || "./ (root)"}
          </div>
        </div>

        {/* Existing Rule Files Section */}
        {node.existingRuleFiles && node.existingRuleFiles.length > 0 && (
          <div className="border border-amber-500/20 bg-amber-500/5 rounded-md p-3">
            <h4 className="text-xs font-semibold text-amber-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <AlertCircle className="h-3.5 w-3.5" /> Existing Rule Files
            </h4>
            <div className="space-y-2">
              {node.existingRuleFiles.map((file) => (
                <div
                  key={file.filename}
                  className="flex items-center justify-between text-xs border-b border-amber-500/10 pb-2 last:border-b-0 last:pb-0"
                >
                  <div>
                    <span className="font-semibold text-[var(--color-foreground)] block">
                      📄 {file.filename}
                    </span>
                    <span className="text-[10px] text-[var(--color-muted-foreground)]">
                      Modified: {file.lastModified} · {(file.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <button
                    onClick={() => onOpenExistingFile(file, subProject?.id || "root")}
                    className="flex items-center gap-1 px-2.5 py-1 rounded font-medium border border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors"
                  >
                    Open in Editor <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sub-Project Settings */}
        {subProject ? (
          <div className="space-y-4">
            {/* Marked Status */}
            <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-4">
              <div>
                <span className="text-xs font-semibold text-green-500 flex items-center gap-1">
                  <Check className="h-4 w-4" /> Configured Sub-Project
                </span>
                <span className="text-[10px] text-[var(--color-muted-foreground)]">
                  Mode: {subProject.detectionSource === "manual" ? "Manually Added" : "Auto-Detected"}
                </span>
              </div>
              <button
                onClick={handleUnmarkProject}
                className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-red-500 rounded border border-red-500/20 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" /> Unmark Project
              </button>
            </div>

            {/* Include/Exclude Toggle */}
            <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
              <div>
                <label className="text-xs font-semibold text-[var(--color-foreground)]">
                  Include in Generation
                </label>
                <span className="text-[10px] text-[var(--color-muted-foreground)] block">
                  Write rules for this path on batch compile
                </span>
              </div>
              <button
                onClick={() => setSubProjectIncluded(subProject.id, !subProject.included)}
                className={cn(
                  "px-3 py-1 rounded text-xs font-semibold border transition-all",
                  subProject.included
                    ? "bg-green-500/10 text-green-500 border-green-500/20"
                    : "bg-red-500/10 text-red-500 border-red-500/20"
                )}
              >
                {subProject.included ? "Included" : "Excluded"}
              </button>
            </div>

            {/* Project Type Selector */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--color-muted-foreground)] uppercase block">
                Project Type
              </label>
              <select
                value={subProject.projectType}
                onChange={(e) => setSubProjectType(subProject.id, e.target.value as ProjectType)}
                className="w-full text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-input)] p-2 text-[var(--color-foreground)] outline-none"
              >
                {Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Loadout Selector */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--color-muted-foreground)] uppercase block">
                Rule Template Loadout
              </label>
              <select
                value={subProject.assignedLoadoutId || ""}
                onChange={(e) => setSubProjectLoadout(subProject.id, e.target.value || null)}
                className="w-full text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-input)] p-2 text-[var(--color-foreground)] outline-none"
              >
                <option value="">-- No Loadout Assigned --</option>
                {availableLoadouts.map((loadout) => (
                  <option key={loadout.id} value={loadout.id}>
                    {loadout.name} {loadout.isBuiltIn ? "(Built-in)" : ""}
                  </option>
                ))}
              </select>
              {availableLoadouts.length === 0 && (
                <span className="text-[10px] text-amber-500 block">
                  No matching templates found for {PROJECT_TYPE_LABELS[subProject.projectType]}. Make sure to create one in Loadouts!
                </span>
              )}
            </div>

            {/* Target Output Config */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--color-muted-foreground)] uppercase block">
                Output File Target
              </label>
              <select
                value={subProject.outputTarget}
                onChange={(e) => setSubProjectTarget(subProject.id, e.target.value as OutputTarget)}
                className="w-full text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-input)] p-2 text-[var(--color-foreground)] outline-none"
              >
                {Object.entries(OUTPUT_TARGET_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label} ({OUTPUT_CONFIGS[value as OutputTarget].filename})
                  </option>
                ))}
              </select>
            </div>

            {/* Output File Preview Path */}
            <div className="bg-[var(--color-muted)] border border-[var(--color-border)] rounded-md p-2.5 text-xs text-[var(--color-muted-foreground)]">
              <span className="font-semibold block text-[var(--color-foreground)]">
                Output Target:
              </span>
              <span className="font-mono mt-1 block select-all">
                {subProject.relativePath
                  ? `${subProject.relativePath}/${OUTPUT_CONFIGS[subProject.outputTarget].filename}`
                  : OUTPUT_CONFIGS[subProject.outputTarget].filename}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 border border-dashed border-[var(--color-border)] rounded-lg text-center space-y-3">
            <span className="text-xs text-[var(--color-muted-foreground)]">
              This folder is not configured as a sub-project. To assign custom rules or templates to this path, mark it as a sub-project.
            </span>
            <button
              onClick={handleMarkAsProject}
              className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-semibold rounded-md text-xs hover:opacity-90 transition-all"
            >
              <Plus className="h-4 w-4" /> Mark as Sub-Project
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
