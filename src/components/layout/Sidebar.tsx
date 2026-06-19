import { FolderOpen, LayoutGrid, Pencil } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Home", icon: FolderOpen },
  { to: "/editor", label: "Editor", icon: Pencil },
  { to: "/loadouts", label: "Loadouts", icon: LayoutGrid },
];

export function Sidebar() {
  return (
    <aside className="flex w-56 flex-col border-r border-[var(--color-border)] bg-[var(--color-card)]">
      <div className="border-b border-[var(--color-border)] px-4 py-5">
        <h1 className="text-lg font-bold tracking-tight">Omega</h1>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          AI rules generator
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]",
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
