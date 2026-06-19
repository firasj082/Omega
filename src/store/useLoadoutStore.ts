import { create } from "zustand";
import { load } from "@tauri-apps/plugin-store";
import type { Loadout, ProjectType } from "@/types";
import { STORE_KEY } from "@/types";
import { generateId } from "@/utils/id";
import { getBuiltInLoadouts } from "@/templates";

interface LoadoutStore {
  loadouts: Loadout[];
  isLoading: boolean;
  error: string | null;

  loadFromDisk: () => Promise<void>;
  saveLoadout: (loadout: Loadout) => Promise<void>;
  deleteLoadout: (id: string) => Promise<void>;
  duplicateLoadout: (id: string) => Promise<void>;
  getByProjectType: (type: ProjectType) => Loadout[];
}

async function getStore() {
  return load("loadouts.json", { defaults: {}, autoSave: true });
}

async function persistLoadouts(loadouts: Loadout[]): Promise<void> {
  const store = await getStore();
  await store.set(STORE_KEY, loadouts);
  await store.save();
}

export const useLoadoutStore = create<LoadoutStore>((set, get) => ({
  loadouts: [],
  isLoading: false,
  error: null,

  loadFromDisk: async () => {
    set({ isLoading: true, error: null });
    try {
      const store = await getStore();
      const stored = await store.get<Loadout[]>(STORE_KEY);

      if (!stored || stored.length === 0) {
        const builtIn = getBuiltInLoadouts();
        await persistLoadouts(builtIn);
        set({ loadouts: builtIn, isLoading: false });
        return;
      }

      set({ loadouts: stored, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load loadouts";
      set({ error: message, isLoading: false });
    }
  },

  saveLoadout: async (loadout) => {
    set({ error: null });
    try {
      const existing = get().loadouts.find((l) => l.id === loadout.id);
      const updated: Loadout = {
        ...loadout,
        updatedAt: new Date().toISOString(),
        createdAt: existing?.createdAt ?? loadout.createdAt,
      };

      const loadouts = existing
        ? get().loadouts.map((l) => (l.id === loadout.id ? updated : l))
        : [...get().loadouts, updated];

      await persistLoadouts(loadouts);
      set({ loadouts });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save loadout";
      set({ error: message });
      throw err;
    }
  },

  deleteLoadout: async (id) => {
    const loadout = get().loadouts.find((l) => l.id === id);
    if (!loadout || loadout.isBuiltIn) return;

    set({ error: null });
    try {
      const loadouts = get().loadouts.filter((l) => l.id !== id);
      await persistLoadouts(loadouts);
      set({ loadouts });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete loadout";
      set({ error: message });
      throw err;
    }
  },

  duplicateLoadout: async (id) => {
    const source = get().loadouts.find((l) => l.id === id);
    if (!source) return;

    const now = new Date().toISOString();
    const duplicate: Loadout = {
      ...source,
      id: generateId(),
      name: `${source.name} (Copy)`,
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now,
      blocks: source.blocks.map((block) => ({
        ...block,
        id: generateId(),
      })),
    };

    await get().saveLoadout(duplicate);
  },

  getByProjectType: (type) =>
    get().loadouts.filter((l) => l.projectTypes.includes(type)),
}));
