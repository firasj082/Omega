import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileOutput, Loader2, Save, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";
import { useProjectStore } from "@/store/useProjectStore";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { BlockEditor } from "@/components/editor/BlockEditor";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OUTPUT_CONFIGS } from "@/types";
import { renderOutput } from "@/writers";
import { writeRuleFile, detectProject } from "@/utils/detector";
import { generateId } from "@/utils/id";
import { parseRuleFileToBlocks } from "@/utils/ruleFileParser";
import type { Loadout, RuleBlock, ExistingRuleFile } from "@/types";

function blocksAreEqual(a: RuleBlock[], b: RuleBlock[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].type !== b[i].type ||
      a[i].title !== b[i].title ||
      a[i].content !== b[i].content
    ) {
      return false;
    }
  }
  return true;
}

export function Editor() {
  const navigate = useNavigate();

  // Fine-grained Zustand selectors
  const folderPath = useProjectStore((s) => s.folderPath);
  const editorBlocks = useProjectStore((s) => s.editorBlocks);
  const outputTarget = useProjectStore((s) => s.outputTarget);
  const activeLoadoutId = useProjectStore((s) => s.activeLoadoutId);
  const setActiveLoadout = useProjectStore((s) => s.setActiveLoadout);
  const editorSession = useProjectStore((s) => s.editorSession);
  const setSessionDirty = useProjectStore((s) => s.setSessionDirty);
  const saveSessionSuccess = useProjectStore((s) => s.saveSessionSuccess);
  const closeEditorSession = useProjectStore((s) => s.closeEditorSession);

  const loadouts = useLoadoutStore((s) => s.loadouts);
  const saveLoadout = useLoadoutStore((s) => s.saveLoadout);

  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const activeLoadout = loadouts.find((l) => l.id === activeLoadoutId);

  // Debounced check dirty function
  const checkDirty = useDebouncedCallback((blocks: RuleBlock[], sourceFile: ExistingRuleFile | null) => {
    if (!sourceFile) {
      setSessionDirty(false);
      return;
    }
    const sourceBlocks = parseRuleFileToBlocks(sourceFile.content, sourceFile.outputTarget);
    const isDirty = !blocksAreEqual(blocks, sourceBlocks);
    setSessionDirty(isDirty);
  }, 500);

  useEffect(() => {
    if (editorSession) {
      checkDirty(editorBlocks, editorSession.sourceFile);
    }
  }, [editorBlocks, editorSession?.sourceFile, checkDirty, editorSession]);

  const handleGenerate = useCallback(async () => {
    if (!folderPath) {
      toast.error("No folder selected. Go to Home to pick a project folder.");
      return;
    }
    if (editorBlocks.length === 0) {
      toast.error("Add at least one block before generating.");
      return;
    }

    setIsGenerating(true);
    const content = renderOutput(outputTarget, editorBlocks);
    const config = OUTPUT_CONFIGS[outputTarget];

    try {
      // Use config.rulesFile instead of config.filename
      await writeRuleFile(folderPath, config.rulesFile, content);
      setPreviewContent(content);
      setShowPreview(true);
      toast.success(`Generated ${config.rulesFile} successfully`);

      if (editorSession && editorSession.mode === "editing-existing") {
        saveSessionSuccess(content);
      }

      // Rescan project folder to sync UI state with disk
      try {
        const result = await detectProject(folderPath);
        useProjectStore.getState().setDetection(result);
      } catch (scanErr) {
        console.error("Failed to rescan after editor write:", scanErr);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to write file";
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  }, [folderPath, editorBlocks, outputTarget, editorSession, saveSessionSuccess]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleGenerate();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleGenerate]);

  const handleSaveAsLoadout = async () => {
    if (!saveName.trim()) {
      toast.error("Name is required");
      return;
    }

    setIsSaving(true);
    const now = new Date().toISOString();
    const loadout: Loadout = {
      id: generateId(),
      name: saveName.trim(),
      description: `Custom loadout saved from editor`,
      projectTypes: ["unknown"],
      blocks: editorBlocks.map((b) => ({ ...b })),
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await saveLoadout(loadout);
      setActiveLoadout(loadout.id);
      toast.success("Loadout saved");
      setShowSaveDialog(false);
      setSaveName("");
    } catch {
      toast.error("Failed to save loadout");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseSession = () => {
    closeEditorSession();
    toast.info("Closed editor session.");
  };

  if (!folderPath) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <p className="text-[var(--color-muted-foreground)]">
          No project folder selected.
        </p>
        <Button onClick={() => navigate("/")}>Go to Home</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar />
      
      {/* Session Banner if active */}
      {editorSession && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] bg-amber-500/5 text-xs text-amber-600 font-medium">
          <div className="flex items-center gap-2">
            <span className="bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold">
              Session
            </span>
            <span>
              Editing: <span className="font-mono">{editorSession.sourceFile?.relativePath}</span>
              {editorSession.isDirty && (
                <span className="ml-1 text-red-500 font-bold">(unsaved changes)</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCloseSession}
              className="h-6 px-2 text-xs hover:bg-amber-500/10"
            >
              <X className="h-3 w-3 mr-1" /> Close Session
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-card)] p-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-[var(--color-muted-foreground)]">
                Current Loadout
              </p>
              <p className="mt-1 font-semibold text-sm">
                {activeLoadout?.name ?? "Unsaved session"}
              </p>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs font-semibold"
              onClick={() => setShowSaveDialog(true)}
            >
              <Save className="h-3.5 w-3.5" />
              Save as Loadout
            </Button>
          </div>

          {editorSession && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="w-full justify-start text-xs text-[var(--color-muted-foreground)]"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-2" /> Back to Tree
            </Button>
          )}
        </aside>
        
        <main className="flex-1 overflow-y-auto p-6">
          <BlockEditor />
        </main>
      </div>
      
      <footer className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-card)] px-6 py-3">
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {editorBlocks.length} block{editorBlocks.length !== 1 ? "s" : ""} ·
          Ctrl+S to generate
        </p>
        <Button onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileOutput className="h-4 w-4" />
          )}
          {editorSession?.mode === "editing-existing" ? "Save File" : "Generate File"}
        </Button>
      </footer>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Preview — {OUTPUT_CONFIGS[outputTarget].rulesFile}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            readOnly
            value={previewContent}
            className="min-h-[300px] font-mono text-xs"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Loadout</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="save-name">Loadout Name</Label>
              <Input
                id="save-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="My Custom Rules"
              />
            </div>
            <Button
              onClick={handleSaveAsLoadout}
              disabled={isSaving}
              className="w-full"
            >
              {isSaving ? "Saving..." : "Save Loadout"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
