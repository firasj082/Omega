import React, { createContext, useContext, useState, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TreeNode } from "@/types";
import { useProjectStore } from "@/store/useProjectStore";
import { toast } from "sonner";

interface TreeContextValue {
  tree: TreeNode | null;
  setTree: (tree: TreeNode | null) => void;
  getNode: (path: string) => TreeNode | null;
  expandNode: (path: string) => Promise<void>;
  collapseNode: (path: string) => void;
  flatNodes: TreeNode[];
}

export const TreeContext = createContext<TreeContextValue>(null!);

export function TreeProvider({ children }: { children: React.ReactNode }) {
  const [tree, setTreeState] = useState<TreeNode | null>(null);
  
  const subProjects = useProjectStore(s => s.subProjects);

  const setTree = useCallback((newTree: TreeNode | null) => {
    setTreeState(newTree);
  }, []);

  const getNode = useCallback((path: string): TreeNode | null => {
    return findNodeInTree(tree, path);
  }, [tree]);

  const collapseNode = useCallback((path: string) => {
    setTreeState(prev => {
      if (!prev) return null;
      return updateNodeInTree(prev, path, node => ({
        ...node,
        isExpanded: false
      }));
    });
  }, []);

  const expandNode = useCallback(async (path: string) => {
    const node = findNodeInTree(tree, path);
    if (!node) return;

    if (node.isLoaded) {
      setTreeState(prev => {
        if (!prev) return null;
        return updateNodeInTree(prev, path, n => ({
          ...n,
          isExpanded: true
        }));
      });
      return;
    }

    try {
      const childrenData = await invoke<TreeNode[]>("expand_tree_node", {
        absolutePath: path,
        maxDepth: 1
      });

      const mappedChildren = childrenData.map(child => {
        const matchingSub = subProjects.find(sp => sp.absolutePath === child.absolutePath);
        return {
          ...child,
          subProjectId: matchingSub ? matchingSub.id : null,
          isExpanded: false,
          isLoaded: false
        };
      });

      setTreeState(prev => {
        if (!prev) return null;
        return updateNodeInTree(prev, path, n => ({
          ...n,
          children: mappedChildren,
          isLoaded: true,
          isExpanded: true
        }));
      });
    } catch (err) {
      toast.error(`Failed to expand node: ${err}`);
    }
  }, [tree, subProjects]);

  const flatNodes = useMemo(() => {
    return flattenVisibleTree(tree);
  }, [tree]);

  const value = useMemo(() => ({
    tree,
    setTree,
    getNode,
    expandNode,
    collapseNode,
    flatNodes
  }), [tree, setTree, getNode, expandNode, collapseNode, flatNodes]);

  return (
    <TreeContext.Provider value={value}>
      {children}
    </TreeContext.Provider>
  );
}

export function useTree() {
  return useContext(TreeContext);
}

function findNodeInTree(root: TreeNode | null, absolutePath: string): TreeNode | null {
  if (!root) return null;
  if (root.absolutePath === absolutePath) return root;
  for (const child of root.children) {
    const found = findNodeInTree(child, absolutePath);
    if (found) return found;
  }
  return null;
}

function updateNodeInTree(
  root: TreeNode,
  absolutePath: string,
  updater: (node: TreeNode) => TreeNode
): TreeNode {
  if (root.absolutePath === absolutePath) {
    return updater(root);
  }
  if (root.children && root.children.length > 0) {
    return {
      ...root,
      children: root.children.map(child => updateNodeInTree(child, absolutePath, updater)),
    };
  }
  return root;
}

function flattenVisibleTree(node: TreeNode | null): TreeNode[] {
  if (!node) return [];
  const result: TreeNode[] = [node];
  if (node.isExpanded && node.children) {
    for (const child of node.children) {
      result.push(...flattenVisibleTree(child));
    }
  }
  return result;
}
