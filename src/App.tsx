import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/layout/Sidebar";
import { Home } from "@/pages/Home";
import { Editor } from "@/pages/Editor";
import { Loadouts } from "@/pages/Loadouts";
import { useLoadoutStore } from "@/store/useLoadoutStore";

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}

export default function App() {
  const loadFromDisk = useLoadoutStore((s) => s.loadFromDisk);

  useEffect(() => {
    loadFromDisk();
  }, [loadFromDisk]);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <AppLayout>
              <Home />
            </AppLayout>
          }
        />
        <Route
          path="/editor"
          element={
            <AppLayout>
              <Editor />
            </AppLayout>
          }
        />
        <Route
          path="/loadouts"
          element={
            <AppLayout>
              <Loadouts />
            </AppLayout>
          }
        />
      </Routes>
      <Toaster position="bottom-right" richColors />
    </BrowserRouter>
  );
}
