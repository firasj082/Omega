import {
  OUTPUT_CONFIGS,
  OUTPUT_TARGET_LABELS,
  type OutputTarget,
} from "@/types";
import { useProjectStore } from "@/store/useProjectStore";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderOpen } from "lucide-react";

const outputTargets = Object.keys(OUTPUT_CONFIGS) as OutputTarget[];

export function TopBar() {
  const folderPath = useProjectStore((s) => s.folderPath);
  const outputTarget = useProjectStore((s) => s.outputTarget);
  const setOutputTarget = useProjectStore((s) => s.setOutputTarget);
  const activeLoadoutId = useProjectStore((s) => s.activeLoadoutId);
  const loadouts = useLoadoutStore((s) => s.loadouts);

  const activeLoadout = loadouts.find((l) => l.id === activeLoadoutId);
  const config = OUTPUT_CONFIGS[outputTarget];

  return (
    <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-card)] px-6 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <FolderOpen className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {folderPath ?? "No folder selected"}
          </p>
          {activeLoadout && (
            <p className="truncate text-xs text-[var(--color-muted-foreground)]">
              Loadout: {activeLoadout.name}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-[var(--color-muted-foreground)]">
          Output: {config.filename}
        </span>
        <Select
          value={outputTarget}
          onValueChange={(v) => setOutputTarget(v as OutputTarget)}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {outputTargets.map((target) => (
              <SelectItem key={target} value={target}>
                {OUTPUT_TARGET_LABELS[target]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </header>
  );
}
