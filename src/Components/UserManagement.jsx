// User Management Component
// Manage user accounts and assign roles

import React, { useState, useEffect } from "react";
import { db } from "../services/firebase";
import { ref, get, set, remove } from "firebase/database";
import { Plus, Edit2, Trash2, Check, X, Shield, Mail } from "lucide-react";
import { ROLES } from "../utils/rbacConfig";
import { createAuditLogger } from "../utils/AuditLogger";

const UserManagement = ({ currentUser }) => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    email: "",
    displayName: "",
    role: ROLES.VIEWER,
    status: "active",
    department: "",
  });

  const actorId = currentUser?.uid || currentUser?.id || "unknown";
  const actorLabel =
    currentUser?.actorLabel ||
    currentUser?.displayName ||
    currentUser?.email ||
    currentUser?.role ||
    "Unknown";

  const auditLogger = createAuditLogger(actorId, actorLabel, currentUser?.role);

  const sanitizeStatus = (value) =>
    String(value ?? "active").toLowerCase() === "active"
      ? "active"
      : "suspended";

  // Fetch users and roles from Firebase
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch users
        const usersRef = ref(db, "users");
        const usersSnapshot = await get(usersRef);
        if (usersSnapshot.exists()) {
          const usersData = Object.entries(usersSnapshot.val()).map(
            ([id, data]) => ({
              id,
              ...data,
              status: sanitizeStatus(data?.status),
            })
          );
          setUsers(usersData);
        }

        // Fetch roles
        const rolesRef = ref(db, "roles");
        const rolesSnapshot = await get(rolesRef);
        if (rolesSnapshot.exists()) {
          const rolesData = Object.entries(rolesSnapshot.val()).map(
            ([id, data]) => ({
              id,
              ...data,
            })
          );
          setRoles(rolesData);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Handle create/update user
  const handleSaveUser = async () => {
    if (!formData.email.trim() || !formData.displayName.trim()) {
      alert("Email and name are required");
      return;
    }

    try {
      const userId = editingUser?.id || Date.now().toString();
      const userRef = ref(db, `users/${userId}`);

      const userData = {
        email: formData.email.toLowerCase(),
        displayName: formData.displayName,
        role: formData.role,
        status: sanitizeStatus(formData.status),
        department: formData.department,
        updatedAt: new Date().toISOString(),
        updatedBy: actorLabel,
        updatedById: actorId,
      };

      if (!editingUser) {
        userData.createdAt = new Date().toISOString();
        userData.createdBy = actorLabel;
        userData.createdById = actorId;
      }

      await set(userRef, userData);

      if (editingUser) {
        setUsers(
          users.map((u) =>
            u.id === editingUser.id ? { id: userId, ...userData } : u
          )
        );
        auditLogger.logAction("UPDATE", "Access Control", {
          recordId: userId,
          recordName: formData.displayName,
          targetUserId: userId,
          role: formData.role,
          action: "User updated",
        });
      } else {
        setUsers([...users, { id: userId, ...userData }]);
        auditLogger.logAction("CREATE", "Access Control", {
          recordId: userId,
          recordName: formData.displayName,
          targetUserId: userId,
          role: formData.role,
          action: "New user created",
        });
      }

      // Reset form
      setShowModal(false);
      setEditingUser(null);
      setFormData({
        email: "",
        displayName: "",
        role: ROLES.VIEWER,
        status: "active",
        department: "",
      });
    } catch (error) {
      console.error("Error saving user:", error);
      alert("Error saving user");
    }
  };

  // Handle edit user
  const handleEditUser = (user) => {
    const normalizedStatus = sanitizeStatus(user.status);
    const normalizedUser = { ...user, status: normalizedStatus };
    setEditingUser(normalizedUser);
    setFormData({
      email: normalizedUser.email,
      displayName: normalizedUser.displayName,
      role: normalizedUser.role,
      status: normalizedUser.status,
      department: normalizedUser.department,
    });
    setShowModal(true);
  };

  // Handle delete user
  const handleDeleteUser = async (userId, userName) => {
    if (
      window.confirm(
        `Are you sure you want to delete "${userName}"? This action cannot be undone.`
      )
    ) {
      try {
        const userRef = ref(db, `users/${userId}`);
        await remove(userRef);
        setUsers(users.filter((u) => u.id !== userId));

        auditLogger.logAction("DELETE", "Access Control", {
          recordId: userId,
          recordName: userName,
          action: "User deleted",
        });
      } catch (error) {
        console.error("Error deleting user:", error);
        alert("Error deleting user");
      }
    }
  };

  // Handle role change
  const handleChangeRole = async (userId, userName, newRole) => {
    try {
      const userRef = ref(db, `users/${userId}`);
      const userSnapshot = await get(userRef);
      const userData = userSnapshot.val();

      await set(userRef, {
        ...userData,
        role: newRole,
        updatedAt: new Date().toISOString(),
        updatedBy: actorLabel,
        updatedById: actorId,
      });

      setUsers(
        users.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );

      auditLogger.logAction("ASSIGN_ROLE", "Access Control", {
        targetUserId: userId,
        targetUserName: userName,
        role: newRole,
      });
    } catch (error) {
      console.error("Error changing role:", error);
      alert("Error changing role");
    }
  };

  // Handle status change
  const handleChangeStatus = async (userId, newStatus) => {
    try {
      const userRef = ref(db, `users/${userId}`);
      const userSnapshot = await get(userRef);
      const userData = userSnapshot.val();

      const sanitizedStatus = sanitizeStatus(newStatus);

      await set(userRef, {
        ...userData,
        status: sanitizedStatus,
        updatedAt: new Date().toISOString(),
        updatedBy: actorLabel,
        updatedById: actorId,
      });

      setUsers(
        users.map((u) =>
          u.id === userId ? { ...u, status: sanitizedStatus } : u
        )
      );

      auditLogger.logAction("UPDATE", "Access Control", {
        recordId: userId,
        recordName: userData.displayName,
        changeType: "status",
        newStatus: sanitizedStatus,
      });
    } catch (error) {
      console.error("Error changing status:", error);
      alert("Error changing status");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-gray-500">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">User Management</h2>
          <p className="text-gray-600 text-sm mt-1">
            Manage system users and assign roles with encryption
          </p>
        </div>
        <button
          onClick={() => {
            setEditingUser(null);
            setFormData({
              email: "",
              displayName: "",
              role: ROLES.VIEWER,
              status: "active",
              department: "",
            });
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={20} />
          Add User
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {users.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Shield size={48} className="mx-auto mb-4 opacity-30" />
            <p>No users created yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Department
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-800">
                        {user.displayName}
                      </p>
                      <p className="text-xs text-gray-500">
                        ID: {user.id.substring(0, 8)}...
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Mail size={16} />
                        {user.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={user.role}
                        onChange={(e) =>
                          handleChangeRole(
                            user.id,
                            user.displayName,
                            e.target.value
                          )
                        }
                        className="px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        {roles.map((role) => (
                          <option key={role.id} value={role.roleName}>
                            {role.roleName}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm">
                      {user.department || "-"}
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={user.status}
                        onChange={(e) =>
                          handleChangeStatus(user.id, e.target.value)
                        }
                        className={`px-3 py-1 border rounded text-sm font-medium ${
                          user.status === "active"
                            ? "bg-green-50 border-green-300 text-green-700"
                            : "bg-red-50 border-red-300 text-red-700"
                        }`}
                      >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditUser(user)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded transition"
                          title="Edit user"
                        >
                          <Edit2 size={16} />
                        </button>
                        {user.id !== currentUser?.uid && (
                          <button
                            onClick={() =>
                              handleDeleteUser(user.id, user.displayName)
                            }
                            className="p-2 text-red-600 hover:bg-red-50 rounded transition"
                            title="Delete user"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="border-b border-gray-200 p-6 flex justify-between items-center">
              <h2 className="text-xl font-bold">
                {editingUser ? "Edit User" : "Add New User"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="user@example.com"
                  disabled={!!editingUser}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-100"
                />
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      displayName: e.target.value,
                    })
                  }
                  placeholder="John Doe"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Role
                </label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      role: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.roleName}>
                      {role.roleName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Department
                </label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      department: e.target.value,
                    })
                  }
                  placeholder="e.g., Finance, HR"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={handleSaveUser}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  <Check size={20} />
                  Save
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
                >
                  <X size={20} />
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
