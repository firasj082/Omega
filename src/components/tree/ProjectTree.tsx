import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TreeNode } from "./TreeNode";
import type { TreeNode as TreeNodeType, ExistingRuleFile } from "@/types";
import { useTree } from "@/context/TreeContext";

interface ProjectTreeProps {
  onNodeClick: (node: TreeNodeType) => void;
  onMarkAsProject: (node: TreeNodeType) => void;
  onUnmarkProject: (relativePath: string) => void;
  onOpenExistingFile: (file: ExistingRuleFile, subProjectId: string) => void;
}

export function ProjectTree({
  onNodeClick,
  onMarkAsProject,
  onUnmarkProject,
  onOpenExistingFile,
}: ProjectTreeProps) {
  const { flatNodes, tree } = useTree();
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32, // estimated height of each row
    overscan: 10,
  });

  if (!tree) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--color-card)] rounded-md border border-[var(--color-border)] p-8 text-center">
        <span className="text-xs text-[var(--color-muted-foreground)]">
          No project tree loaded.
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-card)] rounded-md border border-[var(--color-border)] overflow-hidden">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Project Workspace Tree
        </span>
      </div>
      <div ref={parentRef} className="flex-1 overflow-auto p-2">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const node = flatNodes[virtualItem.index];
            if (!node) return null;
            return (
              <div
                key={node.absolutePath}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <TreeNode
                  node={node}
                  onNodeClick={onNodeClick}
                  onMarkAsProject={onMarkAsProject}
                  onUnmarkProject={onUnmarkProject}
                  onOpenExistingFile={onOpenExistingFile}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
