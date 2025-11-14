// Officer Management Component
// Manage officer accounts with roles and permissions - Table format with switches

import React, { useState, useEffect } from "react";
import { db, auth } from "../services/firebase";
import { ref, get, set, remove } from "firebase/database";
import {
  createUserWithEmailAndPassword,
  updateEmail,
  updatePassword as updateAuthPassword,
  sendEmailVerification,
} from "firebase/auth";
import {
  Plus,
  Edit2,
  Trash2,
  Mail,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
} from "lucide-react";
import { createAuditLogger } from "../utils/AuditLogger";

const OfficerManagement = ({ currentUser }) => {
  const [officers, setOfficers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    email: "",
    displayName: "",
    role: "Officer",
    status: "active",
    department: "",
    contactNumber: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const actorId = currentUser?.uid || currentUser?.id || "unknown";
  const actorLabel =
    currentUser?.actorLabel ||
    currentUser?.displayName ||
    currentUser?.email ||
    currentUser?.role ||
    "Unknown";

  const auditLogger = createAuditLogger(actorId, actorLabel, currentUser?.role);

  const checkPasswordStrength = (password) => {
    if (!password) return { strength: 0, label: "No password", color: "gray" };

    let strength = 0;
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      numbers: /\d/.test(password),
      special: /[!@#$%^&*()_+=\-[\]{};':"\\|,.<>/?]/.test(password),
    };

    if (checks.length) strength += 20;
    if (checks.uppercase) strength += 20;
    if (checks.lowercase) strength += 20;
    if (checks.numbers) strength += 20;
    if (checks.special) strength += 20;

    let label = "Weak";
    let color = "bg-red-500";

    if (strength >= 80) {
      label = "Strong";
      color = "bg-green-500";
    } else if (strength >= 60) {
      label = "Good";
      color = "bg-yellow-500";
    } else if (strength >= 40) {
      label = "Fair";
      color = "bg-orange-500";
    }

    return { strength, label, color, checks };
  };

  const sanitizeStatus = (value) =>
    String(value ?? "active").toLowerCase() === "active"
      ? "active"
      : "suspended";

  // Fetch officers and roles from Firebase
  useEffect(() => {
    const fetchData = async () => {
      try {
        const usersRef = ref(db, "users");
        const rolesRefPrimary = ref(db, "roles");
        const rolesRefLegacy = ref(db, "rbac/roles");

        const [usersSnapshot, rolesSnapshotPrimary, rolesSnapshotLegacy] =
          await Promise.all([
            get(usersRef),
            get(rolesRefPrimary),
            get(rolesRefLegacy),
          ]);

        let rolesDataRaw = null;
        if (rolesSnapshotPrimary.exists()) {
          rolesDataRaw = rolesSnapshotPrimary.val();
        } else if (rolesSnapshotLegacy.exists()) {
          rolesDataRaw = rolesSnapshotLegacy.val();
        }

        const normalizedRoles = rolesDataRaw
          ? Object.entries(rolesDataRaw).map(([id, data]) => ({
              id,
              ...data,
            }))
          : [];

        setRoles(normalizedRoles);

        const validRoleIdentifiers = new Set();
        normalizedRoles.forEach((role) => {
          if (role?.id) validRoleIdentifiers.add(String(role.id));
          if (role?.roleName) validRoleIdentifiers.add(String(role.roleName));
          if (role?.name) validRoleIdentifiers.add(String(role.name));
        });

        if (usersSnapshot.exists()) {
          const rawUsers = Object.entries(usersSnapshot.val()).map(
            ([id, data]) => {
              const { password, ...rest } = data || {};
              return {
                id,
                ...rest,
                status: sanitizeStatus(rest.status),
              };
            }
          );

          console.log("🔍 Raw Users from Firebase:", rawUsers);

          // Filter users that have a role (either ID or name)
          // Include all users with a role field that's not empty
          const filteredUsers = rawUsers.filter((userRecord) => {
            const roleValue = String(userRecord.role || "").trim();

            // Only exclude if role is completely empty
            if (!roleValue) {
              return false;
            }

            // Accept any user with a non-empty role
            // This includes role IDs (like "1762140124152") and role names (like "Admin")
            return true;
          });

          console.log("📋 Filtered Officers:", filteredUsers);
          setOfficers(filteredUsers);
        } else {
          console.log("⚠️ No users data found in Firebase");
          setOfficers([]);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Handle create/update officer
  const handleSaveOfficer = async () => {
    const trimmedEmail = formData.email.trim().toLowerCase();
    const trimmedName = formData.displayName.trim();
    const passwordInput = formData.password.trim();
    const confirmPasswordInput = formData.confirmPassword.trim();
    const trimmedContact = formData.contactNumber.trim();
    const isEditing = !!editingOfficer;

    if (!trimmedEmail || !trimmedName) {
      alert("Email and name are required");
      return;
    }

    if (!isEditing && !passwordInput) {
      alert("Password is required for new officers");
      return;
    }

    const wantsPasswordUpdate = passwordInput || confirmPasswordInput;

    if (wantsPasswordUpdate) {
      if (passwordInput.length < 6) {
        alert("Password must be at least 6 characters");
        return;
      }

      if (passwordInput !== confirmPasswordInput) {
        alert("Passwords do not match");
        return;
      }
    }

    try {
      const officerId = editingOfficer?.id || Date.now().toString();
      const officerRef = ref(db, `users/${officerId}`);
      const existingSnapshot = editingOfficer ? await get(officerRef) : null;
      const existingData = existingSnapshot?.exists()
        ? existingSnapshot.val()
        : {};

      let authUid = existingData?.authUid || null;

      // Create or update Firebase Auth user
      if (!isEditing) {
        // Creating new officer - create Auth user
        try {
          const userCredential = await createUserWithEmailAndPassword(
            auth,
            trimmedEmail,
            passwordInput
          );
          authUid = userCredential.user.uid;
          console.log("✅ Firebase Auth user created:", authUid);

          // Send email verification
          try {
            await sendEmailVerification(userCredential.user);
            console.log("✅ Email verification sent to:", trimmedEmail);

            const mfaStatus = trimmedContact
              ? `\n✅ SMS MFA has been automatically enabled for this officer using ${trimmedContact}.`
              : `\n⚠️ No contact number provided - MFA is disabled.`;

            alert(
              `Officer account created successfully!\n\n` +
                `A verification email has been sent to ${trimmedEmail}.${mfaStatus}\n\n` +
                `The officer can now log in and will be prompted for SMS verification.`
            );
          } catch (verificationError) {
            console.error(
              "Error sending verification email:",
              verificationError
            );
            alert(
              `⚠️ Account created but verification email failed to send.\n` +
                `Error: ${verificationError.message}\n\n` +
                `The officer account is still created and can be used.`
            );
          }
        } catch (authError) {
          console.error("Error creating Auth user:", authError);
          alert(`Error creating authentication: ${authError.message}`);
          return;
        }
      } else if (wantsPasswordUpdate && authUid) {
        // Updating existing officer with password change
        // Note: This requires the user to be signed in with their account
        // In a production app, you'd need admin SDK or re-authentication
        console.log(
          "⚠️ Password update for existing auth user - requires admin privileges"
        );
        // For now, we'll just update the password in the database
        // You may need to implement a password reset email flow
      }

      const officerData = {
        ...existingData,
        authUid: authUid,
        email: trimmedEmail,
        displayName: trimmedName,
        role: formData.role,
        status: sanitizeStatus(formData.status),
        department: formData.department.trim(),
        contactNumber: trimmedContact,
        // Automatically enable MFA if contact number is provided
        mfaEnabled: trimmedContact ? true : existingData?.mfaEnabled || false,
        emailVerified: isEditing ? existingData?.emailVerified || false : false,
        updatedAt: new Date().toISOString(),
        updatedBy: actorLabel,
        updatedById: actorId,
      };

      if (!existingData?.createdAt) {
        officerData.createdAt =
          officerData.createdAt || new Date().toISOString();
      }

      if (!existingData?.createdBy) {
        officerData.createdBy = officerData.createdBy || actorLabel;
        officerData.createdById = officerData.createdById || actorId;
      }

      if (wantsPasswordUpdate) {
        officerData.password = passwordInput;
      } else if (existingData?.password) {
        officerData.password = existingData.password;
      } else {
        delete officerData.password;
      }

      console.log("💾 Saving officer data:", {
        email: officerData.email,
        contactNumber: officerData.contactNumber,
        mfaEnabled: officerData.mfaEnabled,
        authUid: officerData.authUid,
      });

      await set(officerRef, officerData);

      const safeOfficerData = { ...officerData };
      delete safeOfficerData.password;

      if (editingOfficer) {
        setOfficers(
          officers.map((u) =>
            u.id === editingOfficer.id
              ? { id: officerId, ...safeOfficerData }
              : u
          )
        );

        auditLogger.logAction("UPDATE", "Access Control", {
          targetUserId: officerId,
          targetUserName: trimmedName,
          changes: { ...safeOfficerData },
        });
      } else {
        setOfficers([...officers, { id: officerId, ...safeOfficerData }]);

        auditLogger.logAction("CREATE", "Access Control", {
          recordId: officerId,
          recordName: trimmedName,
          role: formData.role,
        });
      }

      setShowModal(false);
      setEditingOfficer(null);
      setFormData({
        email: "",
        displayName: "",
        role: "Officer",
        status: "active",
        department: "",
        contactNumber: "",
        password: "",
        confirmPassword: "",
      });
    } catch (error) {
      console.error("Error saving officer:", error);
      alert("Error saving officer");
    }
  };

  // Sync email verification status from Firebase Auth
  const handleSyncEmailVerification = async (officer) => {
    if (!officer.authUid) {
      alert("This officer doesn't have a Firebase Auth account.");
      return;
    }

    try {
      // Note: In a production app, you'd need to use Firebase Admin SDK
      // to get user data by UID. For now, we'll use a workaround.
      // The proper way would be to have a cloud function that checks verification status.

      alert(
        "To enable MFA:\n\n" +
          "1. The officer must verify their email by clicking the link sent to their inbox\n" +
          "2. After verification, the officer should log in once\n" +
          "3. Then MFA will be automatically enabled for their account\n\n" +
          "Email verification status will be synced on their next login."
      );

      console.log(
        "Email verification sync requested for officer:",
        officer.email
      );
    } catch (error) {
      console.error("Error syncing email verification:", error);
      alert("Error checking verification status");
    }
  };

  // Handle delete officer
  const handleDeleteOfficer = async (officerId, officerName) => {
    if (
      window.confirm(
        `Are you sure you want to delete "${officerName}"? This action cannot be undone.`
      )
    ) {
      try {
        const officerRef = ref(db, `users/${officerId}`);
        await remove(officerRef);
        setOfficers(officers.filter((u) => u.id !== officerId));

        auditLogger.logAction("DELETE", "Access Control", {
          recordId: officerId,
          recordName: officerName,
          action: "Officer deleted",
        });
      } catch (error) {
        console.error("Error deleting officer:", error);
        alert("Error deleting officer");
      }
    }
  };

  // Handle role change with switch
  const handleChangeRole = async (officerId, officerName, newRole) => {
    try {
      const officerRef = ref(db, `users/${officerId}`);
      const officerSnapshot = await get(officerRef);
      const officerData = officerSnapshot.val();

      await set(officerRef, {
        ...officerData,
        role: newRole,
        updatedAt: new Date().toISOString(),
        updatedBy: actorLabel,
        updatedById: actorId,
      });

      setOfficers(
        officers.map((u) => (u.id === officerId ? { ...u, role: newRole } : u))
      );

      auditLogger.logAction("ASSIGN_ROLE", "Access Control", {
        targetUserId: officerId,
        targetUserName: officerName,
        role: newRole,
      });
    } catch (error) {
      console.error("Error changing role:", error);
      alert("Error changing role");
    }
  };

  // Handle status change with switch
  const handleChangeStatus = async (officerId, newStatus) => {
    try {
      const officerRef = ref(db, `users/${officerId}`);
      const officerSnapshot = await get(officerRef);
      const officerData = officerSnapshot.val();
      const sanitizedStatus = sanitizeStatus(newStatus);

      await set(officerRef, {
        ...officerData,
        status: sanitizedStatus,
        updatedAt: new Date().toISOString(),
        updatedBy: actorLabel,
        updatedById: actorId,
      });

      setOfficers(
        officers.map((u) =>
          u.id === officerId ? { ...u, status: sanitizedStatus } : u
        )
      );

      auditLogger.logAction("UPDATE", "Access Control", {
        targetUserId: officerId,
        targetUserName: officerData.displayName,
        statusChanged: sanitizedStatus,
      });
    } catch (error) {
      console.error("Error changing status:", error);
      alert("Error changing status");
    }
  };

  const openEditModal = (officer) => {
    const normalizedStatus = sanitizeStatus(officer.status);
    const normalizedOfficer = { ...officer, status: normalizedStatus };
    setEditingOfficer(normalizedOfficer);
    setFormData({
      email: normalizedOfficer.email,
      displayName: normalizedOfficer.displayName,
      role: normalizedOfficer.role,
      status: normalizedOfficer.status,
      department: normalizedOfficer.department || "",
      contactNumber: normalizedOfficer.contactNumber || "",
      password: "",
      confirmPassword: "",
    });
    setShowModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin mb-4">
            <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full mx-auto"></div>
          </div>
          <p className="text-gray-600">Loading officers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Officer Management
          </h2>
          <p className="text-gray-600">
            Manage officers, admins, and their access levels
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              setLoading(true);
              try {
                const usersRef = ref(db, "users");
                const snapshot = await get(usersRef);
                if (snapshot.exists()) {
                  const rawUsers = Object.entries(snapshot.val()).map(
                    ([id, data]) => {
                      const { password, ...rest } = data || {};
                      return {
                        id,
                        ...rest,
                        status: sanitizeStatus(rest.status),
                      };
                    }
                  );

                  const filteredUsers = rawUsers.filter((userRecord) => {
                    const roleValue = String(userRecord.role || "").trim();
                    return roleValue !== "";
                  });

                  console.log("🔄 Refreshed Officers:", filteredUsers);
                  setOfficers(filteredUsers);
                } else {
                  setOfficers([]);
                }
              } catch (error) {
                console.error("Error refreshing data:", error);
              } finally {
                setLoading(false);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-semibold"
          >
            <RefreshCw size={20} />
            Refresh
          </button>
          <button
            onClick={() => {
              setEditingOfficer(null);
              setFormData({
                email: "",
                displayName: "",
                role: "Officer",
                status: "active",
                department: "",
                contactNumber: "",
                password: "",
                confirmPassword: "",
              });
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
          >
            <Plus size={20} />
            Add Officer
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="w-full border border-gray-300 rounded-lg bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] table-auto">
            <thead className="bg-gradient-to-r from-purple-600 to-purple-700">
              <tr>
                <th className="px-4 py-4 text-left text-white font-bold min-w-[120px]">
                  Name
                </th>
                <th className="px-4 py-4 text-left text-white font-bold min-w-[180px]">
                  Email
                </th>
                <th className="px-4 py-4 text-left text-white font-bold min-w-[100px]">
                  Role
                </th>
                <th className="px-4 py-4 text-left text-white font-bold min-w-[130px]">
                  Department
                </th>
                <th className="px-4 py-4 text-left text-white font-bold min-w-[90px]">
                  Status
                </th>
                <th className="px-4 py-4 text-left text-white font-bold min-w-[140px]">
                  Created
                </th>
                <th className="px-4 py-4 text-center text-white font-bold min-w-[120px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {officers.length === 0 ? (
                <tr>
                  <td
                    colSpan="7"
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    <AlertCircle
                      className="mx-auto mb-2 text-gray-400"
                      size={32}
                    />
                    <p>No officers found</p>
                  </td>
                </tr>
              ) : (
                officers.map((officer, index) => (
                  <tr
                    key={officer.id}
                    className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    {/* Name with Avatar */}
                    <td className="px-4 py-4 min-w-[120px]">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
                          {officer.displayName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-gray-900 text-sm truncate">
                          {officer.displayName}
                        </span>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-4 py-4 min-w-[180px]">
                      <div className="flex items-center gap-2 text-gray-600 text-sm">
                        <Mail
                          size={14}
                          className="text-gray-400 flex-shrink-0"
                        />
                        <span className="truncate">{officer.email}</span>
                      </div>
                    </td>

                    {/* Role Selector with Switch */}
                    <td className="px-4 py-4 min-w-[100px]">
                      <select
                        value={officer.role}
                        onChange={(e) =>
                          handleChangeRole(
                            officer.id,
                            officer.displayName,
                            e.target.value
                          )
                        }
                        className="px-2 py-1 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium text-gray-900 text-sm w-full"
                      >
                        {roles.length > 0 ? (
                          roles.map((role) => (
                            <option
                              key={role.id || role.roleName || role.name}
                              value={role.id || role.roleName || role.name}
                            >
                              {role.roleName || role.name || role.id}
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="Admin">Admin</option>
                            <option value="Officer">Officer</option>
                            <option value="Viewer">Viewer</option>
                          </>
                        )}
                      </select>
                    </td>

                    {/* Department */}
                    <td className="px-4 py-4 text-gray-600 text-sm min-w-[130px] truncate">
                      {officer.department || "-"}
                    </td>

                    {/* Status Toggle Switch */}
                    <td className="px-4 py-4 min-w-[90px]">
                      <div className="flex items-center">
                        <label className="relative inline-block h-6 w-11">
                          <input
                            type="checkbox"
                            checked={officer.status === "active"}
                            onChange={(e) =>
                              handleChangeStatus(
                                officer.id,
                                e.target.checked ? "active" : "suspended"
                              )
                            }
                            className="sr-only"
                          />
                          <div
                            className={`block w-full h-full rounded-full transition ${
                              officer.status === "active"
                                ? "bg-green-500"
                                : "bg-red-400"
                            }`}
                          ></div>
                          <div
                            className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform ${
                              officer.status === "active" ? "translate-x-5" : ""
                            }`}
                          ></div>
                        </label>
                        <span
                          className={`ml-3 text-sm font-semibold ${
                            officer.status === "active"
                              ? "text-green-700"
                              : "text-red-600"
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            {officer.status === "active" ? (
                              <CheckCircle size={14} />
                            ) : (
                              <AlertCircle size={14} />
                            )}
                            {officer.status === "active"
                              ? "Active"
                              : "Suspended"}
                          </span>
                        </span>
                      </div>
                    </td>

                    {/* Created Date */}
                    <td className="px-4 py-4 text-xs text-gray-600 min-w-[140px]">
                      <div>
                        <p className="text-sm font-medium">
                          {officer.createdAt
                            ? new Date(officer.createdAt).toLocaleDateString()
                            : "N/A"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {officer.createdAt
                            ? new Date(officer.createdAt).toLocaleTimeString()
                            : ""}
                        </p>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-4 min-w-[120px]">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditModal(officer)}
                          className="p-2 bg-blue-100 text-blue-600 hover:bg-blue-200 rounded-lg transition"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() =>
                            handleDeleteOfficer(officer.id, officer.displayName)
                          }
                          className="p-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg transition"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">
                {editingOfficer ? "Edit Officer" : "Add New Officer"}
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  disabled={!!editingOfficer}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) =>
                    setFormData({ ...formData, displayName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Role
                </label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {roles.length > 0 ? (
                    roles.map((role) => (
                      <option
                        key={role.id || role.roleName || role.name}
                        value={role.id || role.roleName || role.name}
                      >
                        {role.roleName || role.name || role.id}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="Officer">Officer</option>
                      <option value="Admin">Admin</option>
                      <option value="Viewer">Viewer</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Department
                </label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) =>
                    setFormData({ ...formData, department: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Contact Number
                </label>
                <input
                  type="tel"
                  value={formData.contactNumber}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      contactNumber: e.target.value,
                    })
                  }
                  placeholder="e.g., 0917 123 4567"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {editingOfficer ? "New Password" : "Password"}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    placeholder={
                      editingOfficer
                        ? "Leave blank to keep current password"
                        : "At least 6 characters"
                    }
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {formData.password && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-600">
                        Password Strength
                      </span>
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded ${
                          checkPasswordStrength(formData.password).color ===
                          "bg-green-500"
                            ? "bg-green-100 text-green-700"
                            : checkPasswordStrength(formData.password).color ===
                              "bg-yellow-500"
                            ? "bg-yellow-100 text-yellow-700"
                            : checkPasswordStrength(formData.password).color ===
                              "bg-orange-500"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {checkPasswordStrength(formData.password).label}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          checkPasswordStrength(formData.password).color
                        }`}
                        style={{
                          width: `${
                            checkPasswordStrength(formData.password).strength
                          }%`,
                        }}
                      ></div>
                    </div>
                    <div className="text-xs text-gray-600 mt-2 space-y-1">
                      <div
                        className={`flex items-center gap-1 ${
                          checkPasswordStrength(formData.password).checks.length
                            ? "text-green-600"
                            : "text-gray-400"
                        }`}
                      >
                        <CheckCircle size={14} />
                        At least 8 characters
                      </div>
                      <div
                        className={`flex items-center gap-1 ${
                          checkPasswordStrength(formData.password).checks
                            .uppercase
                            ? "text-green-600"
                            : "text-gray-400"
                        }`}
                      >
                        <CheckCircle size={14} />
                        One uppercase letter (A-Z)
                      </div>
                      <div
                        className={`flex items-center gap-1 ${
                          checkPasswordStrength(formData.password).checks
                            .lowercase
                            ? "text-green-600"
                            : "text-gray-400"
                        }`}
                      >
                        <CheckCircle size={14} />
                        One lowercase letter (a-z)
                      </div>
                      <div
                        className={`flex items-center gap-1 ${
                          checkPasswordStrength(formData.password).checks
                            .numbers
                            ? "text-green-600"
                            : "text-gray-400"
                        }`}
                      >
                        <CheckCircle size={14} />
                        One number (0-9)
                      </div>
                      <div
                        className={`flex items-center gap-1 ${
                          checkPasswordStrength(formData.password).checks
                            .special
                            ? "text-green-600"
                            : "text-gray-400"
                        }`}
                      >
                        <CheckCircle size={14} />
                        One special character (!@#$%^&* etc.)
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Confirm Password
                  {formData.password &&
                    formData.confirmPassword &&
                    (formData.password === formData.confirmPassword ? (
                      <span className="ml-2 text-green-600 text-xs font-bold">
                        ✓ Passwords match
                      </span>
                    ) : (
                      <span className="ml-2 text-red-600 text-xs font-bold">
                        ✗ Passwords don't match
                      </span>
                    ))}
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        confirmPassword: e.target.value,
                      })
                    }
                    placeholder="Re-enter password"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveOfficer}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
              >
                {editingOfficer ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          <strong>Total Officers:</strong> {officers.length} |{" "}
          <strong>Active:</strong>{" "}
          {officers.filter((o) => o.status === "active").length} |{" "}
          <strong>Suspended:</strong>{" "}
          {officers.filter((o) => o.status === "suspended").length}
        </p>
      </div>
    </div>
  );
};

export default OfficerManagement;
