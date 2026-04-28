import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Campaigns from "./pages/Campaigns";
import Alerts from "./pages/Alerts";
import Settings from "./pages/Settings";
import Andromeda from "./pages/Andromeda";
import ClientAudit from "./pages/ClientAudit";
import ClientReports from "./pages/ClientReports";
import ReportShare from "./pages/ReportShare";
import ReportSchedules from "./pages/ReportSchedules";
import ClientCreatives from "./pages/ClientCreatives";
import ClientAudiences from "./pages/ClientAudiences";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
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
              <Route path="/report-schedules" element={<ReportSchedules />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="/share/reports/:token" element={<ReportShare />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
