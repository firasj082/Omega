import { Plus } from "lucide-react";
import type { BlockType } from "@/types";
import { BLOCK_TYPE_LABELS } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const blockTypes = Object.keys(BLOCK_TYPE_LABELS) as BlockType[];

interface AddBlockMenuProps {
  onAdd: (type: BlockType) => void;
}

export function AddBlockMenu({ onAdd }: AddBlockMenuProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full">
          <Plus className="h-4 w-4" />
          Add Block
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="flex flex-col gap-1">
          {blockTypes.map((type) => (
            <Button
              key={type}
              variant="ghost"
              className="justify-start"
              onClick={() => onAdd(type)}
            >
              {BLOCK_TYPE_LABELS[type]}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
