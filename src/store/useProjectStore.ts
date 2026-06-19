import { create } from "zustand";
import type {
  BlockType,
  DetectionResult,
  OutputTarget,
  RuleBlock,
  SubProject,
  TreeNode,
  ExistingRuleFile,
  EditorSession,
  ProjectType,
} from "@/types";
import { DEFAULT_BLOCK_TITLES, OUTPUT_CONFIGS } from "@/types";
import { generateId } from "@/utils/id";
import { parseRuleFileToBlocks } from "@/utils/ruleFileParser";

interface ProjectStore {
  folderPath: string | null;
  detection: DetectionResult | null;
  activeLoadoutId: string | null;
  outputTarget: OutputTarget;
  editorBlocks: RuleBlock[];

  subProjects: SubProject[];
  selectedNodePath: string | null;
  isMonorepo: boolean;
  editorSession: EditorSession | null;

  setFolder: (path: string) => void;
  setDetection: (result: DetectionResult) => void;
  setActiveLoadout: (id: string | null) => void;
  setOutputTarget: (target: OutputTarget) => void;
  setEditorBlocks: (blocks: RuleBlock[]) => void;
  updateBlock: (id: string, patch: Partial<RuleBlock>) => void;
  addBlock: (type: BlockType) => void;
  removeBlock: (id: string) => void;
  reorderBlocks: (activeId: string, overId: string) => void;

  setSubProjects: (subProjects: SubProject[]) => void;
  setSelectedNode: (path: string | null) => void;
  markNodeAsProject: (node: TreeNode, projectType: ProjectType) => void;
  unmarkNode: (relativePath: string) => void;
  setSubProjectType: (id: string, type: ProjectType) => void;
  setSubProjectLoadout: (id: string, loadoutId: string | null) => void;
  setSubProjectTarget: (id: string, target: OutputTarget) => void;
  setSubProjectIncluded: (id: string, included: boolean) => void;

  // Editor Session actions
  openExistingFile: (file: ExistingRuleFile, subProjectId: string) => void;
  closeEditorSession: () => void;
  setSessionBlocks: (blocks: RuleBlock[]) => void;
  setSessionDirty: (isDirty: boolean) => void;
  saveSessionSuccess: (newContent: string) => void;
}

function recalculateOrder(blocks: RuleBlock[]): RuleBlock[] {
  return blocks.map((block, index) => ({ ...block, order: index }));
}

