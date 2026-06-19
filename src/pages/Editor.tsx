import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileOutput, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
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
import { writeRuleFile } from "@/utils/detector";
import { generateId } from "@/utils/id";
import type { Loadout } from "@/types";

export function Editor() {
  const navigate = useNavigate();
  const folderPath = useProjectStore((s) => s.folderPath);
  const editorBlocks = useProjectStore((s) => s.editorBlocks);
  const outputTarget = useProjectStore((s) => s.outputTarget);
  const activeLoadoutId = useProjectStore((s) => s.activeLoadoutId);
  const setActiveLoadout = useProjectStore((s) => s.setActiveLoadout);

  const loadouts = useLoadoutStore((s) => s.loadouts);
  const saveLoadout = useLoadoutStore((s) => s.saveLoadout);

  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const activeLoadout = loadouts.find((l) => l.id === activeLoadoutId);

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
      await writeRuleFile(folderPath, config.filename, content);
      setPreviewContent(content);
      setShowPreview(true);
      toast.success(`Generated ${config.filename} successfully`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to write file";
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  }, [folderPath, editorBlocks, outputTarget]);

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
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <p className="text-xs font-medium text-[var(--color-muted-foreground)]">
            Current Loadout
          </p>
          <p className="mt-1 font-semibold">
            {activeLoadout?.name ?? "Unsaved session"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            onClick={() => setShowSaveDialog(true)}
          >
            <Save className="h-3.5 w-3.5" />
            Save as Loadout
          </Button>
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
          Generate File
        </Button>
      </footer>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Preview — {OUTPUT_CONFIGS[outputTarget].filename}
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
