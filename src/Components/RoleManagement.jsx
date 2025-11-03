// Role Management Component
// Handles creation, editing, deletion, and permission assignment for roles

import React, { useState, useEffect, useMemo } from "react";
import { db } from "../services/firebase";
import { ref, get, set, remove } from "firebase/database";
import {
  Plus,
  Edit2,
  Trash2,
  X,
  AlertCircle,
  CheckCircle,
  Shield,
} from "lucide-react";
import { createAuditLogger } from "../utils/AuditLogger";
import { NAVIGATION_MODULES } from "../utils/navigationConfig";

// Get modules for permission structure (exclude access_control)
const MODULES = NAVIGATION_MODULES.filter(
  (module) => module.id && module.id !== "access_control"
).map(({ id, label }) => ({ id, label }));

// Helper function to normalize role data from Firebase
const normalizeRole = (roleId, role = {}) => {
  // Guard against null/undefined role
  if (!role || typeof role !== "object") {
    return {
      id: roleId,
      name: roleId || "Unknown",
      description: "",
      permissions: [],
    };
  }

  // Extract permissions from either format
  let permissions = [];

  if (Array.isArray(role.permissions)) {
    // Simple permissions array
    permissions = role.permissions;
  } else if (
    role.modulePermissions &&
    typeof role.modulePermissions === "object"
  ) {
    // modulePermissions structure - flatten it
    Object.keys(role.modulePermissions).forEach((module) => {
      const modulePerms = role.modulePermissions[module];
      if (modulePerms && typeof modulePerms === "object") {
        Object.keys(modulePerms).forEach((permType) => {
          if (modulePerms[permType] === true) {
            permissions.push(`${module}:${permType}`);
          }
        });
      }
    });
  }

  // Handle roleName vs name field
  const roleName = role.roleName || role.name || roleId || "Unknown";

  return {
    id: roleId,
    ...role,
    name: roleName,
    description: role.description || "",
    permissions,
  };
};

