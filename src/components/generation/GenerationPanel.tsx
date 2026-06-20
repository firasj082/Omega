import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useProjectStore } from "@/store/useProjectStore";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { renderRules } from "@/writers";
import { buildGenerationPlan } from "@/utils/generation";
import { generateFileMap } from "@/utils/detector";
import { ReviewModal } from "./ReviewModal";
import type { GenerationEntry, OutputTarget } from "@/types";
import { OUTPUT_CONFIGS } from "@/types";
import { Play, Clipboard, AlertTriangle, CheckCircle, Eye, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { parseRuleFileToBlocks } from "@/utils/ruleFileParser";
import { generateId } from "@/utils/id";

interface WriteResult {
  subProjectId: string;
  rulesPath: string;
  mapPath: string;
  rulesSuccess: boolean;
  mapSuccess: boolean;
  rulesError: string | null;
  mapError: string | null;
}

function inferTargetFromFilename(filename: string): string {
  if (filename === "CLAUDE.md" || filename === "CLAUDE_MAP.md") return "claude";
  if (filename === ".cursorrules" || filename === ".cursorrules_map") return "cursor";
  if (filename === ".clinerules" || filename === ".clinerules_map") return "cline";
  return "claude";
}

export function GenerationPanel() {
  const { subProjects } = useProjectStore();
  const loadouts = useLoadoutStore((s) => s.loadouts);

  const [isGenerating, setIsGenerating] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [genResults, setGenResults] = useState<Record<string, { 
    rulesSuccess: boolean; 
    mapSuccess: boolean; 
    rulesError?: string; 
    mapError?: string; 
  }>>({});

  const plan = buildGenerationPlan(subProjects);
  const entries = plan.entries;

  if (entries.length === 0) return null;

  // Check conflicts (overwrites existing files of the same target filename)
  const conflicts = entries.filter((entry) => {
    const sp = subProjects.find((p) => p.id === entry.subProjectId);
    if (!sp) return false;
    const rulesFile = OUTPUT_CONFIGS[entry.outputTarget].rulesFile;
    const mapFile = OUTPUT_CONFIGS[entry.outputTarget].mapFile;
    return sp.existingRuleFiles.some((f) => f.filename === rulesFile || f.filename === mapFile);
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
      // Async map over entries to fetch existing files and merge them
      const populatedEntries = await Promise.all(
        entries.map(async (entry) => {
          const loadout = loadouts.find((l) => l.id === entry.loadoutId);
          const sp = subProjects.find((p) => p.id === entry.subProjectId);

          const rulesFile = OUTPUT_CONFIGS[entry.outputTarget].rulesFile;
          const mapFile = OUTPUT_CONFIGS[entry.outputTarget].mapFile;

          // Find existing rules file for copying/migrating
          let existingRulesContent: string | null = null;
          let rulesSourceFilename: string | null = null;

          if (sp) {
            const sameRules = sp.existingRuleFiles.find((f) => f.filename === rulesFile);
            const otherRules = sp.existingRuleFiles.find(
              (f) => f.filename !== rulesFile && (f.filename === "CLAUDE.md" || f.filename === ".cursorrules" || f.filename === ".clinerules")
            );
            const targetRules = sameRules || otherRules;

            if (targetRules) {
              try {
                existingRulesContent = await invoke<string>("read_rule_file_content", {
                  absolutePath: targetRules.absolutePath,
                });
                rulesSourceFilename = targetRules.filename;
              } catch (e) {
                // ignore
              }
            }
          }

          let rulesContent = "";
          const templateBlocks = loadout ? loadout.blocks : [];

          // Merge if existing content is present
          if (existingRulesContent !== null) {
            const sourceTarget = rulesSourceFilename 
              ? inferTargetFromFilename(rulesSourceFilename) as OutputTarget
              : entry.outputTarget;

            const existingBlocks = parseRuleFileToBlocks(existingRulesContent, sourceTarget);
            const mergedBlocks = [...existingBlocks];

            // Merge template blocks
            templateBlocks.forEach((b) => {
              const exists = mergedBlocks.some(
                (ex) => (ex.title || "").trim().toLowerCase() === (b.title || "").trim().toLowerCase()
              );
              if (!exists && (b.title || "").trim() !== "") {
                mergedBlocks.push({ ...b, id: generateId(), order: mergedBlocks.length });
              }
            });

            // Auto-inject routing map rule if missing
            const hasMapRef = mergedBlocks.some(
              (b) => (b.content || "").includes(mapFile) || (b.title || "").toLowerCase().includes("map")
            );
            if (!hasMapRef) {
              mergedBlocks.push({
                id: generateId(),
                type: "section",
                title: "Routing Map Reference",
                content: `Always consult the project directory routing map in ${mapFile} before creating, renaming, or refactoring files to maintain codebase layout consistency.`,
                order: mergedBlocks.length,
              });
            }

            rulesContent = renderRules(entry.outputTarget, mergedBlocks, entry.subProjectName, mapFile);
          } else {
            const mergedBlocks = [...templateBlocks];
            const hasMapRef = mergedBlocks.some(
              (b) => (b.content || "").includes(mapFile) || (b.title || "").toLowerCase().includes("map")
            );
            if (!hasMapRef) {
              mergedBlocks.push({
                id: generateId(),
                type: "section",
                title: "Routing Map Reference",
                content: `Always consult the project directory routing map in ${mapFile} before creating, renaming, or refactoring files to maintain codebase layout consistency.`,
                order: mergedBlocks.length,
              });
            }
            rulesContent = renderRules(entry.outputTarget, mergedBlocks, entry.subProjectName, mapFile);
          }
          // Generate map file via Rust full-recursive scan
          let mapContent = "";
          if (sp) {
            try {
              mapContent = await generateFileMap(sp.absolutePath);
            } catch (mapErr) {
              toast.error(`Map generation failed for ${entry.subProjectName}: ${mapErr}`);
            }
          }

          return {
            ...entry,
            rulesContent,
            mapContent,
          };
        })
      );

      const results = await invoke<WriteResult[]>("write_rule_files", {
        entries: populatedEntries,
      });

      const newResults: Record<string, { rulesSuccess: boolean; mapSuccess: boolean; rulesError?: string; mapError?: string }> = {};
      results.forEach((res) => {
        newResults[res.subProjectId] = {
          rulesSuccess: res.rulesSuccess,
          mapSuccess: res.mapSuccess,
          rulesError: res.rulesError ?? undefined,
          mapError: res.mapError ?? undefined,
        };
      });

      setGenResults(newResults);
      
      const failedCount = results.filter(r => !r.rulesSuccess || !r.mapSuccess).length;
      if (failedCount > 0) {
        toast.error(`Completed with errors. ${failedCount} sub-project(s) failed.`);
      } else {
        toast.success("All rules and map files generated successfully!");
      }
    } catch (e) {
      toast.error(`Generation failed: ${e}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Single file write callback for ReviewModal
  const handleWriteSingleFile = async (entry: GenerationEntry, rulesContent: string, mapContent: string): Promise<boolean> => {
    try {
      const results = await invoke<WriteResult[]>("write_rule_files", {
        entries: [
          {
            ...entry,
            rulesContent,
            mapContent,
          },
        ],
      });
      const res = results[0];
      if (!res) return false;

      setGenResults((prev) => ({
        ...prev,
        [entry.subProjectId]: {
          rulesSuccess: res.rulesSuccess,
          mapSuccess: res.mapSuccess,
          rulesError: res.rulesError ?? undefined,
          mapError: res.mapError ?? undefined,
        },
      }));

      const success = res.rulesSuccess && res.mapSuccess;
      if (success) {
        toast.success(`Generated rules and map files for ${entry.subProjectName}`);
      } else {
        const errorMsg = [res.rulesError, res.mapError].filter(Boolean).join(" | ");
        toast.error(`Failed to write files for ${entry.subProjectName}: ${errorMsg}`);
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
            {conflicts.length} sub-project{conflicts.length > 1 ? "s" : ""} will overwrite existing files. Review details below or run step-by-step Review.
          </span>
        </div>
      )}

      {/* Title / Action Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-[var(--color-foreground)] flex items-center gap-1.5">
            <Clipboard className="h-4 w-4 text-[var(--color-primary)]" /> Batch Generation Plan
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
            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-semibold rounded-md text-xs hover:opacity-90 disabled:opacity-55 transition-all"
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
          const rulesFile = OUTPUT_CONFIGS[entry.outputTarget].rulesFile;
          const mapFile = OUTPUT_CONFIGS[entry.outputTarget].mapFile;
          const isConflict = sp?.existingRuleFiles.some((f) => f.filename === rulesFile || f.filename === mapFile);
          const result = genResults[entry.subProjectId];

          return (
            <div key={entry.subProjectId} className="flex items-center justify-between px-3 py-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                {result ? (
                  result.rulesSuccess && result.mapSuccess ? (
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
                <span className="font-mono text-[var(--color-muted-foreground)] truncate max-w-xs md:max-w-sm lg:max-w-md">
                  → {rulesFile} & {mapFile}
                </span>
              </div>

              <div className="flex items-center gap-3">
                {result ? (
                  result.rulesSuccess && result.mapSuccess ? (
                    <span className="text-green-500 font-semibold">Written</span>
                  ) : (
                    <span className="text-red-500 font-semibold" title={`${result.rulesError || ""} ${result.mapError || ""}`}>
                      Failed
                    </span>
                  )
                ) : isConflict ? (
                  <span className="text-amber-500 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px]">
                    Overwrites Existing
                  </span>
                ) : (
                  <span className="text-[var(--color-muted-foreground)] font-medium text-[10px]">New files</span>
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
                  Overwrite existing files?
                </h3>
                <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
                  Existing rule or map files in the following folders will be replaced:
                </p>
              </div>
            </div>

            <div className="bg-[var(--color-muted)] p-2 rounded text-xs font-mono max-h-28 overflow-y-auto space-y-1 border border-[var(--color-border)]">
              {conflicts.map((c) => (
                <div key={c.subProjectId} className="text-amber-500 truncate">
                  ⚠ {c.subProjectName}/ ({OUTPUT_CONFIGS[c.outputTarget].rulesFile} / {OUTPUT_CONFIGS[c.outputTarget].mapFile})
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
