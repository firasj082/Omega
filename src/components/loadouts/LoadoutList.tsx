import { useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { LoadoutCard } from "./LoadoutCard";
import { LoadoutForm } from "./LoadoutForm";
import { Button } from "@/components/ui/button";

export function LoadoutList() {
  const loadouts = useLoadoutStore((s) => s.loadouts);
  const isLoading = useLoadoutStore((s) => s.isLoading);
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);

  const handleEdit = () => {
    navigate("/editor");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-[var(--color-muted-foreground)]">
          Loading loadouts...
        </p>
      </div>
    );
  }

  if (loadouts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-[var(--color-muted-foreground)]">
          No loadouts found. Create your first loadout to get started.
        </p>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          New Loadout
        </Button>
        <LoadoutForm open={showForm} onOpenChange={setShowForm} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Saved Loadouts</h2>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {loadouts.length} loadout{loadouts.length !== 1 ? "s" : ""}{" "}
            available
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          New Loadout
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loadouts.map((loadout) => (
          <LoadoutCard key={loadout.id} loadout={loadout} onEdit={handleEdit} />
        ))}
      </div>
      <LoadoutForm open={showForm} onOpenChange={setShowForm} />
    </div>
  );
}
