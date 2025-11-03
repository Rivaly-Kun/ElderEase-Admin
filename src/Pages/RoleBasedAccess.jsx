import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "../Components/Header";
import Sidebar from "../Components/Sidebar";
import AccessControlDashboard from "../Components/AccessControlDashboard";
import useResolvedCurrentUser from "../hooks/useResolvedCurrentUser";

const RoleBasedAccess = () => {
  const [activeMenu, setActiveMenu] = useState("Role Based Access Control");
  const { currentUser, loading } = useResolvedCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();

  const selectedAuditLogState = location.state?.selectedAuditLog || null;
  const initialSelectedAuditLogId = selectedAuditLogState?.id || null;
  const initialSelectedAuditLogToken = selectedAuditLogState?.token || null;

  useEffect(() => {
    if (location.state?.selectedAuditLogId) {
      navigate(location.pathname + location.search, { replace: true });
    }
  }, [location, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="animate-spin">
          <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header activeMenu={activeMenu} />

        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            <AccessControlDashboard
              currentUser={currentUser}
              initialSelectedAuditLog={{
                id: initialSelectedAuditLogId,
                token: initialSelectedAuditLogToken,
              }}
            />
          </div>
        </main>
      </div>
    </div>
  );
};

export default RoleBasedAccess;
