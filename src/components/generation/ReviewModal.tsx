import { useState } from "react";
import type { GenerationEntry } from "@/types";
import { renderOutput } from "@/writers";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { X, ChevronLeft, ChevronRight, FileCheck } from "lucide-react";

interface ReviewModalProps {
  entries: GenerationEntry[];
  onClose: () => void;
  onWriteFile: (entry: GenerationEntry, content: string) => Promise<boolean>;
}

export function ReviewModal({ entries, onClose, onWriteFile }: ReviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isWriting, setIsWriting] = useState(false);
  const [writeStatuses, setWriteStatuses] = useState<Record<string, "success" | "error" | null>>({});

  const loadouts = useLoadoutStore((s) => s.loadouts);
  const entry = entries[currentIndex];

  if (!entry) return null;

  // Find blocks for this loadout
  const loadout = loadouts.find((l) => l.id === entry.loadoutId);
  const blocks = loadout ? loadout.blocks : [];
  const renderedContent = renderOutput(entry.outputTarget, blocks);

  const handleNext = () => {
    if (currentIndex < entries.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSave = async () => {
    setIsWriting(true);
    try {
      const ok = await onWriteFile(entry, renderedContent);
      setWriteStatuses((prev) => ({
        ...prev,
        [entry.subProjectId]: ok ? "success" : "error",
      }));
      if (ok && currentIndex < entries.length - 1) {
        setTimeout(() => {
          setCurrentIndex(currentIndex + 1);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="flex h-[80vh] w-full max-w-4xl flex-col bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-3">
          <div className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-primary-500" />
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

        {/* Content Details */}
        <div className="bg-[var(--color-card)] border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between text-xs text-[var(--color-muted-foreground)]">
          <div>
            <span className="font-semibold text-[var(--color-foreground)] text-sm block">
              Sub-project: {entry.subProjectName}
            </span>
            <span className="font-mono mt-0.5 block">{entry.outputPath}</span>
          </div>
          <div className="text-right">
            <span className="font-medium text-[var(--color-foreground)] block">
              Loadout: {loadout?.name || "Unknown"}
            </span>
            <span className="uppercase text-[10px] bg-[var(--color-border)] px-1.5 py-0.5 rounded font-mono font-semibold">
              {entry.outputTarget}
            </span>
          </div>
        </div>

        {/* Code Preview */}
        <div className="flex-1 overflow-auto bg-black p-4 font-mono text-xs text-green-400 select-text leading-relaxed">
          <pre className="whitespace-pre-wrap">{renderedContent}</pre>
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
                ✓ File Written
              </span>
            )}
            {status === "error" && (
              <span className="text-xs text-red-500 font-semibold flex items-center gap-1">
                ✗ Write Failed
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={isWriting}
              className="px-4 py-2 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-semibold rounded-md text-xs hover:opacity-90 disabled:opacity-55 transition-all"
            >
              {isWriting ? "Saving..." : "Write This File"}
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
