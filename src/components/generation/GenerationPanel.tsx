import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useProjectStore } from "@/store/useProjectStore";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { renderOutput } from "@/writers";
import { ReviewModal } from "./ReviewModal";
import type { GenerationEntry } from "@/types";
import { OUTPUT_CONFIGS } from "@/types";
import { Play, Clipboard, AlertTriangle, CheckCircle, Eye, RefreshCw } from "lucide-react";

interface WriteResult {
  subProjectId: string;
  success: boolean;
  error?: string;
}
import { toast } from "sonner";

export function GenerationPanel() {
  const { subProjects, buildGenerationPlan } = useProjectStore();
  const loadouts = useLoadoutStore((s) => s.loadouts);

  const [isGenerating, setIsGenerating] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [genResults, setGenResults] = useState<Record<string, { success: boolean; error?: string }>>({});

  const plan = buildGenerationPlan();
  const entries = plan.entries;

  if (entries.length === 0) return null;

  // Check conflicts
  const conflicts = entries.filter((entry) => {
    const sp = subProjects.find((p) => p.id === entry.subProjectId);
    if (!sp) return false;
    const filename = OUTPUT_CONFIGS[entry.outputTarget].filename;
    return sp.existingRuleFiles.some((f) => f.filename === filename);
  });

  const hasConflicts = conflicts.length > 0;

  // Generate All
  const handleGenerateAll = async (bypassConfirm = false) => {
    if (hasConflicts && !bypassConfirm) {
      setShowConfirmModal(true);
      return;
    }

    setShowConfirmModal(false);
    setIsGenerating(true);
    setGenResults({});

    try {
      // Populate content for each entry by rendering blocks in frontend
      const populatedEntries = entries.map((entry) => {
        const loadout = loadouts.find((l) => l.id === entry.loadoutId);
        const content = loadout ? renderOutput(entry.outputTarget, loadout.blocks) : "";
        return {
          ...entry,
          content,
        };
      });

      const results = await invoke<WriteResult[]>("write_rule_files", {
        entries: populatedEntries,
      });

      const newResults: Record<string, { success: boolean; error?: string }> = {};
      results.forEach((res: WriteResult) => {
        newResults[res.subProjectId] = {
          success: res.success,
          error: res.error ?? undefined,
        };
      });

      setGenResults(newResults);
      toast.success("Generation completed! Check individual results.");
    } catch (e) {
      toast.error(`Generation failed: ${e}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Single file write callback for ReviewModal
  const handleWriteSingleFile = async (entry: GenerationEntry, content: string): Promise<boolean> => {
    try {
      const results = await invoke<WriteResult[]>("write_rule_files", {
        entries: [
          {
            ...entry,
            content,
          },
        ],
      });
      const success = results[0]?.success ?? false;
      if (success) {
        setGenResults((prev) => ({
          ...prev,
          [entry.subProjectId]: { success: true },
        }));
        toast.success(`Generated rule file for ${entry.subProjectName}`);
      } else {
        const error = results[0]?.error || "Unknown error";
        setGenResults((prev) => ({
          ...prev,
          [entry.subProjectId]: { success: false, error },
        }));
        toast.error(`Failed to write file for ${entry.subProjectName}: ${error}`);
      }
      return success;
    } catch (e) {
      toast.error(`Write failed: ${e}`);
      return false;
    }
  };

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-4">
      {/* Alert Banner for Overwrites */}
      {hasConflicts && (
        <div className="flex items-center gap-2 border border-amber-500/20 bg-amber-500/5 px-3 py-2 rounded-md text-xs text-amber-500 font-medium">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            {conflicts.length} file{conflicts.length > 1 ? "s" : ""} will be overwritten. Review details below or run step-by-step Review.
          </span>
        </div>
      )}

      {/* Title / Action Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-[var(--color-foreground)] flex items-center gap-1.5">
            <Clipboard className="h-4 w-4 text-primary-500" /> Batch Generation Plan
          </h4>
          <span className="text-[10px] text-[var(--color-muted-foreground)]">
            Ready to compile rules for {entries.length} sub-project{entries.length > 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowReview(true)}
            className="flex items-center gap-1 px-3 py-1.5 border border-[var(--color-border)] text-xs font-semibold rounded-md hover:bg-[var(--color-muted)] transition-colors"
          >
            <Eye className="h-3.5 w-3.5" /> Review Each
          </button>
          <button
            onClick={() => handleGenerateAll(false)}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-semibold rounded-md text-xs hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {isGenerating ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Generate All
          </button>
        </div>
      </div>

      {/* Plan Entries List */}
      <div className="max-h-40 overflow-y-auto divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-md">
        {entries.map((entry) => {
          const sp = subProjects.find((p) => p.id === entry.subProjectId);
          const filename = OUTPUT_CONFIGS[entry.outputTarget].filename;
          const isConflict = sp?.existingRuleFiles.some((f) => f.filename === filename);
          const result = genResults[entry.subProjectId];

          return (
            <div key={entry.subProjectId} className="flex items-center justify-between px-3 py-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                {result ? (
                  result.success ? (
                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  )
                ) : isConflict ? (
                  <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-[var(--color-border)] flex items-center justify-center text-[9px] text-[var(--color-muted-foreground)]">
                    ●
                  </span>
                )}
                <span className="font-semibold text-[var(--color-foreground)] truncate">
                  {entry.subProjectName}/
                </span>
                <span className="font-mono text-[var(--color-muted-foreground)] truncate max-w-xs">
                  → {entry.outputPath.split(/[/\\]/).slice(-2).join("/")}
                </span>
              </div>

              <div className="flex items-center gap-3">
                {result ? (
                  result.success ? (
                    <span className="text-green-500 font-semibold">Written</span>
                  ) : (
                    <span className="text-red-500 font-semibold" title={result.error}>
                      Failed
                    </span>
                  )
                ) : isConflict ? (
                  <span className="text-amber-500 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px]">
                    Overwrites Existing
                  </span>
                ) : (
                  <span className="text-[var(--color-muted-foreground)] font-medium">New file</span>
                )}
                <span className="uppercase text-[9px] bg-[var(--color-muted)] px-1.5 py-0.5 rounded font-mono font-semibold">
                  {entry.outputTarget}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Review Modal */}
      {showReview && (
        <ReviewModal
          entries={entries}
          onClose={() => setShowReview(false)}
          onWriteFile={handleWriteSingleFile}
        />
      )}

      {/* Overwrite Confirmation Dialog */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] shadow-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-500 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-sm text-[var(--color-foreground)]">
                  Overwrite existing file{conflicts.length > 1 ? "s" : ""}?
                </h3>
                <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
                  The following rule file{conflicts.length > 1 ? "s" : ""} will be replaced and original contents lost:
                </p>
              </div>
            </div>

            <div className="bg-[var(--color-muted)] p-2 rounded text-xs font-mono max-h-28 overflow-y-auto space-y-1 border border-[var(--color-border)]">
              {conflicts.map((c) => (
                <div key={c.subProjectId} className="text-amber-500 truncate">
                  ⚠ {c.subProjectName}/{OUTPUT_CONFIGS[c.outputTarget].filename}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 text-xs">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-3.5 py-1.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-border)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleGenerateAll(true)}
                className="px-4 py-2 bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 transition-colors"
              >
                Overwrite and Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
