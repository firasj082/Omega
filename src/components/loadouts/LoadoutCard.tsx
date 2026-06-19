import { useState } from "react";
import { Copy, Lock, Pencil, Trash2 } from "lucide-react";
import type { Loadout } from "@/types";
import { PROJECT_TYPE_LABELS } from "@/types";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { useProjectStore } from "@/store/useProjectStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface LoadoutCardProps {
  loadout: Loadout;
  onEdit: (loadout: Loadout) => void;
}

export function LoadoutCard({ loadout, onEdit }: LoadoutCardProps) {
  const duplicateLoadout = useLoadoutStore((s) => s.duplicateLoadout);
  const deleteLoadout = useLoadoutStore((s) => s.deleteLoadout);
  const setEditorBlocks = useProjectStore((s) => s.setEditorBlocks);
  const setActiveLoadout = useProjectStore((s) => s.setActiveLoadout);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleEdit = () => {
    setEditorBlocks(loadout.blocks);
    setActiveLoadout(loadout.id);
    onEdit(loadout);
  };

  const handleDuplicate = async () => {
    try {
      await duplicateLoadout(loadout.id);
      toast.success("Loadout duplicated");
    } catch {
      toast.error("Failed to duplicate loadout");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteLoadout(loadout.id);
      toast.success("Loadout deleted");
      setShowDeleteDialog(false);
    } catch {
      toast.error("Failed to delete loadout");
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {loadout.name}
                {loadout.isBuiltIn && (
                  <Lock className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                {loadout.description}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-1">
            {loadout.projectTypes.map((type) => (
              <Badge key={type} variant="secondary">
                {PROJECT_TYPE_LABELS[type]}
              </Badge>
            ))}
          </div>
          <p className="mb-4 text-xs text-[var(--color-muted-foreground)]">
            {loadout.blocks.length} block
            {loadout.blocks.length !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleEdit}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button size="sm" variant="outline" onClick={handleDuplicate}>
              <Copy className="h-3.5 w-3.5" />
              Duplicate
            </Button>
            {!loadout.isBuiltIn && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-3.5 w-3.5 text-[var(--color-destructive)]" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete loadout?</DialogTitle>
            <DialogDescription>
              This will permanently delete &quot;{loadout.name}&quot;. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