export const useProjectStore = create<ProjectStore>((set) => ({
  folderPath: null,
  detection: null,
  activeLoadoutId: null,
  outputTarget: "cursor",
  editorBlocks: [],

  subProjects: [],
  selectedNodePath: null,
  isMonorepo: false,
  editorSession: null,

  setFolder: (path) => set({ folderPath: path }),

  setDetection: (result) =>
    set({
      detection: result,
      subProjects: result.subProjects,
      isMonorepo: result.isMonorepo,
    }),

  setActiveLoadout: (id) => set({ activeLoadoutId: id }),

  setOutputTarget: (target) => set({ outputTarget: target }),

  setEditorBlocks: (blocks) => {
    const ordered = recalculateOrder(blocks);
    set((state) => {
      let nextSession = state.editorSession;
      if (nextSession) {
        nextSession = { ...nextSession, blocks: ordered };
      }
      return { editorBlocks: ordered, editorSession: nextSession };
    });
  },

  updateBlock: (id, patch) =>
    set((state) => {
      const updated = state.editorBlocks.map((block) =>
        block.id === id ? { ...block, ...patch } : block
      );

      let nextSession = state.editorSession;
      if (nextSession) {
        nextSession = { ...nextSession, blocks: updated };
      }

      return {
        editorBlocks: updated,
        editorSession: nextSession,
      };
    }),

  addBlock: (type) =>
    set((state) => {
      const newBlock: RuleBlock = {
        id: generateId(),
        type,
        title: DEFAULT_BLOCK_TITLES[type],
        content: "",
        order: state.editorBlocks.length,
      };
      const updated = [...state.editorBlocks, newBlock];

      let nextSession = state.editorSession;
      if (nextSession) {
        nextSession = { ...nextSession, blocks: updated };
      }

      return {
        editorBlocks: updated,
        editorSession: nextSession,
      };
    }),

  removeBlock: (id) =>
    set((state) => {
      const updated = recalculateOrder(
        state.editorBlocks.filter((block) => block.id !== id)
      );

      let nextSession = state.editorSession;
      if (nextSession) {
        nextSession = { ...nextSession, blocks: updated };
      }

      return {
        editorBlocks: updated,
        editorSession: nextSession,
      };
    }),

  reorderBlocks: (activeId, overId) =>
    set((state) => {
      const blocks = [...state.editorBlocks];
      const activeIndex = blocks.findIndex((b) => b.id === activeId);
      const overIndex = blocks.findIndex((b) => b.id === overId);
      if (activeIndex === -1 || overIndex === -1) return state;

      const [removed] = blocks.splice(activeIndex, 1);
      blocks.splice(overIndex, 0, removed);
      const updated = recalculateOrder(blocks);

      let nextSession = state.editorSession;
      if (nextSession) {
        nextSession = { ...nextSession, blocks: updated };
      }

      return {
        editorBlocks: updated,
        editorSession: nextSession,
      };
    }),

  setSubProjects: (subProjects) => set({ subProjects }),

  setSelectedNode: (path) => set({ selectedNodePath: path }),

  markNodeAsProject: (node, projectType) =>
    set((state) => {
      const exists = state.subProjects.some(
        (sp) => sp.absolutePath === node.absolutePath
      );
      if (exists) return {};

      const id = `subproj-manual-${Date.now()}`;
      const newSubProject: SubProject = {
        id,
        name: node.name,
        relativePath: node.relativePath,
        absolutePath: node.absolutePath,
        projectType,
        detectionSource: "manual",
        confidence: "high",
        detectedFiles: [],
        assignedLoadoutId: null,
        outputTarget: "claude",
        included: true,
        existingRuleFiles: node.existingRuleFiles || [],
        editingExistingFile: null,
      };

      return {
        subProjects: [...state.subProjects, newSubProject],
      };
    }),

  unmarkNode: (relativePath) =>
    set((state) => {
      const subProj = state.subProjects.find(
        (sp) => sp.relativePath === relativePath
      );
      if (!subProj) return {};

      return {
        subProjects: state.subProjects.filter(
          (sp) => sp.relativePath !== relativePath
        ),
      };
    }),

  setSubProjectType: (id, type) =>
    set((state) => ({
      subProjects: state.subProjects.map((sp) =>
        sp.id === id ? { ...sp, projectType: type } : sp
      ),
    })),

  setSubProjectLoadout: (id, loadoutId) =>
    set((state) => ({
      subProjects: state.subProjects.map((sp) =>
        sp.id === id ? { ...sp, assignedLoadoutId: loadoutId } : sp
      ),
    })),

  setSubProjectTarget: (id, target) =>
    set((state) => ({
      subProjects: state.subProjects.map((sp) =>
        sp.id === id ? { ...sp, outputTarget: target } : sp
      ),
    })),

  setSubProjectIncluded: (id, included) =>
    set((state) => ({
      subProjects: state.subProjects.map((sp) =>
        sp.id === id ? { ...sp, included } : sp
      ),
    })),

  // Editor Session implementations
  openExistingFile: (file, subProjectId) => {
    const blocks = parseRuleFileToBlocks(file.content, file.outputTarget);
    
    // Auto-inject routing map rule if missing!
    const mapFile = OUTPUT_CONFIGS[file.outputTarget].mapFile;
    const hasMapRef = blocks.some(
      (b) => b.content.includes(mapFile) || b.title.toLowerCase().includes("map")
    );
    if (!hasMapRef) {
      blocks.push({
        id: generateId(),
        type: "section",
        title: "Routing Map Reference",
        content: `Always consult the project directory routing map in ${mapFile} before creating, renaming, or refactoring files to maintain codebase layout consistency.`,
        order: blocks.length,
      });
    }

    set({
      editorSession: {
        subProjectId,
        mode: "editing-existing",
        sourceFile: file,
        blocks,
        isDirty: false,
        outputPath: file.absolutePath,
        outputTarget: file.outputTarget,
      },
      editorBlocks: blocks,
    });
  },

  closeEditorSession: () => {
    set({
      editorSession: null,
      editorBlocks: [],
    });
  },

  setSessionBlocks: (blocks) => {
    const ordered = recalculateOrder(blocks);
    set((state) => {
      let nextSession = state.editorSession;
      if (nextSession) {
        nextSession = { ...nextSession, blocks: ordered };
      }
      return {
        editorBlocks: ordered,
        editorSession: nextSession,
      };
    });
  },

  setSessionDirty: (isDirty) =>
    set((state) => {
      if (!state.editorSession) return {};
      return {
        editorSession: {
          ...state.editorSession,
          isDirty,
        },
      };
    }),

  saveSessionSuccess: (newContent) =>
    set((state) => {
      if (!state.editorSession || !state.editorSession.sourceFile) return {};
      const updatedSource = {
        ...state.editorSession.sourceFile,
        content: newContent,
        lastModified: new Date().toISOString(),
      };
      return {
        editorSession: {
          ...state.editorSession,
          sourceFile: updatedSource,
          isDirty: false,
        },
      };
    }),
}));
