// Access Control Dashboard
// Main hub for managing RBAC, users, roles, and audit logs

import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { db } from "../services/firebase";
import { ref, get } from "firebase/database";
import {
  Users,
  Shield,
  Lock,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Key,
  Grid3X3,
} from "lucide-react";
import RoleManagement from "./RoleManagement";
import OfficerManagement from "./OfficerManagement";
import AuditLogViewer from "./AuditLogViewer";
import AdminInfo from "./AdminInfo";
import PermissionMatrix from "./PermissionMatrix";

const AccessControlDashboard = ({ currentUser, initialSelectedAuditLog }) => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get("tab");
    return tabParam || "overview";
  });
  const [stats, setStats] = useState([
    {
      title: "Total Officers",
      value: "0",
      icon: Users,
      color: "bg-blue-100 text-blue-600",
    },
    {
      title: "Active Roles",
      value: "0",
      icon: Shield,
      color: "bg-green-100 text-green-600",
    },
    {
      title: "Recent Audit Logs",
      value: "0",
      icon: BarChart3,
      color: "bg-purple-100 text-purple-600",
    },
    {
      title: "Security Level",
      value: "SSL",
      icon: Lock,
      color: "bg-yellow-100 text-yellow-600",
    },
  ]);

  // Fetch statistics from Firebase
  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch users count
        const usersRef = ref(db, "users");
        const usersSnapshot = await get(usersRef);
        const usersCount = usersSnapshot.exists()
          ? Object.keys(usersSnapshot.val()).length
          : 0;

        // Fetch roles count
        const rolesRef = ref(db, "roles");
        const rolesSnapshot = await get(rolesRef);
        const rolesCount = rolesSnapshot.exists()
          ? Object.keys(rolesSnapshot.val()).length
          : 0;

        // Fetch audit logs count
        const auditRef = ref(db, "auditLogs");
        const auditSnapshot = await get(auditRef);
        const auditCount = auditSnapshot.exists()
          ? Object.keys(auditSnapshot.val()).length
          : 0;

        // Update stats
        setStats((prevStats) =>
          prevStats.map((stat) => {
            if (stat.title === "Total Users") {
              return { ...stat, value: usersCount.toString() };
            }
            if (stat.title === "Active Roles") {
              return { ...stat, value: rolesCount.toString() };
            }
            if (stat.title === "Recent Audit Logs") {
              return { ...stat, value: auditCount.toString() };
            }
            return stat;
          })
        );
      } catch (error) {
        console.error("Error fetching statistics:", error);
      }
    };

    fetchStats();
  }, []);

  // Update activeTab when URL search params change
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "admin", label: "Admin & Users", icon: Key },
    { id: "permissions", label: "Permission Matrix", icon: Grid3X3 },
    { id: "roles", label: "Roles", icon: Shield },
    { id: "officers", label: "Officer Management", icon: Users },
    { id: "audit", label: "Audit Logs", icon: Lock },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">
            Elder Ease - Access Control System
          </h1>
          <p className="text-gray-600 mt-2">
            Welcome, {currentUser?.displayName || "Admin"}! Manage roles, users,
            members, and permissions with SSL encryption
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="mb-8 bg-white rounded-lg shadow border border-gray-200 flex flex-wrap">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-6 py-4 border-b-2 transition ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600 bg-blue-50"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                <Icon size={20} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Statistics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {stats.map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={index}
                    className="bg-white rounded-lg shadow p-6 border border-gray-200 hover:shadow-lg transition"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-gray-700 font-semibold">
                        {stat.title}
                      </h3>
                      <div className={`p-3 rounded-lg ${stat.color}`}>
                        <Icon size={24} />
                      </div>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">
                      {stat.value}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Overview Sections */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* System Status */}
              <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  System Status
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">SSL/HTTPS Encryption</span>
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      Enabled
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Audit Logging</span>
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      Active
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Role-Based Access</span>
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      Active
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Module Permissions</span>
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      Enforced
                    </span>
                  </div>
                </div>
              </div>

              {/* Security Features */}
              <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  Security Features
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <CheckIcon />
                    <div>
                      <p className="font-medium text-gray-800">
                        SSL/TLS 1.3 Encryption
                      </p>
                      <p className="text-sm text-gray-600">
                        All communications encrypted
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckIcon />
                    <div>
                      <p className="font-medium text-gray-800">
                        Role-Based Access Control
                      </p>
                      <p className="text-sm text-gray-600">
                        Granular permission management
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckIcon />
                    <div>
                      <p className="font-medium text-gray-800">
                        Comprehensive Audit Logging
                      </p>
                      <p className="text-sm text-gray-600">
                        Track all admin actions
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckIcon />
                    <div>
                      <p className="font-medium text-gray-800">
                        Module-Level Permissions
                      </p>
                      <p className="text-sm text-gray-600">
                        Fine-grained access control
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Documentation */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow p-6 border border-blue-200">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-800 mb-2">
                    Getting Started with Access Control
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Manage your Elder Ease system using the tabs above:
                  </p>
                  <ul className="space-y-2 text-sm text-gray-700">
                    <li>
                      <strong>Members:</strong> View all system members with
                      their information and roles
                    </li>
                    <li>
                      <strong>Roles:</strong> Create and manage user roles with
                      specific permissions
                    </li>
                    <li>
                      <strong>Users:</strong> Add users, assign roles, and
                      manage access levels
                    </li>
                    <li>
                      <strong>Audit Logs:</strong> Monitor all system activities
                      and user actions
                    </li>
                  </ul>
                </div>
                <Lock
                  size={48}
                  className="text-blue-600 opacity-20 flex-shrink-0"
                />
              </div>
            </div>
          </div>
        )}

        {/* Roles Tab */}
        {activeTab === "roles" && (
          <div className="bg-white rounded-lg shadow p-6">
            <RoleManagement currentUser={currentUser} />
          </div>
        )}

        {/* Admin & Users Tab */}
        {activeTab === "admin" && (
          <div>
            <AdminInfo currentUser={currentUser} />
          </div>
        )}

        {/* Permission Matrix Tab */}
        {activeTab === "permissions" && (
          <div>
            <PermissionMatrix currentUser={currentUser} />
          </div>
        )}

        {/* Officer Management Tab */}
        {activeTab === "officers" && (
          <div className="bg-white rounded-lg shadow p-6">
            <OfficerManagement currentUser={currentUser} />
          </div>
        )}

        {/* Audit Logs Tab */}
        {activeTab === "audit" && (
          <div className="bg-white rounded-lg shadow p-6">
            <AuditLogViewer
              currentUser={currentUser}
              initialSelection={initialSelectedAuditLog}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// Helper component for checkmarks
const CheckIcon = () => (
  <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0 mt-0.5">
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  </div>
);

export default AccessControlDashboard;
