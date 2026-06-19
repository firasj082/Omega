import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useProjectStore } from "@/store/useProjectStore";
import { RuleBlockItem } from "./RuleBlock";
import { AddBlockMenu } from "./AddBlockMenu";

export function BlockEditor() {
  const editorBlocks = useProjectStore((s) => s.editorBlocks);
  const addBlock = useProjectStore((s) => s.addBlock);
  const reorderBlocks = useProjectStore((s) => s.reorderBlocks);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderBlocks(String(active.id), String(over.id));
    }
  };

  if (editorBlocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-[var(--color-muted-foreground)]">
          No blocks yet. Add your first rule block to get started.
        </p>
        <div className="w-48">
          <AddBlockMenu onAdd={addBlock} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={editorBlocks.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          {editorBlocks.map((block) => (
            <RuleBlockItem key={block.id} block={block} />
          ))}
        </SortableContext>
      </DndContext>
      <AddBlockMenu onAdd={addBlock} />
    </div>
  );
}
