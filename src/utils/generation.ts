import type { SubProject, GenerationPlan, GenerationEntry } from "@/types";
import { OUTPUT_CONFIGS } from "@/types";

export function buildGenerationPlan(
  subProjects: SubProject[],
): GenerationPlan {
  const entries: GenerationEntry[] = subProjects
    .filter((sp) => sp.included && sp.assignedLoadoutId !== null)
    .map((sp) => {
      const config = OUTPUT_CONFIGS[sp.outputTarget];
      const rulesOutputPath = `${sp.absolutePath}/${config.rulesFile}`;
      const mapOutputPath = `${sp.absolutePath}/${config.mapFile}`;

      const existingRulesFile = sp.existingRuleFiles.find(
        (f) => f.filename === config.rulesFile
      ) ?? null;

      const existingMapFile = sp.existingRuleFiles.find(
        (f) => f.filename === config.mapFile
      ) ?? null;

      return {
        subProjectId: sp.id,
        subProjectName: sp.name,
        rulesOutputPath,
        mapOutputPath,
        loadoutId: sp.assignedLoadoutId!,
        outputTarget: sp.outputTarget,
        existingRulesFile,
        existingMapFile,
      };
    });

  return {
    strategy: "per-subproject",
    entries,
  };
}
