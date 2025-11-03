// Permission Matrix Component
// Display and manage role permissions in a matrix format with toggles

import React, { useState, useEffect, useMemo } from "react";
import { db } from "../services/firebase";
import { ref, get, set } from "firebase/database";
import { Save, RotateCcw } from "lucide-react";
import { createAuditLogger } from "../utils/AuditLogger";
import { NAVIGATION_MODULES } from "../utils/navigationConfig";

const MODULES = NAVIGATION_MODULES.filter(
  (module) => module.id && module.id !== "access_control"
).map(({ id, label }) => ({ id, label }));

const PermissionMatrix = ({ currentUser }) => {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [changes, setChanges] = useState({});
  const [hasChanges, setHasChanges] = useState(false);

  const actorId = currentUser?.uid || currentUser?.id || "unknown";
  const actorLabel =
    currentUser?.actorLabel ||
    currentUser?.displayName ||
    currentUser?.email ||
    currentUser?.role ||
    "Unknown";
  const auditLogger = useMemo(
    () =>
      createAuditLogger(actorId, actorLabel, currentUser?.role || "Unknown"),
    [actorId, actorLabel, currentUser?.role]
  );

  // Fetch roles and permissions
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch roles
        const rolesRef = ref(db, "roles");
        const rolesSnapshot = await get(rolesRef);
        const rolesData = rolesSnapshot.exists()
          ? Object.entries(rolesSnapshot.val()).map(([id, data]) => ({
              id,
              ...data,
            }))
          : [];
        setRoles(rolesData);

        // Initialize permissions structure
        const permissionsStructure = {};
        rolesData.forEach((role) => {
          const displayRoleName = role.roleName || role.name || role.id || "";

          permissionsStructure[role.id] = {
            roleName: displayRoleName,
            modules: {},
          };
          MODULES.forEach((module) => {
            const rawValue = role.modulePermissions?.[module.id];
            let viewAllowed = false;

            if (typeof rawValue === "boolean") {
              viewAllowed = rawValue;
            } else if (
              rawValue &&
              typeof rawValue === "object" &&
              Object.prototype.hasOwnProperty.call(rawValue, "view")
            ) {
              viewAllowed = Boolean(rawValue.view);
            } else if (rawValue && typeof rawValue === "object") {
              viewAllowed = Object.values(rawValue).some(Boolean);
            }

            permissionsStructure[role.id].modules[module.id] = viewAllowed;
          });
        });
        setPermissions(permissionsStructure);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching permissions:", error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Handle toggle change
  const handleToggle = (roleId, moduleId) => {
    setPermissions((prev) => {
      const updated = { ...prev };
      const roleEntry = updated[roleId] || { modules: {} };
      const modulesSnapshot = { ...roleEntry.modules };
      modulesSnapshot[moduleId] = !modulesSnapshot[moduleId];
      updated[roleId] = {
        ...roleEntry,
        modules: modulesSnapshot,
      };
      return updated;
    });

    // Track changes
    setChanges((prev) => {
      const key = `${roleId}_${moduleId}`;
      const next = { ...prev, [key]: !prev[key] };
      setHasChanges(Object.values(next).some(Boolean));
      return next;
    });
  };

  // Save changes to Firebase
  const handleSaveChanges = async () => {
    try {
      for (const roleId in permissions) {
        const rolePermissions = permissions[roleId];
        const normalizedModules = {};

        MODULES.forEach((module) => {
          normalizedModules[module.id] = {
            view: Boolean(rolePermissions.modules[module.id]),
          };
        });

        const updatedRole = {
          modulePermissions: normalizedModules,
          updatedBy: actorLabel,
          updatedById: actorId,
          updatedAt: new Date().toISOString(),
        };

        const roleRef = ref(db, `roles/${roleId}`);
        const currentRole = await get(roleRef);
        if (currentRole.exists()) {
          const roleData = currentRole.val();
          await set(roleRef, {
            ...roleData,
            ...updatedRole,
          });
        }
      }

      const changedEntries = Object.entries(changes).filter(
        ([, value]) => value
      );
      if (auditLogger?.logAction && changedEntries.length > 0) {
        const changedSummary = changedEntries.map(([key]) => {
          const [roleKey, moduleKey] = key.split("_");
          return { roleId: roleKey, moduleId: moduleKey };
        });
        await auditLogger.logAction("UPDATE", "Access Control", {
          changeType: "Permission Matrix",
          updates: changedSummary,
          actorId,
        });
      }

      setChanges({});
      setHasChanges(false);
      alert("✅ Permissions saved successfully!");
    } catch (error) {
      console.error("Error saving permissions:", error);
      alert("❌ Error saving permissions");
    }
  };

  // Reset changes
  const handleReset = () => {
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin mb-4">
            <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full mx-auto"></div>
          </div>
          <p className="text-gray-600">Loading permissions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Permission Matrix
        </h2>
        <p className="text-gray-600">
          Toggle which dashboard modules appear for every role. A green switch
          means the role can see the module; gray hides it.
        </p>
      </div>

      {/* Matrix Container */}
      <div className="overflow-x-auto border border-gray-300 rounded-lg">
        <table className="w-full border-collapse">
          {/* Header */}
          <thead>
            <tr className="bg-gradient-to-r from-purple-600 to-purple-700">
              <th className="border border-gray-300 px-4 py-3 text-left text-white font-bold min-w-[200px]">
                Module
              </th>
              {roles.map((role) => {
                const displayRoleName =
                  role.roleName || role.name || role.id || "";
                const initial = displayRoleName.charAt(0).toUpperCase() || "?";

                return (
                  <th
                    key={role.id}
                    className="border border-gray-300 px-4 py-3 text-center text-white font-bold min-w-[150px]"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
                        {initial}
                      </div>
                      {displayRoleName}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {MODULES.map((module, moduleIndex) => (
              <tr
                key={module.id}
                className={moduleIndex % 2 === 0 ? "bg-white" : "bg-gray-50"}
              >
                {/* Module Name */}
                <td className="border border-gray-300 px-4 py-3 font-semibold text-gray-900 sticky left-0 bg-inherit">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-600"></div>
                    {module.label}
                  </div>
                </td>

                {/* Permission Toggles */}
                {roles.map((role) => (
                  <td
                    key={`${role.id}-${module.id}`}
                    className="border border-gray-300 px-2 py-3"
                  >
                    <div className="flex justify-center">
                      <label
                        className="relative inline-flex items-center cursor-pointer group"
                        title={`${module.label} access`}
                      >
                        <input
                          type="checkbox"
                          checked={
                            permissions[role.id]?.modules[module.id] || false
                          }
                          onChange={() => handleToggle(role.id, module.id)}
                          className="sr-only"
                        />
                        <div
                          className={`w-12 h-6 rounded-full border-2 transition-all flex items-center px-1 ${
                            permissions[role.id]?.modules[module.id]
                              ? "bg-green-500 border-green-600"
                              : "bg-gray-300 border-gray-400"
                          } ${
                            changes[`${role.id}_${module.id}`]
                              ? "ring-2 ring-yellow-400"
                              : ""
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                              permissions[role.id]?.modules[module.id]
                                ? "translate-x-6"
                                : "translate-x-0"
                            }`}
                          ></div>
                        </div>
                        <span className="absolute bottom-full mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          Access
                        </span>
                      </label>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900 font-medium mb-3">Legend:</p>
        <div className="flex flex-wrap gap-6 text-sm text-blue-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-6 rounded-full bg-green-500 border-2 border-green-600 flex items-center px-1">
              <div className="w-5 h-5 rounded-full bg-white shadow-md translate-x-6"></div>
            </div>
            <span>Module Visible</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-6 rounded-full bg-gray-300 border-2 border-gray-400 flex items-center px-1">
              <div className="w-5 h-5 rounded-full bg-white shadow-md"></div>
            </div>
            <span>Module Hidden</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-6 rounded-full bg-green-500 border-2 border-green-600 ring-2 ring-yellow-400 flex items-center px-1">
              <div className="w-5 h-5 rounded-full bg-white shadow-md translate-x-6"></div>
            </div>
            <span>Recently Changed</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex gap-4 justify-end">
        <button
          onClick={handleReset}
          disabled={!hasChanges}
          className={`px-6 py-2 rounded-lg font-semibold flex items-center gap-2 transition ${
            hasChanges
              ? "bg-gray-200 text-gray-800 hover:bg-gray-300 cursor-pointer"
              : "bg-gray-100 text-gray-500 cursor-not-allowed"
          }`}
        >
          <RotateCcw size={18} />
          Reset
        </button>
        <button
          onClick={handleSaveChanges}
          disabled={!hasChanges}
          className={`px-6 py-2 rounded-lg font-semibold flex items-center gap-2 transition ${
            hasChanges
              ? "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
              : "bg-blue-300 text-white cursor-not-allowed"
          }`}
        >
          <Save size={18} />
          Save Changes
        </button>
      </div>

      {/* Unsaved Changes Warning */}
      {hasChanges && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-300 rounded-lg flex items-start gap-3">
          <div className="text-yellow-600 font-bold text-lg">⚠️</div>
          <div>
            <p className="text-yellow-900 font-semibold">Unsaved Changes</p>
            <p className="text-yellow-800 text-sm">
              You have made changes to permissions. Click "Save Changes" to
              persist them to the database.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PermissionMatrix;
