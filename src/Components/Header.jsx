import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Bell,
  Search,
  X,
  ZoomIn,
  Minus,
  Plus,
  Check,
  QrCode,
  Eye,
  Edit2,
  Trash2,
  CheckCircle,
  AlertCircle,
  Lock,
  Unlock,
  Download,
  Shield,
  Upload,
  Database,
} from "lucide-react";
import { ref as dbRef, onValue, update } from "firebase/database";
import { db } from "../services/firebase";
import { useMemberSearch } from "../Context/MemberSearchContext";
import { useAuth } from "../Context/AuthContext";
import EventAttendanceModal from "./EventAttendanceModal";
import DatabaseBackup from "./DatabaseBackup";

const ZOOM_STORAGE_KEY = "elderEaseZoomPercent";
const DEFAULT_ZOOM = 100;
const MIN_ZOOM = 90;
const MAX_ZOOM = 140;

const ZOOM_PRESETS = [
  { label: "Compact", value: 90, description: "Fit more data on screen" },
  { label: "Standard", value: 100, description: "Recommended default" },
  { label: "Comfort", value: 110, description: "Gentle size increase" },
  { label: "Large", value: 125, description: "Great for presentations" },
  { label: "Accessible", value: 140, description: "Maximum readability" },
];

const clampZoom = (value) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value)));

const applyZoom = (zoomPercent) => {
  if (typeof document === "undefined") return;
  const clamped = clampZoom(zoomPercent);
  document.documentElement.style.fontSize = `${clamped}%`;
  document.documentElement.dataset.zoomPercent = String(clamped);
};

