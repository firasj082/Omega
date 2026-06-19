import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Loadout, ProjectType } from "@/types";
import { PROJECT_TYPE_LABELS } from "@/types";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { useProjectStore } from "@/store/useProjectStore";
import { generateId } from "@/utils/id";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface LoadoutFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editLoadout?: Loadout;
}

const allProjectTypes = Object.keys(PROJECT_TYPE_LABELS) as ProjectType[];

export function LoadoutForm({
  open,
  onOpenChange,
  editLoadout,
}: LoadoutFormProps) {
  const saveLoadout = useLoadoutStore((s) => s.saveLoadout);
  const setEditorBlocks = useProjectStore((s) => s.setEditorBlocks);
  const setActiveLoadout = useProjectStore((s) => s.setActiveLoadout);
  const navigate = useNavigate();

  const [name, setName] = useState(editLoadout?.name ?? "");
  const [description, setDescription] = useState(
    editLoadout?.description ?? "",
  );
  const [selectedTypes, setSelectedTypes] = useState<ProjectType[]>(
    editLoadout?.projectTypes ?? ["unknown"],
  );
  const [isSaving, setIsSaving] = useState(false);

  const toggleType = (type: ProjectType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (selectedTypes.length === 0) {
      toast.error("Select at least one project type");
      return;
    }

    setIsSaving(true);
    const now = new Date().toISOString();
    const loadout: Loadout = {
      id: editLoadout?.id ?? generateId(),
      name: name.trim(),
      description: description.trim(),
      projectTypes: selectedTypes,
      blocks: editLoadout?.blocks ?? [],
      isBuiltIn: false,
      createdAt: editLoadout?.createdAt ?? now,
      updatedAt: now,
    };

    try {
      await saveLoadout(loadout);
      if (!editLoadout) {
        setEditorBlocks([]);
        setActiveLoadout(loadout.id);
        navigate("/editor");
      }
      toast.success(editLoadout ? "Loadout updated" : "Loadout created");
      onOpenChange(false);
      setName("");
      setDescription("");
      setSelectedTypes(["unknown"]);
    } catch {
      toast.error("Failed to save loadout");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editLoadout ? "Edit Loadout" : "New Loadout"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="loadout-name">Name</Label>
            <Input
              id="loadout-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Custom Loadout"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="loadout-desc">Description</Label>
            <Textarea
              id="loadout-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this loadout is for..."
            />
          </div>
          <div className="space-y-2">
            <Label>Project Types</Label>
            <div className="flex flex-wrap gap-1">
              {allProjectTypes.map((type) => (
                <button key={type} type="button" onClick={() => toggleType(type)}>
                  <Badge
                    variant={
                      selectedTypes.includes(type) ? "default" : "outline"
                    }
                  >
                    {PROJECT_TYPE_LABELS[type]}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={isSaving} className="w-full">
            {isSaving ? "Saving..." : editLoadout ? "Update" : "Create & Edit"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
