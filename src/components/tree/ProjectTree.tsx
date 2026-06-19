import { TreeNode } from "./TreeNode";
import type { TreeNode as TreeNodeType, ExistingRuleFile } from "@/types";

interface ProjectTreeProps {
  tree: TreeNodeType;
  onNodeClick: (node: TreeNodeType) => void;
  onMarkAsProject: (node: TreeNodeType) => void;
  onUnmarkProject: (relativePath: string) => void;
  onOpenExistingFile: (file: ExistingRuleFile, subProjectId: string) => void;
}

export function ProjectTree({
  tree,
  onNodeClick,
  onMarkAsProject,
  onUnmarkProject,
  onOpenExistingFile,
}: ProjectTreeProps) {
  return (
    <div className="flex h-full flex-col bg-[var(--color-card)] rounded-md border border-[var(--color-border)] overflow-hidden">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Project Workspace Tree
        </span>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <TreeNode
          node={tree}
          depth={0}
          onNodeClick={onNodeClick}
          onMarkAsProject={onMarkAsProject}
          onUnmarkProject={onUnmarkProject}
          onOpenExistingFile={onOpenExistingFile}
        />
      </div>
    </div>
  );
}
