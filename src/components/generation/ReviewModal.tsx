import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GenerationEntry, OutputTarget } from "@/types";
import { renderRules } from "@/writers";
import { generateFileMap } from "@/utils/detector";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { useProjectStore } from "@/store/useProjectStore";
import { X, ChevronLeft, ChevronRight, FileCheck, Eye, Loader2 } from "lucide-react";
import { OUTPUT_CONFIGS } from "@/types";
import { cn } from "@/lib/utils";
import { generateId } from "@/utils/id";
import { parseRuleFileToBlocks } from "@/utils/ruleFileParser";
import { toast } from "sonner";

interface ReviewModalProps {
  entries: GenerationEntry[];
  onClose: () => void;
  onWriteFile: (entry: GenerationEntry, rulesContent: string, mapContent: string) => Promise<boolean>;
}

function inferTargetFromFilename(filename: string): string {
  if (filename === "CLAUDE.md" || filename === "CLAUDE_MAP.md") return "claude";
  if (filename === ".cursorrules" || filename === ".cursorrules_map") return "cursor";
  if (filename === ".clinerules" || filename === ".clinerules_map") return "cline";
  return "claude";
}

export function ReviewModal({ entries, onClose, onWriteFile }: ReviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"rules" | "map">("rules");
  const [isWriting, setIsWriting] = useState(false);
  const [isLoadingMap, setIsLoadingMap] = useState(false);
  const [writeStatuses, setWriteStatuses] = useState<Record<string, "success" | "error" | null>>({});
  
  // Track viewed tabs per subproject
  const [viewedTabs, setViewedTabs] = useState<Record<string, { rules: boolean; map: boolean }>>({});

  // Existing file states
  const [existingRulesContent, setExistingRulesContent] = useState<string | null>(null);
  const [existingMapContent, setExistingMapContent] = useState<string | null>(null);
  const [rulesSourceFilename, setRulesSourceFilename] = useState<string | null>(null);
  const [mapSourceFilename, setMapSourceFilename] = useState<string | null>(null);

  // Editable draft states
  const [draftRulesContent, setDraftRulesContent] = useState("");
  const [draftMapContent, setDraftMapContent] = useState("");

  // Revert reference cache for pure generated content
  const [generatedRulesContent, setGeneratedRulesContent] = useState("");
  const [generatedMapContent, setGeneratedMapContent] = useState("");

  // Manual editing states
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadouts = useLoadoutStore((s) => s.loadouts);
  const subProjects = useProjectStore((s) => s.subProjects);

  const entry = entries[currentIndex];
  const sp = subProjects.find((p) => p.id === entry?.subProjectId);

  // 1. Fetch existing file contents from disk on index change
  useEffect(() => {
    if (!entry || !sp) return;

    const loadExisting = async () => {
      setExistingRulesContent(null);
      setExistingMapContent(null);
      setRulesSourceFilename(null);
      setMapSourceFilename(null);

      const rulesFile = OUTPUT_CONFIGS[entry.outputTarget].rulesFile;
      const mapFile = OUTPUT_CONFIGS[entry.outputTarget].mapFile;

      const sameRules = sp.existingRuleFiles.find((f) => f.filename === rulesFile);
      const otherRules = sp.existingRuleFiles.find(
        (f) => f.filename !== rulesFile && (f.filename === "CLAUDE.md" || f.filename === ".cursorrules" || f.filename === ".clinerules")
      );
      const targetRules = sameRules || otherRules;

      if (targetRules) {
        try {
          const content = await invoke<string>("read_rule_file_content", {
            absolutePath: targetRules.absolutePath,
          });
          setExistingRulesContent(content);
          setRulesSourceFilename(targetRules.filename);
        } catch (e) {
          // ignore or handle
        }
      }

      const sameMap = sp.existingRuleFiles.find((f) => f.filename === mapFile);
      if (sameMap) {
        try {
          const content = await invoke<string>("read_rule_file_content", {
            absolutePath: sameMap.absolutePath,
          });
          setExistingMapContent(content);
          setMapSourceFilename(sameMap.filename);
        } catch (e) {
          // ignore or handle
        }
      }
    };

    loadExisting();
  }, [currentIndex, entry, sp]);

  // 2. Perform merge & inject routing rule, then initialize drafts
  useEffect(() => {
    if (!entry) return;

    let active = true;

    const loadout = loadouts.find((l) => l.id === entry.loadoutId);
    const templateBlocks = loadout ? loadout.blocks : [];
    const mapFile = OUTPUT_CONFIGS[entry.outputTarget].mapFile;

    // Rules Content Merge
    let rulesInit = "";
    if (existingRulesContent !== null) {
      const sourceTarget = rulesSourceFilename 
        ? inferTargetFromFilename(rulesSourceFilename) as OutputTarget
        : entry.outputTarget;

      const existingBlocks = parseRuleFileToBlocks(existingRulesContent, sourceTarget);
      const mergedBlocks = [...existingBlocks];

      // Merge template blocks (excluding duplicates by title)
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

      rulesInit = renderRules(entry.outputTarget, mergedBlocks, entry.subProjectName, mapFile);
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
      rulesInit = renderRules(entry.outputTarget, mergedBlocks, entry.subProjectName, mapFile);
    }

    if (active) {
      setDraftRulesContent(rulesInit);
      setGeneratedRulesContent(rulesInit);
    }

    // Map Content — use Rust full-recursive scan (async)
    const loadMap = async () => {
      setIsLoadingMap(true);
      if (sp) {
        try {
          const rustMap = await generateFileMap(sp.absolutePath);
          if (active) {
            setDraftMapContent(rustMap);
            setGeneratedMapContent(rustMap);
          }
        } catch (mapErr) {
          if (active) {
            setDraftMapContent(`<!-- Map generation failed: ${mapErr} -->`);
            setGeneratedMapContent(`<!-- Map generation failed: ${mapErr} -->`);
          }
        } finally {
          if (active) {
            setIsLoadingMap(false);
          }
        }
      } else {
        if (active) {
          setDraftMapContent("");
          setGeneratedMapContent("");
          setIsLoadingMap(false);
        }
      }
    };

    loadMap();

    return () => {
      active = false;
    };
  }, [entry, loadouts, sp, existingRulesContent, existingMapContent, rulesSourceFilename]);

  // Reset manual editing when changing index or active tab
  useEffect(() => {
    setIsEditing(false);
  }, [currentIndex, activeTab]);

  // 3. Mark active tab as viewed
  useEffect(() => {
    if (entry) {
      setViewedTabs((prev) => {
        const current = prev[entry.subProjectId] || { rules: false, map: false };
        return {
          ...prev,
          [entry.subProjectId]: {
            ...current,
            [activeTab]: true,
          },
        };
      });
    }
  }, [entry, activeTab]);

  if (!entry) return null;

  const rulesFile = OUTPUT_CONFIGS[entry.outputTarget].rulesFile;
  const mapFile = OUTPUT_CONFIGS[entry.outputTarget].mapFile;

  const handleTabChange = (tab: "rules" | "map") => {
    setActiveTab(tab);
  };

  const handleNext = () => {
    if (currentIndex < entries.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setActiveTab("rules");
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setActiveTab("rules");
    }
  };

  const handleSave = async () => {
    setIsWriting(true);
    try {
      const ok = await onWriteFile(entry, draftRulesContent, draftMapContent);
      setWriteStatuses((prev) => ({
        ...prev,
        [entry.subProjectId]: ok ? "success" : "error",
      }));
      if (ok && currentIndex < entries.length - 1) {
        setTimeout(() => {
          handleNext();
        }, 600);
      }
    } catch (e) {
      setWriteStatuses((prev) => ({
        ...prev,
        [entry.subProjectId]: "error",
      }));
    } finally {
      setIsWriting(false);
    }
  };

  const status = writeStatuses[entry.subProjectId];
  const viewed = viewedTabs[entry.subProjectId] || { rules: false, map: false };
  const canWrite = viewed.rules && viewed.map;

  // Comparison UI parameters
  const showRulesComparison = existingRulesContent !== null && rulesSourceFilename === rulesFile;
  const showMapComparison = existingMapContent !== null && mapSourceFilename === mapFile;

  const isMigratingRules = existingRulesContent !== null && rulesSourceFilename !== rulesFile;

  const showComparison = activeTab === "rules" ? showRulesComparison : showMapComparison;
  const existingContent = activeTab === "rules" ? existingRulesContent : existingMapContent;
  const activeFilename = activeTab === "rules" ? rulesFile : mapFile;
  const sourceFilename = activeTab === "rules" ? rulesSourceFilename : mapSourceFilename;
  const activeDraft = activeTab === "rules" ? draftRulesContent : draftMapContent;
  const setActiveDraft = activeTab === "rules" ? setDraftRulesContent : setDraftMapContent;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="flex h-[80vh] w-full max-w-5xl flex-col bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] shadow-xl overflow-hidden animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-3">
          <div className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-[var(--color-primary)]" />
            <h3 className="font-semibold text-[var(--color-foreground)]">Review Output Files</h3>
            <span className="text-xs text-[var(--color-muted-foreground)] bg-[var(--color-border)] px-2 py-0.5 rounded font-medium">
              {currentIndex + 1} of {entries.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[var(--color-muted-foreground)] hover:bg-[var(--color-border)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Details & Paths */}
        <div className="bg-[var(--color-card)] border-b border-[var(--color-border)] px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs text-[var(--color-muted-foreground)]">
          <div>
            <span className="font-semibold text-[var(--color-foreground)] text-sm block">
              Sub-project: {entry.subProjectName}
            </span>
            <div className="mt-1 space-y-0.5 font-mono text-[10px]">
              <div className={cn(activeTab === "rules" && "text-[var(--color-foreground)] font-semibold")}>
                Rules: {entry.rulesOutputPath}
              </div>
              <div className={cn(activeTab === "map" && "text-[var(--color-foreground)] font-semibold")}>
                Map: {entry.mapOutputPath}
              </div>
            </div>
          </div>
          <div className="text-right flex flex-col items-end">
            <span className="font-medium text-[var(--color-foreground)] block">
              Loadout: {loadouts.find(l => l.id === entry.loadoutId)?.name || "Unknown"}
            </span>
            <span className="uppercase text-[10px] bg-[var(--color-border)] px-1.5 py-0.5 rounded font-mono font-semibold mt-1">
              {entry.outputTarget}
            </span>
          </div>
        </div>

        {/* Tab Selection Bar */}
        <div className="flex items-center border-b border-[var(--color-border)] bg-[var(--color-muted)] px-4">
          <button
            onClick={() => handleTabChange("rules")}
            className={cn(
              "px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5",
              activeTab === "rules"
                ? "border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-card)]"
                : "border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            )}
          >
            📄 Rules File ({rulesFile})
            {viewed.rules && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
          </button>
          <button
            onClick={() => handleTabChange("map")}
            className={cn(
              "px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5",
              activeTab === "map"
                ? "border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-card)]"
                : "border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            )}
          >
            🗺️ Routing Map ({mapFile})
            {isLoadingMap ? (
              <Loader2 className="h-3 w-3 animate-spin text-[var(--color-primary)]" />
            ) : viewed.map ? (
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" title="Requires viewing map file before write" />
            )}
          </button>

          {!canWrite && (
            <div className="ml-auto flex items-center gap-1 text-[10px] text-amber-500 font-medium bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 animate-pulse">
              <Eye className="h-3 w-3" /> View Map tab to enable Write
            </div>
          )}
        </div>

        {showComparison && (
          <div className="bg-[var(--color-muted)] border-b border-[var(--color-border)] px-4 py-2 flex items-center justify-between gap-2 text-xs">
            <span className="text-[var(--color-muted-foreground)] font-semibold">
              Conflict detected for {activeFilename}. Merge or choose content:
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setActiveDraft(existingContent || "");
                  toast.success(`Loaded disk content into editor`);
                }}
                disabled={isEditing}
                className="px-2.5 py-1 bg-[var(--color-border)] border border-[var(--color-border)] rounded hover:bg-[var(--color-muted-foreground)]/10 font-semibold disabled:opacity-40"
              >
                ← Keep Disk Content
              </button>
              <button
                onClick={() => {
                  const gen = activeTab === "rules" ? generatedRulesContent : generatedMapContent;
                  setActiveDraft(gen);
                  toast.success(`Loaded newly generated content`);
                }}
                disabled={isEditing}
                className="px-2.5 py-1 bg-[var(--color-border)] border border-[var(--color-border)] rounded hover:bg-[var(--color-muted-foreground)]/10 font-semibold disabled:opacity-40"
              >
                → Use Generated Content
              </button>
              {isEditing ? (
                <button
                  onClick={() => {
                    setIsEditing(false);
                    toast.success("Manual edits confirmed.");
                  }}
                  className="px-2.5 py-1 bg-green-500 text-white rounded hover:bg-green-600 font-semibold"
                >
                  ✓ Confirm Edits
                </button>
              ) : (
                <button
                  onClick={() => {
                    setIsEditing(true);
                    setTimeout(() => {
                      textareaRef.current?.focus();
                    }, 50);
                    toast.info("Manual edit mode enabled. Focus shifted to textarea.");
                  }}
                  className="px-2.5 py-1 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] rounded hover:opacity-90 font-semibold"
                >
                  ✍ Edit Manually
                </button>
              )}
            </div>
          </div>
        )}

        {/* Code Comparison View */}
        <div className="flex-1 flex overflow-hidden bg-black text-xs font-mono leading-relaxed select-text">
          {showComparison ? (
            <>
              {/* Left side: Existing */}
              <div className="w-1/2 flex flex-col border-r border-green-950/40 p-4 overflow-auto">
                <div className="text-[var(--color-muted-foreground)] border-b border-green-950 pb-2 mb-2 uppercase tracking-wider text-[10px] font-semibold flex items-center justify-between">
                  <span>Existing File on Disk ({sourceFilename})</span>
                  <span className="text-[9px] bg-red-950/50 text-red-400 px-1.5 py-0.5 rounded font-sans font-normal">Original</span>
                </div>
                <pre className="text-red-400 whitespace-pre-wrap flex-1">{existingContent || "# File is empty."}</pre>
              </div>

              {/* Right side: New (Editable) */}
              <div className="w-1/2 flex flex-col p-4 overflow-auto">
                <div className="text-[var(--color-muted-foreground)] border-b border-green-950 pb-2 mb-2 uppercase tracking-wider text-[10px] font-semibold flex items-center justify-between">
                  <span>New Merged Content ({activeFilename})</span>
                  <span className="text-[9px] bg-green-950/50 text-green-400 px-1.5 py-0.5 rounded font-sans font-normal">
                    {isEditing ? "Editing..." : "Read-Only (Click Edit Manually)"}
                  </span>
                </div>
                <textarea
                  ref={textareaRef}
                  value={activeDraft}
                  onChange={(e) => setActiveDraft(e.target.value)}
                  readOnly={!isEditing}
                  className={cn(
                    "flex-1 w-full bg-transparent border-0 outline-none resize-none font-mono text-xs whitespace-pre leading-relaxed p-0 focus:ring-0 focus:outline-none",
                    isEditing ? "text-green-400" : "text-green-600/80"
                  )}
                  placeholder="Type or edit rules content here..."
                />
              </div>
            </>
          ) : (
            /* Single view: New (Editable) */
            <div className="flex-1 flex flex-col p-4 overflow-auto">
              <div className="text-[var(--color-muted-foreground)] border-b border-green-950 pb-2 mb-2 uppercase tracking-wider text-[10px] font-semibold flex items-center justify-between">
                <span>New Generated Content ({activeFilename})</span>
                <span className="text-[9px] bg-green-950/50 text-green-400 px-1.5 py-0.5 rounded font-sans font-normal">Editable</span>
              </div>
              {activeTab === "rules" && isMigratingRules && (
                <div className="bg-green-950/35 text-green-400 px-3 py-1.5 rounded text-[11px] mb-3 font-sans flex items-center gap-1.5 border border-green-900/50">
                  <span>💡</span>
                  <span>Automatically copied and migrated rules from existing rule file: <strong>{rulesSourceFilename}</strong></span>
                </div>
              )}
              <textarea
                value={activeDraft}
                onChange={(e) => setActiveDraft(e.target.value)}
                className="flex-1 w-full bg-transparent text-green-400 border-0 outline-none resize-none font-mono text-xs whitespace-pre leading-relaxed p-0 focus:ring-0 focus:outline-none"
                placeholder="Type or edit rules content here..."
              />
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold border border-[var(--color-border)] hover:bg-[var(--color-border)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <button
              onClick={handleNext}
              disabled={currentIndex === entries.length - 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold border border-[var(--color-border)] hover:bg-[var(--color-border)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {status === "success" && (
              <span className="text-xs text-green-500 font-semibold flex items-center gap-1">
                ✓ Files Written
              </span>
            )}
            {status === "error" && (
              <span className="text-xs text-red-500 font-semibold flex items-center gap-1">
                ✗ Write Failed
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={isWriting || !canWrite}
              className="px-4 py-2 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-semibold rounded-md text-xs hover:opacity-90 disabled:opacity-55 transition-all"
              title={!canWrite ? "You must view both the Rules and Map tabs before writing." : ""}
            >
              {isWriting ? "Saving..." : "Write Both Files"}
            </button>
            <button
              onClick={handleNext}
              disabled={currentIndex === entries.length - 1}
              className="px-3 py-2 border border-[var(--color-border)] rounded-md text-xs font-semibold hover:bg-[var(--color-border)] transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
