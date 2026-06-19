import { ChevronRight, ChevronDown, Folder, FileText, Plus, X, Loader2 } from "lucide-react";
import type { TreeNode as TreeNodeType, ExistingRuleFile } from "@/types";
import { PROJECT_TYPE_LABELS } from "@/types";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { useTree } from "@/context/TreeContext";

interface TreeNodeProps {
  node: TreeNodeType;
  onNodeClick: (node: TreeNodeType) => void;
  onMarkAsProject: (node: TreeNodeType) => void;
  onUnmarkProject: (relativePath: string) => void;
  onOpenExistingFile: (file: ExistingRuleFile, subProjectId: string) => void;
}

export function TreeNode({
  node,
  onNodeClick,
  onMarkAsProject,
  onUnmarkProject,
  onOpenExistingFile,
}: TreeNodeProps) {
  const { expandNode, collapseNode } = useTree();
  const [isExpanding, setIsExpanding] = useState(false);
  const subProjects = useProjectStore((s) => s.subProjects);
  const selectedNodePath = useProjectStore((s) => s.selectedNodePath);
  const isSelected = node.absolutePath === selectedNodePath;

  const subProject = node.subProjectId
    ? subProjects.find((sp) => sp.id === node.subProjectId) || null
    : null;

  const handleToggleExpand = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.isExpanded) {
      collapseNode(node.absolutePath);
    } else {
      setIsExpanding(true);
      try {
        await expandNode(node.absolutePath);
      } finally {
        setIsExpanding(false);
      }
    }
  };

  const handleRowClick = () => {
    if (node.isDirectory) {
      onNodeClick(node);
    }
  };

  const isRuleFile = !node.isDirectory && (
    node.name === "CLAUDE.md" ||
    node.name === ".cursorrules" ||
    node.name === ".clinerules"
  );

  return (
    <div className="flex flex-col select-none">
      {/* Node Row */}
      <div
        onClick={handleRowClick}
        style={{ paddingLeft: `${node.depth * 12 + 8}px` }}
        className={cn(
          "group flex items-center gap-2 py-1.5 px-2 text-sm cursor-pointer rounded transition-colors hover:bg-[var(--color-accent)]",
          isSelected && "bg-[var(--color-accent)] font-semibold",
          subProject && "border-l-2 border-primary-500 bg-primary-500/5",
          isRuleFile && "text-amber-500 font-medium"
        )}
      >
        {/* Toggle Expand Icon (Directories only) */}
        {node.isDirectory ? (
          <button
            onClick={handleToggleExpand}
            disabled={isExpanding}
            className="flex h-4 w-4 items-center justify-center rounded text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            {isExpanding ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : !node.isLoaded || node.children.length > 0 ? (
              node.isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
            ) : (
              <span className="w-3 h-3" />
            )}
          </button>
        ) : (
          <span className="w-4 h-4 flex-shrink-0" />
        )}

        {/* Node Icon */}
        {node.isDirectory ? (
          <Folder className={cn("h-4 w-4 text-blue-400 flex-shrink-0", subProject && "text-primary-400")} />
        ) : isRuleFile ? (
          <span className="text-amber-500 font-bold flex-shrink-0">✦</span>
        ) : (
          <FileText className="h-4 w-4 text-[var(--color-muted-foreground)] flex-shrink-0" />
        )}

        {/* Node Name */}
        <span className={cn("truncate flex-1", subProject && "text-[var(--color-primary)]")}>
          {node.name}
          {isRuleFile && <span className="text-[10px] text-[var(--color-muted-foreground)] ml-1.5">(existing)</span>}
        </span>

        {/* Existing Rule Files Badges (Directories only) */}
        {node.isDirectory && node.existingRuleFiles && node.existingRuleFiles.map((file) => (
          <button
            key={file.filename}
            onClick={(e) => {
              e.stopPropagation();
              onOpenExistingFile(file, subProject?.id || "root");
            }}
            title={`Last modified: ${file.lastModified} · ${(file.sizeBytes / 1024).toFixed(1)} KB`}
            className="text-[10px] px-1.5 py-0.5 rounded font-mono border border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
          >
            📄 {file.filename}
          </button>
        ))}

        {/* Tech Stack Badge if subproject */}
        {subProject && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-500/20 text-primary-500 font-medium">
            {PROJECT_TYPE_LABELS[subProject.projectType]} {subProject.detectionSource === "manual" ? "✎" : "✦"}
          </span>
        )}

        {/* Action button (Hover State) */}
        {node.isDirectory && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            {subProject ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUnmarkProject(node.relativePath);
                }}
                title="Remove marked project"
                className="p-1 rounded text-red-500 hover:bg-red-500/10"
              >
                <X className="h-3 w-3" />
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkAsProject(node);
                }}
                title="Mark as sub-project"
                className="p-1 rounded text-green-500 hover:bg-green-500/10"
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
