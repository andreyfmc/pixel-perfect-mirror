import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="flex min-h-screen bg-bg text-foreground">
      <AppSidebar />
      <main
        className="flex-1 min-w-0 md:pb-0"
        style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}
      >
        <Outlet />
      </main>
      <MobileBottomNav />
    </div>
  );
}
