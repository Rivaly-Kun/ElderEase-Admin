// Audit Log Viewer Component
// Display and filter system audit logs

import React, { useState, useEffect } from "react";
import { db } from "../services/firebase";
import { ref, query, orderByChild, limitToLast, get } from "firebase/database";
import {
  Shield,
  Download,
  Filter,
  Eye,
  Edit2,
  Trash2,
  Plus,
  CheckCircle,
  AlertCircle,
  Lock,
  Unlock,
} from "lucide-react";

const AuditLogViewer = ({ currentUser, initialSelection = null }) => {
  const initialSelectedLogId = initialSelection?.id ?? null;
  const initialSelectionToken = initialSelection?.token ?? null;
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [highlightedLogId, setHighlightedLogId] = useState(null);
  const [consumedSelectionToken, setConsumedSelectionToken] = useState(null);
  const [filters, setFilters] = useState({
    action: "all",
    module: "all",
    userName: "",
    dateFrom: "",
    dateTo: "",
  });

  // Fetch audit logs from Firebase
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const logsRef = ref(db, "auditLogs");
        const snapshot = await get(logsRef);

        if (snapshot.exists()) {
          const logsData = Object.entries(snapshot.val()).map(([id, data]) => ({
            id,
            ...data,
          }));

          // Sort by timestamp descending
          logsData.sort(
            (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
          );

          setLogs(logsData);
          setFilteredLogs(logsData);
        }
      } catch (error) {
        console.error("Error fetching audit logs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, []);

  // Handle initial selection coming from navigation state
  useEffect(() => {
    if (!initialSelectedLogId || !initialSelectionToken) {
      return;
    }

    if (consumedSelectionToken === initialSelectionToken) {
      return;
    }

    const targetLog = logs.find((log) => log.id === initialSelectedLogId);
    if (targetLog) {
      setSelectedLog(targetLog);
      setHighlightedLogId(initialSelectedLogId);
      setConsumedSelectionToken(initialSelectionToken);
    }
  }, [
    initialSelectedLogId,
    initialSelectionToken,
    logs,
    consumedSelectionToken,
  ]);

  // Apply filters
  useEffect(() => {
    let result = logs;

    if (filters.action !== "all") {
      result = result.filter((log) => log.action === filters.action);
    }

    if (filters.module !== "all") {
      result = result.filter((log) => log.module === filters.module);
    }

    if (filters.userName) {
      result = result.filter((log) =>
        log.userName.toLowerCase().includes(filters.userName.toLowerCase())
      );
    }

    if (filters.dateFrom) {
      result = result.filter(
        (log) => new Date(log.timestamp) >= new Date(filters.dateFrom)
      );
    }

    if (filters.dateTo) {
      result = result.filter(
        (log) => new Date(log.timestamp) <= new Date(filters.dateTo)
      );
    }

    setFilteredLogs(result);
  }, [filters, logs]);

  // Get action icon and color
  const getActionIcon = (action) => {
    const iconProps = { size: 16, className: "flex-shrink-0" };

    switch (action) {
      case "CREATE":
        return <Plus {...iconProps} className="text-green-600" />;
      case "UPDATE":
        return <Edit2 {...iconProps} className="text-blue-600" />;
      case "DELETE":
        return <Trash2 {...iconProps} className="text-red-600" />;
      case "APPROVE":
        return <CheckCircle {...iconProps} className="text-green-600" />;
      case "REJECT":
        return <AlertCircle {...iconProps} className="text-red-600" />;
      case "ASSIGN_ROLE":
      case "GRANT_PERMISSION":
        return <Lock {...iconProps} className="text-purple-600" />;
      case "REVOKE_PERMISSION":
        return <Unlock {...iconProps} className="text-purple-600" />;
      case "VIEW":
        return <Eye {...iconProps} className="text-gray-600" />;
      case "EXPORT":
        return <Download {...iconProps} className="text-blue-600" />;
      case "FAILED_ACCESS":
        return <AlertCircle {...iconProps} className="text-red-600" />;
      default:
        return <Shield {...iconProps} className="text-gray-600" />;
    }
  };

  // Get action badge color
  const getActionColor = (action) => {
    switch (action) {
      case "CREATE":
        return "bg-green-100 text-green-800";
      case "UPDATE":
        return "bg-blue-100 text-blue-800";
      case "DELETE":
      case "FAILED_ACCESS":
        return "bg-red-100 text-red-800";
      case "APPROVE":
        return "bg-green-100 text-green-800";
      case "REJECT":
        return "bg-yellow-100 text-yellow-800";
      case "ASSIGN_ROLE":
      case "GRANT_PERMISSION":
      case "REVOKE_PERMISSION":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Export logs to CSV
  const handleExportLogs = () => {
    let csv = "Timestamp,User,Role,Action,Module,Details,IP Address\n";

    filteredLogs.forEach((log) => {
      const timestamp = new Date(log.timestamp).toLocaleString();
      const user = log.userName.replace(/,/g, ";");
      const role = log.userRole.replace(/,/g, ";");
      const details = JSON.stringify(log.details)
        .replace(/,/g, ";")
        .replace(/\n/g, " ");
      const ip = log.details?.ip || "Unknown";

      csv += `"${timestamp}","${user}","${role}","${log.action}","${log.module}","${details}","${ip}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-gray-500">Loading audit logs...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Audit Logs</h2>
          <p className="text-gray-600 text-sm mt-1">
            Complete record of all system actions with encryption tracking
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            <Filter size={20} />
            Filters
          </button>
          <button
            onClick={handleExportLogs}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Download size={20} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white rounded-lg shadow p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {/* Action Filter */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Action
              </label>
              <select
                value={filters.action}
                onChange={(e) =>
                  setFilters({ ...filters, action: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              >
                <option value="all">All Actions</option>
                <option value="CREATE">Create</option>
                <option value="UPDATE">Update</option>
                <option value="DELETE">Delete</option>
                <option value="APPROVE">Approve</option>
                <option value="REJECT">Reject</option>
                <option value="VIEW">View</option>
                <option value="EXPORT">Export</option>
              </select>
            </div>

            {/* Module Filter */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Module
              </label>
              <select
                value={filters.module}
                onChange={(e) =>
                  setFilters({ ...filters, module: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              >
                <option value="all">All Modules</option>
                <option value="Senior Citizens">Senior Citizens</option>
                <option value="Payments">Payments</option>
                <option value="Services">Services</option>
                <option value="Reports">Reports</option>
                <option value="Access Control">Access Control</option>
                <option value="Security">Security</option>
              </select>
            </div>

            {/* User Name Filter */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                User
              </label>
              <input
                type="text"
                value={filters.userName}
                onChange={(e) =>
                  setFilters({ ...filters, userName: e.target.value })
                }
                placeholder="Search user..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
            </div>

            {/* Date From */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                From Date
              </label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters({ ...filters, dateFrom: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                To Date
              </label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) =>
                  setFilters({ ...filters, dateTo: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
            </div>
          </div>

          {/* Clear Filters */}
          <button
            onClick={() =>
              setFilters({
                action: "all",
                module: "all",
                userName: "",
                dateFrom: "",
                dateTo: "",
              })
            }
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* Results Count */}
      <div className="text-sm text-gray-600">
        Showing {filteredLogs.length} of {logs.length} audit logs
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Shield size={48} className="mx-auto mb-4 opacity-30" />
            <p>No audit logs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Module
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    IP Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className={`hover:bg-gray-50 transition cursor-pointer ${
                      highlightedLogId === log.id
                        ? "ring-2 ring-blue-200 bg-blue-50"
                        : ""
                    }`}
                    onClick={() => {
                      setSelectedLog(log);
                      setHighlightedLogId(log.id);
                    }}
                  >
                    <td className="px-6 py-4 text-sm">
                      <div className="text-gray-800 font-medium">
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <p className="font-medium text-gray-800">
                          {log.userName}
                        </p>
                        <p className="text-xs text-gray-500">{log.userRole}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {getActionIcon(log.action)}
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${getActionColor(
                            log.action
                          )}`}
                        >
                          {log.action}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {log.module}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-gray-600">
                      {log.details?.ip || "Unknown"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(log);
                          setHighlightedLogId(log.id);
                        }}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
              <h2 className="text-xl font-bold">Audit Log Details</h2>
              <button
                onClick={() => {
                  setSelectedLog(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">
                    User
                  </p>
                  <p className="text-lg font-medium text-gray-800">
                    {selectedLog.userName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">
                    Role
                  </p>
                  <p className="text-lg font-medium text-gray-800">
                    {selectedLog.userRole}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">
                    Action
                  </p>
                  <p
                    className={`text-lg font-medium ${getActionColor(
                      selectedLog.action
                    )}`}
                  >
                    {selectedLog.action}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">
                    Module
                  </p>
                  <p className="text-lg font-medium text-gray-800">
                    {selectedLog.module}
                  </p>
                </div>
              </div>

              {/* Timestamp & IP */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">
                    Timestamp
                  </p>
                  <p className="text-sm text-gray-800">
                    {new Date(selectedLog.timestamp).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">
                    IP Address
                  </p>
                  <p className="text-sm font-mono text-gray-800">
                    {selectedLog.details?.ip || "Unknown"}
                  </p>
                </div>
                {selectedLog.details?.encrypted && (
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                    <Lock size={16} className="text-green-600" />
                    <p className="text-sm text-green-700 font-medium">
                      SSL/TLS Encrypted
                    </p>
                  </div>
                )}
              </div>

              {/* Details */}
              {selectedLog.details &&
                Object.keys(selectedLog.details).length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 uppercase font-semibold mb-3">
                      Details
                    </p>
                    <pre className="text-xs text-gray-700 overflow-x-auto bg-white p-3 rounded border border-gray-200">
                      {JSON.stringify(selectedLog.details, null, 2)}
                    </pre>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogViewer;
