import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { NotificationsBell } from "./NotificationsBell";

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="relative flex min-h-screen w-full bg-background">
        {/* Glow background */}
        <div className="pointer-events-none fixed inset-0 bg-gradient-glow" />
        <AppSidebar />
        <div className="relative flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md">
            <SidebarTrigger />
            <div className="flex-1" />
            <NotificationsBell />
          </header>
          <main className="flex-1 p-4 md:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
