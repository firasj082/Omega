import { Badge } from "@/components/ui/badge";
import { PROJECT_TYPE_LABELS, type DetectionResult } from "@/types";
import type { ProjectType } from "@/types";
import { FileSearch } from "lucide-react";

interface ProjectBadgeProps {
  detection: DetectionResult;
}

const confidenceColors = {
  high: "default" as const,
  medium: "secondary" as const,
  low: "outline" as const,
};

type ConfidenceLevel = keyof typeof confidenceColors;

export function ProjectBadge({ detection }: ProjectBadgeProps) {
  const rootType: ProjectType = detection.rootProjectType;
  const firstSub = detection.subProjects[0];
  const confidence: ConfidenceLevel = firstSub?.confidence ?? "low";
  const detectedFiles: string[] = firstSub?.detectedFiles ?? [];

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)]">
          <FileSearch className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold">
            {PROJECT_TYPE_LABELS[rootType]}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={confidenceColors[confidence]}>
              {confidence} confidence
            </Badge>
          </div>
        </div>
      </div>
      {detectedFiles.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-[var(--color-muted-foreground)]">
            Detected files:
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {detectedFiles.map((file: string) => (
              <Badge key={file} variant="outline">
                {file}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