const RoleManagement = ({ currentUser }) => {
  const [roles, setRoles] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    permissions: [],
    modulePermissions: {},
  });

  // Initialize module permissions structure
  const initializeModulePermissions = () => {
    const modules = {};
    MODULES.forEach((module) => {
      modules[module.id] = { view: false };
    });
    return modules;
  };

  const actorId = currentUser?.uid || currentUser?.id || "system";
  const actorLabel =
    currentUser?.actorLabel ||
    currentUser?.displayName ||
    currentUser?.email ||
    currentUser?.role ||
    "System";
  const auditLogger = useMemo(
    () =>
      createAuditLogger(actorId, actorLabel, currentUser?.role || "Unknown"),
    [actorId, actorLabel, currentUser?.role]
  );

  // Load roles from Firebase
  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      let rolesData = null;

      // Try root-level roles first (where your existing roles are)
      let snapshot = await get(ref(db, "roles"));
      if (snapshot.exists()) {
        rolesData = snapshot.val();
      } else {
        // Fallback to rbac/roles if no root roles found
        snapshot = await get(ref(db, "rbac/roles"));
        if (snapshot.exists()) {
          rolesData = snapshot.val();
        }
      }

      if (rolesData) {
        const rolesArray = Object.keys(rolesData).map((key) =>
          normalizeRole(key, rolesData[key])
        );
        setRoles(rolesArray);
      } else {
        setRoles([]);
      }
      setError(null);
    } catch (err) {
      setError(`Failed to load roles: ${err.message}`);
      console.error("Error loading roles:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRole = () => {
    setEditingRole(null);
    setFormData({
      name: "",
      description: "",
      permissions: [],
      modulePermissions: initializeModulePermissions(),
    });
    setShowModal(true);
  };

  const handleEditRole = (role) => {
    setEditingRole(role);
    const modules = initializeModulePermissions();

    // Load existing module permissions if available
    if (role.modulePermissions) {
      Object.assign(modules, role.modulePermissions);
    }

    setFormData({
      name: role.name || "",
      description: role.description || "",
      permissions: role.permissions || [],
      modulePermissions: modules,
    });
    setShowModal(true);
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm("Are you sure you want to delete this role?")) {
      return;
    }

    try {
      setLoading(true);
      const targetRole = roles.find((role) => role.id === roleId) || null;

      // Try to delete from root roles first, then rbac/roles
      let roleRef = ref(db, `roles/${roleId}`);
      try {
        await remove(roleRef);
      } catch (err) {
        // Fallback to rbac/roles
        roleRef = ref(db, `rbac/roles/${roleId}`);
        await remove(roleRef);
      }

      setRoles(roles.filter((r) => r.id !== roleId));
      setSuccess("Role deleted successfully");
      if (auditLogger?.logAction) {
        await auditLogger.logAction("DELETE", "Access Control", {
          recordId: roleId,
          recordName: targetRole?.name,
        });
      }
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(`Failed to delete role: ${err.message}`);
      console.error("Error deleting role:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRole = async () => {
    if (!formData.name.trim()) {
      setError("Role name is required");
      return;
    }

    try {
      setLoading(true);
      const roleId = editingRole ? editingRole.id : Date.now().toString();

      const roleData = {
        name: formData.name,
        roleName: formData.name,
        description: formData.description,
        modulePermissions: formData.modulePermissions,
        createdAt: editingRole?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: actorLabel,
        updatedById: actorId,
      };

      if (!editingRole) {
        roleData.createdBy = actorLabel;
        roleData.createdById = actorId;
      }

      // Try to save to root roles first, then rbac/roles
      let roleRef = ref(db, `roles/${roleId}`);
      try {
        await set(roleRef, roleData);
      } catch (err) {
        // Fallback to rbac/roles
        roleRef = ref(db, `rbac/roles/${roleId}`);
        await set(roleRef, roleData);
      }

      if (auditLogger?.logAction) {
        await auditLogger.logAction(
          editingRole ? "UPDATE" : "CREATE",
          "Access Control",
          {
            recordId: roleId,
            recordName: roleData.name,
            modules: Object.keys(formData.modulePermissions).filter(
              (m) => formData.modulePermissions[m]?.view
            ).length,
          }
        );
      }

      // Update local state
      if (editingRole) {
        setRoles(
          roles.map((r) => (r.id === roleId ? { id: roleId, ...roleData } : r))
        );
      } else {
        setRoles([...roles, { id: roleId, ...roleData }]);
      }

      setSuccess(
        editingRole ? "Role updated successfully" : "Role created successfully"
      );
      setShowModal(false);
      setFormData({
        name: "",
        description: "",
        permissions: [],
        modulePermissions: initializeModulePermissions(),
      });
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(`Failed to save role: ${err.message}`);
      console.error("Error saving role:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionToggle = (permission) => {
    setFormData({
      ...formData,
      permissions: formData.permissions.includes(permission)
        ? formData.permissions.filter((p) => p !== permission)
        : [...formData.permissions, permission],
    });
  };

  const handleModuleToggle = (moduleId) => {
    setFormData({
      ...formData,
      modulePermissions: {
        ...formData.modulePermissions,
        [moduleId]: {
          view: !formData.modulePermissions[moduleId]?.view,
        },
      },
    });
  };

  const filteredRoles = roles.filter((role) => {
    // Guard against undefined or invalid role
    if (!role || typeof role !== "object") return false;

    const roleName = role.name || "";
    const roleDescription = role.description || "";

    const matchesSearch =
      roleName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (roleDescription &&
        roleDescription.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="text-blue-600" size={28} />
            Role Management
          </h2>
          <p className="text-gray-600 text-sm mt-1">
            Create and manage roles with specific permissions
          </p>
        </div>
        <button
          onClick={handleAddRole}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
        >
          <Plus size={20} />
          Add Role
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="text-red-600" size={20} />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="text-green-600" size={20} />
          <p className="text-green-700">{success}</p>
        </div>
      )}

      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search roles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Roles Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading && filteredRoles.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Loading roles...</div>
        ) : filteredRoles.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No roles found. Create your first role to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Role Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Permissions
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRoles.map((role, index) => (
                  <tr
                    key={role.id}
                    className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">
                      {role.name}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {role.description || "-"}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {Object.keys(role.modulePermissions || {}).filter(
                        (m) => role.modulePermissions[m]?.view
                      ).length ||
                        role.permissions?.length ||
                        0}{" "}
                      permissions
                    </td>
                    <td className="px-6 py-3 text-sm flex gap-2">
                      <button
                        onClick={() => handleEditRole(role)}
                        className="text-blue-600 hover:text-blue-800 transition"
                        title="Edit role"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteRole(role.id)}
                        className="text-red-600 hover:text-red-800 transition"
                        title="Delete role"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-lg">
            <div className="sticky top-0 bg-white border-b p-6 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingRole ? "Edit Role" : "Create New Role"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Role Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Senior Officer"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief description of the role"
                  rows={2}
                />
              </div>

              {/* Permissions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Module Access
                </label>
                <div className="space-y-3 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-4 bg-gray-50">
                  {MODULES.map((module) => (
                    <div
                      key={module.id}
                      className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {module.label}
                        </p>
                        <p className="text-xs text-gray-500">
                          Allow access to this module
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={
                            formData.modulePermissions[module.id]?.view || false
                          }
                          onChange={() => handleModuleToggle(module.id)}
                          className="sr-only"
                        />
                        <div
                          className={`w-12 h-6 rounded-full border-2 transition-all flex items-center px-1 ${
                            formData.modulePermissions[module.id]?.view
                              ? "bg-green-500 border-green-600"
                              : "bg-gray-300 border-gray-400"
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                              formData.modulePermissions[module.id]?.view
                                ? "translate-x-6"
                                : "translate-x-0"
                            }`}
                          ></div>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t p-6 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRole}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:bg-blue-400"
              >
                {loading ? "Saving..." : "Save Role"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleManagement;
