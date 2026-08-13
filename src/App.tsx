import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const Landing = lazy(() => import("./pages/Landing"));
const Vsl = lazy(() => import("./pages/Vsl"));
const Privacidade = lazy(() => import("./pages/Privacidade"));
const Termos = lazy(() => import("./pages/Termos"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Planner = lazy(() => import("./pages/Planner"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const Clients = lazy(() => import("./pages/Clients"));
const ClientHub = lazy(() => import("./pages/ClientHub"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Settings = lazy(() => import("./pages/Settings"));
const Andromeda = lazy(() => import("./pages/Andromeda"));
const ClientAudit = lazy(() => import("./pages/ClientAudit"));
const ClientReports = lazy(() => import("./pages/ClientReports"));
const ReportShare = lazy(() => import("./pages/ReportShare"));
const ClientDashboardShare = lazy(() => import("./pages/ClientDashboardShare"));
const ReportSchedules = lazy(() => import("./pages/ReportSchedules"));
const ClientCreatives = lazy(() => import("./pages/ClientCreatives"));
const ClientAudiences = lazy(() => import("./pages/ClientAudiences"));
const AlertBuilder = lazy(() => import("./pages/AlertBuilder"));
const AlertEvents = lazy(() => import("./pages/AlertEvents"));
const Chat = lazy(() => import("./pages/Chat"));
const WhatsappScheduled = lazy(() => import("./pages/WhatsappScheduled"));
const AutomationLog = lazy(() => import("./pages/AutomationLog"));
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
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Publicas: a raiz e a pagina de venda, nao o dashboard. */}
              <Route path="/" element={<Landing />} />
              {/* Pagina de VSL: e para onde o anuncio aponta. */}
              <Route path="/vsl" element={<Vsl />} />
              <Route path="/privacidade" element={<Privacidade />} />
              <Route path="/termos" element={<Termos />} />
              <Route path="/auth" element={<Auth />} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/planner" element={<Planner />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/clients/:id" element={<ClientHub />} />
                <Route path="/financeiro" element={<Financeiro />} />
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
                <Route path="/whatsapp-scheduled" element={<WhatsappScheduled />} />
                <Route path="/automations" element={<AutomationLog />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="/share/reports/:token" element={<ReportShare />} />
              <Route path="/dashboard/:token" element={<ClientDashboardShare />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
