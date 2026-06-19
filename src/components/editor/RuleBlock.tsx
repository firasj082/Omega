import { useState } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { RuleBlock } from "@/types";
import { BLOCK_TYPE_LABELS } from "@/types";
import { useProjectStore } from "@/store/useProjectStore";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface RuleBlockProps {
  block: RuleBlock;
}

function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    onChange(el.value);
  };

  const setRef = (el: HTMLTextAreaElement | null) => {
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };

  return (
    <Textarea
      ref={setRef}
      value={value}
      onChange={handleInput}
      placeholder={placeholder}
      className="min-h-[80px] resize-none overflow-hidden"
    />
  );
}

export function RuleBlockItem({ block }: RuleBlockProps) {
  const updateBlock = useProjectStore((s) => s.updateBlock);
  const removeBlock = useProjectStore((s) => s.removeBlock);
  const [editingTitle, setEditingTitle] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleDelete = () => {
    if (block.content.trim() || block.title.trim()) {
      setShowDeleteDialog(true);
    } else {
      removeBlock(block.id);
    }
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4",
          isDragging && "opacity-50 shadow-lg",
        )}
      >
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab touch-none rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <Badge variant="secondary">{BLOCK_TYPE_LABELS[block.type]}</Badge>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            aria-label="Delete block"
          >
            <Trash2 className="h-4 w-4 text-[var(--color-destructive)]" />
          </Button>
        </div>

        {block.type !== "freeform" && (
          <div className="mb-2">
            {editingTitle ? (
              <Input
                autoFocus
                value={block.title}
                onChange={(e) =>
                  updateBlock(block.id, { title: e.target.value })
                }
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setEditingTitle(false);
                }}
                className="font-semibold"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="text-left text-sm font-semibold hover:underline"
              >
                {block.title || "Untitled"}
              </button>
            )}
          </div>
        )}

        <AutoResizeTextarea
          value={block.content}
          onChange={(content) => updateBlock(block.id, { content })}
          placeholder="Enter block content..."
        />
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete block?</DialogTitle>
            <DialogDescription>
              This block has content. Are you sure you want to delete it?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                removeBlock(block.id);
                setShowDeleteDialog(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
