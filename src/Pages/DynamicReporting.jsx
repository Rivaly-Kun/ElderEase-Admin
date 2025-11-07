import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { BarChart3, FileText, Clock, Zap, BarChart } from "lucide-react";
import Sidebar from "../Components/Sidebar";
import Header from "../Components/Header";
import ReportingAnalytics from "../Components/ReportingAnalytics";
import ReportGeneration from "../Components/ReportGeneration";
import ReportTemplates from "../Components/ReportTemplates";
import ReportHistory from "../Components/ReportHistory";
import useResolvedCurrentUser from "../hooks/useResolvedCurrentUser";

const DynamicReportingSystem = () => {
  const location = useLocation();
  const [activeMenu, setActiveMenu] = useState("Dynamic Reporting");
  const [activeTab, setActiveTab] = useState("analytics");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const { currentUser, loading } = useResolvedCurrentUser();

  // Handle navigation state to set active tab
  useEffect(() => {
    if (location.state?.initialTab) {
      setActiveTab(location.state.initialTab);
    }
  }, [location.state]);

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setActiveTab("generate"); // Switch to generate tab
  };

  const tabs = [
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "generate", label: "Generate Report", icon: FileText },
    { id: "templates", label: "Report Templates", icon: Zap },
    { id: "history", label: "Report History", icon: Clock },
  ];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading reporting workspace...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-purple-50 font-sans">
      <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header notificationCount={3} />

        <main className="flex-1 overflow-y-auto p-8">
          {/* Header with Logo */}
          <div className="mb-8 flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center">
              <BarChart className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                Dynamic Reporting System
              </h1>
              <p className="text-gray-600">
                Generate comprehensive reports and analytics for Elder Ease
              </p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-4 mb-8 bg-white rounded-xl shadow-md p-2 sticky top-0 z-10">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all ${
                    activeTab === tab.id
                      ? "bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="overflow-y-auto pr-4">
            {activeTab === "analytics" && (
              <ReportingAnalytics currentUser={currentUser} />
            )}
            {activeTab === "generate" && (
              <ReportGeneration
                selectedTemplate={selectedTemplate}
                currentUser={currentUser}
              />
            )}
            {activeTab === "templates" && (
              <ReportTemplates
                onTemplateSelect={handleTemplateSelect}
                currentUser={currentUser}
              />
            )}
            {activeTab === "history" && (
              <ReportHistory currentUser={currentUser} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DynamicReportingSystem;
