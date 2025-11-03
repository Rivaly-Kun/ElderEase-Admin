import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import "./index.css";
import Dashboard from "./Pages/Dashboard";
import SeniorCitizenManagement from "./Pages/SeniorCitizenManagement";
import PaymentManagement from "./Pages/PaymentManagement";
import SMSManagement from "./Pages/SmsManagement";
import DynamicReportingSystem from "./Pages/DynamicReporting";
import ServiceAndBenefitsTrack from "./Pages/ServiceAndBenefitsTrack";
import RoleBasedAccess from "./Pages/RoleBasedAccess";
import { MemberSearchProvider } from "./Context/MemberSearchContext";
import GlobalMemberProfileModal from "./Components/GlobalMemberProfileModal";
import { AuthProvider } from "./Context/AuthContext";
import ProtectedRoute from "./Components/ProtectedRoute";
import DocumentManagement from "./Pages/DocumentManagement";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <MemberSearchProvider>
        <Routes>
          <Route path="/" element={<App />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute moduleId="dashboard">
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/citizens"
            element={
              <ProtectedRoute moduleId="senior_citizens">
                <SeniorCitizenManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payments"
            element={
              <ProtectedRoute moduleId="payments">
                <PaymentManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/services"
            element={
              <ProtectedRoute moduleId="services">
                <ServiceAndBenefitsTrack />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute moduleId="notifications">
                <SMSManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute moduleId="reports">
                <DynamicReportingSystem />
              </ProtectedRoute>
            }
          />

          <Route
            path="/documents"
            element={
              <ProtectedRoute moduleId="documents">
                <DocumentManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/roles"
            element={
              <ProtectedRoute moduleId="access_control">
                <RoleBasedAccess />
              </ProtectedRoute>
            }
          />
        </Routes>
        {/* Global Member Profile Modal - renders on all pages */}
        <GlobalMemberProfileModal />
      </MemberSearchProvider>
    </AuthProvider>
  </BrowserRouter>
);