function Header({ userInfo, notificationCount = 0 }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [allMembers, setAllMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showZoomModal, setShowZoomModal] = useState(false);
  const [appliedZoom, setAppliedZoom] = useState(DEFAULT_ZOOM);
  const [pendingZoom, setPendingZoom] = useState(DEFAULT_ZOOM);
  const [showEventAttendanceModal, setShowEventAttendanceModal] =
    useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [seenNotifications, setSeenNotifications] = useState({});
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [showBackupModal, setShowBackupModal] = useState(false);

  const { user: authUser } = useAuth();
  const memberSearch = useMemberSearch();
  const navigate = useNavigate();

  const resolvedUser = useMemo(() => {
    if (
      userInfo &&
      typeof userInfo === "object" &&
      Object.keys(userInfo).length
    ) {
      return userInfo;
    }
    return authUser;
  }, [authUser, userInfo]);

  const readStatusUserId = useMemo(() => {
    if (authUser?.uid) return authUser.uid;
    if (authUser?.id) return authUser.id;
    if (resolvedUser?.uid) return resolvedUser.uid;
    if (resolvedUser?.id) return resolvedUser.id;
    return null;
  }, [authUser, resolvedUser]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = parseInt(window.localStorage.getItem(ZOOM_STORAGE_KEY), 10);
    if (!Number.isNaN(stored)) {
      const valid = clampZoom(stored);
      setAppliedZoom(valid);
      setPendingZoom(valid);
      applyZoom(valid);
    } else {
      applyZoom(DEFAULT_ZOOM);
    }
  }, []);

  useEffect(() => {
    console.log("🔔 Header mounted");
    console.log("📋 Member search context available:", {
      hasContext: Boolean(memberSearch),
      hasOpenHandler: typeof memberSearch?.openMemberProfile === "function",
    });
  }, [memberSearch]);

  useEffect(() => {
    setLoadingMembers(true);
    const membersRef = dbRef(db, "members");
    const unsubscribe = onValue(
      membersRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const list = Object.entries(snapshot.val()).map(([key, value]) => ({
            firebaseKey: key,
            ...value,
          }));
          setAllMembers(list);
        } else {
          setAllMembers([]);
        }
        setLoadingMembers(false);
      },
      (error) => {
        console.error("Error fetching members:", error);
        setLoadingMembers(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Fetch current user's role from database
  useEffect(() => {
    // For super-admin, set role directly
    if (authUser?.id === "super-admin" || authUser?.uid === "super-admin") {
      setCurrentUserRole("Super Admin");
      return;
    }

    if (!authUser?.uid) return;

    const userRef = dbRef(db, `users/${authUser.uid}`);
    const unsubscribe = onValue(
      userRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.val();
          setCurrentUserRole(userData.userRole || userData.role);
        }
      },
      (error) => {
        console.error("Error fetching user role:", error);
      }
    );

    return () => unsubscribe();
  }, [authUser?.uid, authUser?.id]);

  // Fetch audit logs only if user has permission (check from database)
  useEffect(() => {
    if (!currentUserRole) return;

    const auditRef = dbRef(db, "auditLogs");
    const unsubscribe = onValue(
      auditRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const logs = Object.entries(data)
            .map(([id, value]) => ({
              id,
              ...value,
            }))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, 10);
          setAuditLogs(logs);
        } else {
          setAuditLogs([]);
        }
      },
      (error) => {
        console.error("Error fetching audit logs:", error);
      }
    );

    return () => unsubscribe();
  }, [currentUserRole]);

  useEffect(() => {
    if (!readStatusUserId) {
      setSeenNotifications({});
      return;
    }

    const readRef = dbRef(db, `readnotifs/${readStatusUserId}`);
    const unsubscribe = onValue(
      readRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          if (data && typeof data === "object") {
            setSeenNotifications(data);
          } else {
            setSeenNotifications({});
          }
        } else {
          setSeenNotifications({});
        }
      },
      (error) => {
        console.error("Error fetching read notifications:", error);
      }
    );

    return () => unsubscribe();
  }, [readStatusUserId]);

  const unreadCount = auditLogs.filter(
    (log) => !seenNotifications[log.id]
  ).length;

  const persistReadEntries = useCallback(
    (entries) => {
      if (
        !readStatusUserId ||
        !Array.isArray(entries) ||
        entries.length === 0
      ) {
        return;
      }

      const updates = entries.reduce((acc, entry) => {
        if (!entry?.logId) {
          return acc;
        }
        const readAt = entry.readAt ?? Date.now();
        acc[entry.logId] = readAt;
        return acc;
      }, {});

      if (Object.keys(updates).length === 0) {
        return;
      }

      update(dbRef(db, `readnotifs/${readStatusUserId}`), updates).catch(
        (error) => {
          console.error("Error updating read notifications:", error);
        }
      );
    },
    [readStatusUserId]
  );

  const handleMarkNotificationAsSeen = (logId) => {
    const readAt = Date.now();
    setSeenNotifications((prev) => ({
      ...prev,
      [logId]: readAt,
    }));
    persistReadEntries([{ logId, readAt }]);
  };

  const handleMarkAllAsRead = () => {
    const baseTimestamp = Date.now();
    const entries = auditLogs.map((log, index) => ({
      logId: log.id,
      readAt: baseTimestamp + index,
    }));

    if (entries.length === 0) {
      return;
    }

    setSeenNotifications((prev) => {
      const next = { ...prev };
      entries.forEach(({ logId, readAt }) => {
        next[logId] = readAt;
      });
      return next;
    });

    persistReadEntries(entries);
  };

  const handleNotificationClick = (log) => {
    handleMarkNotificationAsSeen(log.id);
    navigate("/roles?tab=audit", {
      state: {
        selectedAuditLog: {
          id: log.id,
          token: Date.now(),
        },
      },
    });
    setShowNotifications(false);
  };

  const formatTimestampParts = (timestamp) => {
    if (!timestamp) {
      return { primary: "Just now", secondary: "" };
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return { primary: String(timestamp), secondary: "" };
    }

    return {
      primary: date.toLocaleString(),
      secondary: date.toLocaleTimeString(),
    };
  };

  const getActionBadgeClasses = (action) => {
    switch (action) {
      case "CREATE":
        return "bg-green-100 text-green-800";
      case "UPDATE":
        return "bg-blue-100 text-blue-800";
      case "EXPORT":
        return "bg-blue-100 text-blue-800";
      case "DELETE":
      case "FAILED_ACCESS":
        return "bg-red-100 text-red-800";
      case "APPROVE":
        return "bg-green-100 text-green-800";
      case "REJECT":
        return "bg-yellow-100 text-yellow-800";
      case "UPLOAD":
        return "bg-orange-100 text-orange-800";
      case "ASSIGN_ROLE":
      case "GRANT_PERMISSION":
      case "REVOKE_PERMISSION":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const renderActionIcon = (action) => {
    const iconClass = "w-4 h-4";

    switch (action) {
      case "CREATE":
        return <Plus className={`${iconClass} text-green-600`} />;
      case "UPDATE":
        return <Edit2 className={`${iconClass} text-blue-600`} />;
      case "DELETE":
        return <Trash2 className={`${iconClass} text-red-600`} />;
      case "APPROVE":
        return <CheckCircle className={`${iconClass} text-green-600`} />;
      case "REJECT":
        return <AlertCircle className={`${iconClass} text-red-600`} />;
      case "UPLOAD":
        return <Upload className={`${iconClass} text-orange-600`} />;
      case "ASSIGN_ROLE":
      case "GRANT_PERMISSION":
        return <Lock className={`${iconClass} text-purple-600`} />;
      case "REVOKE_PERMISSION":
        return <Unlock className={`${iconClass} text-purple-600`} />;
      case "VIEW":
        return <Eye className={`${iconClass} text-gray-600`} />;
      case "EXPORT":
        return <Download className={`${iconClass} text-blue-600`} />;
      case "FAILED_ACCESS":
        return <AlertCircle className={`${iconClass} text-red-600`} />;
      default:
        return <Shield className={`${iconClass} text-gray-600`} />;
    }
  };

  const handleSearchChange = (event) => {
    const nextQuery = event.target.value;
    setSearchQuery(nextQuery);

    if (!nextQuery.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const lowered = nextQuery.toLowerCase();
    const results = allMembers
      .filter((member) => {
        const fullName = `${member.firstName || ""} ${
          member.lastName || ""
        }`.toLowerCase();
        const oscaId = (member.oscaID || "").toString().toLowerCase();
        const contact = (member.contactNum || "").toLowerCase();
        return (
          fullName.includes(lowered) ||
          oscaId.includes(lowered) ||
          contact.includes(lowered)
        );
      })
      .slice(0, 8);

    setSearchResults(results);
    setShowDropdown(true);
  };

  const handleMemberClick = (member) => {
    if (memberSearch?.openMemberProfile) {
      try {
        memberSearch.openMemberProfile(member);
      } catch (error) {
        console.error("Failed to open member profile:", error);
      }
    }
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
  };

  const openZoomModal = () => {
    setPendingZoom(appliedZoom);
    setShowZoomModal(true);
  };

  const handlePresetSelect = (value) => {
    setPendingZoom(clampZoom(value));
  };

  const handleSliderChange = (event) => {
    const next = Number(event.target.value);
    if (!Number.isNaN(next)) {
      setPendingZoom(clampZoom(next));
    }
  };

  const handleApplyZoom = () => {
    const nextZoom = clampZoom(pendingZoom);
    setAppliedZoom(nextZoom);
    applyZoom(nextZoom);

    if (typeof window !== "undefined") {
      if (nextZoom === DEFAULT_ZOOM) {
        window.localStorage.removeItem(ZOOM_STORAGE_KEY);
      } else {
        window.localStorage.setItem(ZOOM_STORAGE_KEY, String(nextZoom));
      }
    }

    setShowZoomModal(false);
  };

  const handleCancelZoom = () => {
    setPendingZoom(appliedZoom);
    setShowZoomModal(false);
  };

  const handleResetZoom = () => {
    setPendingZoom(DEFAULT_ZOOM);
  };

  const zoomDelta = pendingZoom - DEFAULT_ZOOM;
  const zoomSummary =
    zoomDelta === 0
      ? "Default scale"
      : `${zoomDelta > 0 ? "+" : ""}${zoomDelta}% larger`;

  const displayName =
    resolvedUser?.displayName ||
    resolvedUser?.name ||
    resolvedUser?.email ||
    "Guest User";
  const displayRole = resolvedUser?.role || "Guest";
  const displayEmail = resolvedUser?.email || resolvedUser?.username || "";

  const renderAvatar = () => {
    if (resolvedUser?.avatar) {
      if (typeof resolvedUser.avatar === "string") {
        const avatarValue = resolvedUser.avatar;
        const isUrl =
          avatarValue.startsWith("http") || avatarValue.startsWith("data:");
        if (isUrl) {
          return (
            <img
              src={avatarValue}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          );
        }
        return (
          <span className="text-base font-semibold text-gray-700">
            {avatarValue}
          </span>
        );
      }
      return resolvedUser.avatar;
    }

    return (
      <span className="text-sm font-semibold text-gray-700">
        {displayName.charAt(0).toUpperCase()}
      </span>
    );
  };

  return (
    <>
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <Users className="hidden sm:block w-6 h-6 text-gray-400" />
            <div className="relative flex-1 max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => searchQuery && setShowDropdown(true)}
                placeholder="Search citizens by name, OSCA ID, or contact…"
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 transition"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}

              {showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                  {loadingMembers && (
                    <div className="px-4 py-3 text-center text-sm text-gray-500">
                      Loading members…
                    </div>
                  )}

                  {!loadingMembers &&
                    searchResults.length === 0 &&
                    searchQuery && (
                      <div className="px-4 py-3 text-center text-sm text-gray-500">
                        No members found
                      </div>
                    )}

                  {!loadingMembers && searchResults.length > 0 && (
                    <div>
                      {searchResults.map((member) => (
                        <button
                          key={member.firebaseKey}
                          onClick={() => handleMemberClick(member)}
                          className="w-full px-4 py-3 text-left hover:bg-purple-50 transition border-b border-gray-100 last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-semibold text-sm">
                              {(member.firstName || "?")
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-gray-900 text-sm truncate">
                                {member.firstName} {member.lastName}
                              </div>
                              <div className="text-xs text-gray-500 flex flex-wrap gap-2">
                                <span>ID: {member.oscaID || "—"}</span>
                                {member.contactNum && (
                                  <span>• {member.contactNum}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex-shrink-0">
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-700">
                                View
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setShowEventAttendanceModal(true)}
              className="inline-flex items-center gap-2 px-2.5 sm:px-3 py-2 border border-blue-100 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition"
              aria-label="Open event check-in"
            >
              <QrCode className="w-5 h-5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline text-sm font-medium">
                Event Check-In
              </span>
            </button>

            {currentUserRole === "Super Admin" && (
              <button
                onClick={() => setShowBackupModal(true)}
                className="inline-flex items-center gap-2 px-2.5 sm:px-3 py-2 border border-amber-100 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition"
                aria-label="Database backup"
                title="Super Admin: Database Backup"
              >
                <Database className="w-5 h-5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline text-sm font-medium">
                  Backup DB
                </span>
              </button>
            )}

            <button
              onClick={openZoomModal}
              className="inline-flex items-center gap-2 px-2.5 sm:px-3 py-2 border border-purple-100 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition"
              aria-label="Open zoom settings"
            >
              <ZoomIn className="w-5 h-5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline text-sm font-medium">
                Zoom Mode
              </span>
            </button>

            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-lg hover:bg-gray-100 transition"
              aria-label="View audit logs"
            >
              <Bell className="w-6 h-6 text-gray-600" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 overflow-hidden">
                {renderAvatar()}
              </div>
              <div className="hidden sm:flex flex-col">
                <span className="font-medium text-gray-800">{displayName}</span>
                <span className="text-xs text-gray-500">
                  {displayRole}
                  {displayEmail ? ` • ${displayEmail}` : ""}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Audit Logs Notification Dropdown */}
      {showNotifications && currentUserRole && (
        <div className="fixed top-20 right-4 bg-white rounded-xl shadow-xl border border-gray-200 w-[720px] max-w-[calc(100vw-2rem)] overflow-hidden z-50">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex items-center justify-between">
            <h3 className="text-white font-semibold">Audit Logs</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-blue-100 hover:text-white transition"
                >
                  Mark all as read
                </button>
              )}
              <button
                onClick={() => setShowNotifications(false)}
                className="text-white hover:bg-blue-600 p-1 rounded transition"
              >
                ✕
              </button>
            </div>
          </div>

          {auditLogs.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              No audit logs yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                        Timestamp
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                        User
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                        Action
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                        Module
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {auditLogs.map((log) => {
                      const isUnread = !seenNotifications[log.id];
                      const timestampParts = formatTimestampParts(
                        log.timestamp
                      );

                      return (
                        <tr
                          key={log.id}
                          className={`hover:bg-gray-50 transition cursor-pointer ${
                            isUnread ? "bg-blue-50" : ""
                          }`}
                          onClick={() => handleNotificationClick(log)}
                        >
                          <td className="px-4 py-3 align-top">
                            <div className="text-gray-800 font-medium">
                              {timestampParts.primary}
                            </div>
                            {timestampParts.secondary && (
                              <div className="text-xs text-gray-500">
                                {timestampParts.secondary}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="text-gray-800 font-medium">
                              {log.userName || "System"}
                            </div>
                            <div className="text-xs text-gray-500">
                              {log.userRole || log.userId || "—"}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-center gap-2">
                              {renderActionIcon(log.action)}
                              <span
                                className={`px-2 py-1 rounded text-xs font-semibold ${getActionBadgeClasses(
                                  log.action
                                )}`}
                              >
                                {log.action || "—"}
                              </span>
                              {isUnread && (
                                <span className="w-2 h-2 bg-blue-600 rounded-full" />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top text-gray-600">
                            {log.module || "—"}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                handleNotificationClick(log);
                              }}
                              className="text-blue-600 hover:text-blue-700 font-medium"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {showZoomModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Zoom & display options
                </h2>
                <p className="text-sm text-gray-500">
                  Adjust the interface scale for better readability.
                </p>
              </div>
              <button
                onClick={handleCancelZoom}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition"
                aria-label="Close zoom modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {ZOOM_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => handlePresetSelect(preset.value)}
                    className={`border rounded-xl px-4 py-3 text-left transition shadow-sm hover:shadow ${
                      pendingZoom === preset.value
                        ? "border-purple-500 bg-purple-50"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {preset.label}
                        </p>
                        <p className="text-xs text-gray-500">
                          {preset.description}
                        </p>
                      </div>
                      {pendingZoom === preset.value && (
                        <Check className="w-4 h-4 text-purple-600" />
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      {preset.value}% scale
                    </p>
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">
                    Custom scale
                  </span>
                  <span className="text-gray-500">{pendingZoom}%</span>
                </div>
                <div className="flex items-center gap-4">
                  <Minus className="w-4 h-4 text-gray-400" />
                  <input
                    type="range"
                    min={MIN_ZOOM}
                    max={MAX_ZOOM}
                    value={pendingZoom}
                    onChange={handleSliderChange}
                    className="flex-1 accent-purple-600"
                  />
                  <Plus className="w-4 h-4 text-gray-400" />
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <p className="text-sm font-semibold text-gray-800 mb-2">
                  Preview
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">
                  ElderEase adapts to your chosen zoom level. Use the presets
                  for quick adjustments or fine-tune with the slider.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm text-gray-600">{zoomSummary}</p>
                {appliedZoom !== DEFAULT_ZOOM && (
                  <button
                    onClick={handleResetZoom}
                    className="text-xs text-purple-600 hover:text-purple-700 font-medium mt-1"
                  >
                    Reset to default
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCancelZoom}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyZoom}
                  disabled={pendingZoom === appliedZoom}
                  className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition ${
                    pendingZoom === appliedZoom
                      ? "bg-purple-300 cursor-not-allowed"
                      : "bg-purple-600 hover:bg-purple-700"
                  }`}
                >
                  Apply changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <EventAttendanceModal
        open={showEventAttendanceModal}
        onClose={() => setShowEventAttendanceModal(false)}
        currentUser={resolvedUser}
      />

      <DatabaseBackup
        isOpen={showBackupModal}
        onClose={() => setShowBackupModal(false)}
      />
    </>
  );
}

export default Header;
