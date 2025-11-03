// SMS Management Page
// Notification Management - Announcements, Events & Message History

import React, { useState } from "react";
import Header from "../Components/Header";
import Sidebar from "../Components/Sidebar";
import NotificationDashboard from "../Components/NotificationDashboard";
import useResolvedCurrentUser from "../hooks/useResolvedCurrentUser";

const SmsManagement = () => {
  const [activeMenu, setActiveMenu] = useState("Notification Management");
  const { currentUser, loading } = useResolvedCurrentUser();

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
            <NotificationDashboard currentUser={currentUser} />
          </div>
        </main>
      </div>
    </div>
  );
};

export default SmsManagement;
