import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Loader2, ArrowRight } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { detectProject } from "@/utils/detector";
import { useProjectStore } from "@/store/useProjectStore";
import { ProjectTree } from "@/components/tree/ProjectTree";
import { NodeDetailPanel } from "@/components/tree/NodeDetailPanel";
import { GenerationPanel } from "@/components/generation/GenerationPanel";
import { TreeProvider, useTree } from "@/context/TreeContext";
import type { TreeNode, ExistingRuleFile } from "@/types";
import { toast } from "sonner";

function HomeContent() {
  const navigate = useNavigate();
  const folderPath = useProjectStore((s) => s.folderPath);
  const detection = useProjectStore((s) => s.detection);
  const setFolder = useProjectStore((s) => s.setFolder);
  const setDetection = useProjectStore((s) => s.setDetection);
  const setSelectedNode = useProjectStore((s) => s.setSelectedNode);
  const markNodeAsProject = useProjectStore((s) => s.markNodeAsProject);
  const unmarkNode = useProjectStore((s) => s.unmarkNode);
  const openExistingFile = useProjectStore((s) => s.openExistingFile);

  const { setTree } = useTree();

  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNodeLocal] = useState<TreeNode | null>(null);

  // Sync selectedNode when detection tree changes or resets
  useEffect(() => {
    if (!detection) {
      setTree(null);
      setSelectedNodeLocal(null);
      setSelectedNode(null);
    } else {
      setTree(detection.tree);
      setSelectedNodeLocal(detection.tree);
      setSelectedNode(detection.tree.absolutePath);
    }
  }, [detection, setSelectedNode, setTree]);

  const handlePickFolder = async () => {
    setError(null);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Folder",
      });

      if (!selected || typeof selected !== "string") return;

      setFolder(selected);
      setIsDetecting(true);

      const result = await detectProject(selected);
      setDetection(result);
      toast.success("Project workspace scanned and mapped successfully.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to scan project folder";
      setError(message);
      toast.error(message);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleNodeClick = (node: TreeNode) => {
    setSelectedNodeLocal(node);
    setSelectedNode(node.absolutePath);
  };

  const handleOpenExistingFile = async (file: ExistingRuleFile, subProjectId: string) => {
    try {
      // Lazy load rules file content
      const content = await invoke<string>("read_rule_file_content", {
        absolutePath: file.absolutePath,
      });
      const fileWithContent = { ...file, content };
      openExistingFile(fileWithContent, subProjectId);
      toast.success(`Loaded existing ${file.filename} in editor.`);
      navigate("/editor");
    } catch (err) {
      toast.error(`Failed to load file content: ${err}`);
    }
  };

  const handleMarkAsProject = (node: TreeNode) => {
    markNodeAsProject(node, "unknown");
  };

  // If no folder path is selected yet, show the full page file picker card
  if (!folderPath || !detection) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-8">
        <div>
          <h2 className="text-2xl font-bold">Select a Project</h2>
          <p className="mt-1 text-[var(--color-muted-foreground)]">
            Choose a folder to scan its project tree, detect sub-projects, and customize rules.
          </p>
        </div>

        <button
          type="button"
          onClick={handlePickFolder}
          disabled={isDetecting}
          className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-16 transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-accent)] disabled:opacity-50"
        >
          {isDetecting ? (
            <Loader2 className="h-10 w-10 animate-spin text-[var(--color-primary)]" />
          ) : (
            <FolderOpen className="h-10 w-10 text-[var(--color-muted-foreground)]" />
          )}
          <div className="text-center">
            <p className="font-semibold text-base">
              {isDetecting ? "Scanning workspace directories..." : "Click to select a project folder"}
            </p>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
              Supports monorepos, multi-stack configurations, and existing rules detection
            </p>
          </div>
        </button>

        {error && (
          <p className="rounded-md bg-[var(--color-destructive)]/10 px-4 py-2 text-sm text-[var(--color-destructive)]">
            {error}
          </p>
        )}
      </div>
    );
  }

  // Active workspace view: split tree view and detail configuration panel
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top Workspace Path Bar */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2 text-xs bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[var(--color-foreground)]">Active Workspace:</span>
          <span className="font-mono bg-[var(--color-card)] px-2 py-0.5 rounded border border-[var(--color-border)]">
            {folderPath}
          </span>
        </div>
        <button
          onClick={handlePickFolder}
          className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
        >
          Change Folder
        </button>
      </div>

      {/* Main Workspace split panel */}
      <div className="flex-1 flex overflow-hidden p-4 gap-4">
        {/* Left Side: Project Tree Explorer */}
        <div className="w-[45%] h-full">
          <ProjectTree
            onNodeClick={handleNodeClick}
            onMarkAsProject={handleMarkAsProject}
            onUnmarkProject={unmarkNode}
            onOpenExistingFile={handleOpenExistingFile}
          />
        </div>

        {/* Right Side: Detail Config and Actions Panel */}
        <div className="flex-1 h-full flex flex-col justify-between">
          <div className="flex-1 overflow-hidden mb-4">
            <NodeDetailPanel
              node={selectedNode}
              onOpenExistingFile={handleOpenExistingFile}
            />
          </div>
          {/* Quick navigations for single workspace editor */}
          {!detection.isMonorepo && (
            <button
              onClick={() => navigate("/editor")}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-semibold rounded-md text-sm hover:opacity-90 transition-all"
            >
              Open Rules Editor <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Batch Generator Panel */}
      <GenerationPanel />
    </div>
  );
}

export function Home() {
  return (
    <TreeProvider>
      <HomeContent />
    </TreeProvider>
  );
}
