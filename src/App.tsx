import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";

const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Clients = lazy(() => import("./pages/Clients"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Settings = lazy(() => import("./pages/Settings"));
const Andromeda = lazy(() => import("./pages/Andromeda"));
const ClientAudit = lazy(() => import("./pages/ClientAudit"));
const ClientReports = lazy(() => import("./pages/ClientReports"));
const ReportShare = lazy(() => import("./pages/ReportShare"));
const ReportSchedules = lazy(() => import("./pages/ReportSchedules"));
const ClientCreatives = lazy(() => import("./pages/ClientCreatives"));
const ClientAudiences = lazy(() => import("./pages/ClientAudiences"));
const AlertBuilder = lazy(() => import("./pages/AlertBuilder"));
const AlertEvents = lazy(() => import("./pages/AlertEvents"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground shadow-card backdrop-blur-sm">
        Carregando pagina...
      </div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/campaigns" element={<Campaigns />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/andromeda" element={<Andromeda />} />
                <Route path="/clients/:id/audit" element={<ClientAudit />} />
                <Route path="/clients/:id/reports" element={<ClientReports />} />
                <Route path="/clients/:id/creatives" element={<ClientCreatives />} />
                <Route path="/clients/:id/audiences" element={<ClientAudiences />} />
                <Route path="/alerts/new" element={<AlertBuilder />} />
                <Route path="/alerts/:id/edit" element={<AlertBuilder />} />
                <Route path="/alert-events" element={<AlertEvents />} />
                <Route path="/report-schedules" element={<ReportSchedules />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="/share/reports/:token" element={<ReportShare />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
