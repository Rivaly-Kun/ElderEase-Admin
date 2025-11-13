// Admin Info Component
// Display admin and user information from database

import React, { useState, useEffect } from "react";
import { db } from "../services/firebase";
import { ref, get, set } from "firebase/database";
import {
  Lock,
  User,
  Mail,
  Shield,
  Key,
  Calendar,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Edit2,
  Save,
  X,
} from "lucide-react";

const AdminInfo = ({ currentUser }) => {
  const [admin, setAdmin] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");

  const sanitizeStatus = (value) =>
    String(value ?? "active").toLowerCase() === "active"
      ? "active"
      : "suspended";

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

  const handleChangePassword = async () => {
    setPasswordError("");

    try {
      // Fetch current password from Firebase to ensure we have the latest value
      const adminPassRef = ref(db, "admin/pass");
      const adminPassSnapshot = await get(adminPassRef);
      const currentPasswordFromDB = adminPassSnapshot.exists()
        ? String(adminPassSnapshot.val())
        : null;

      console.log("Input password:", passwordForm.currentPassword);
      console.log("DB password:", currentPasswordFromDB);
      console.log(
        "Match:",
        String(passwordForm.currentPassword) === currentPasswordFromDB
      );

      // Validate current password against database value (convert both to strings)
      if (String(passwordForm.currentPassword) !== currentPasswordFromDB) {
        setPasswordError("Current password is incorrect");
        return;
      }

      // Validate new password
      if (!passwordForm.newPassword) {
        setPasswordError("New password is required");
        return;
      }

      if (passwordForm.newPassword.length < 6) {
        setPasswordError("Password must be at least 6 characters");
        return;
      }

      // Check if passwords match
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        setPasswordError("New passwords do not match");
        return;
      }

      // Update password in Firebase
      await set(adminPassRef, passwordForm.newPassword);

      // Update local state
      setAdmin({ ...admin, pass: passwordForm.newPassword });
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setShowPasswordModal(false);
      alert("✅ Password changed successfully!");
    } catch (error) {
      console.error("Error changing password:", error);
      setPasswordError("Error changing password. Please try again.");
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch admin info
        const adminRef = ref(db, "admin");
        const adminSnapshot = await get(adminRef);
        if (adminSnapshot.exists()) {
          setAdmin(adminSnapshot.val());
        }

        // Fetch users
        const usersRef = ref(db, "users");
        const usersSnapshot = await get(usersRef);
        if (usersSnapshot.exists()) {
          const usersData = Object.entries(usersSnapshot.val()).map(
            ([key, value]) => ({
              id: key,
              ...value,
              status: sanitizeStatus(value?.status),
            })
          );
          setUsers(usersData);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin mb-4">
            <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full mx-auto"></div>
          </div>
          <p className="text-gray-600">Loading admin information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin Section */}
      {admin && (
        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg shadow-lg p-8 border border-red-300">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Shield className="text-red-600" size={28} />
              <h2 className="text-3xl font-bold text-red-900">Admin Account</h2>
            </div>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-semibold"
            >
              <Lock size={18} />
              Change Password
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-white rounded-lg p-6 border border-red-200">
            {/* Username */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <User className="text-red-600" size={20} />
                <p className="text-xs text-gray-600 uppercase tracking-wide font-bold">
                  Username
                </p>
              </div>
              <p className="text-2xl font-bold text-gray-900 pl-7">
                {admin.username}
              </p>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Key className="text-red-600" size={20} />
                <p className="text-xs text-gray-600 uppercase tracking-wide font-bold">
                  Current Password
                </p>
              </div>
              <div className="flex items-center gap-2 pl-7">
                <p className="text-xl font-bold text-gray-900">
                  {showAdminPass ? admin.pass : "••••••"}
                </p>
                <button
                  onClick={() => setShowAdminPass(!showAdminPass)}
                  className="ml-auto px-2 py-1 bg-red-200 hover:bg-red-300 text-red-700 rounded text-xs font-medium transition"
                >
                  {showAdminPass ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* Security Status */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="text-green-600" size={20} />
                <p className="text-xs text-gray-600 uppercase tracking-wide font-bold">
                  Security Status
                </p>
              </div>
              <div className="flex items-center gap-2 pl-7">
                <span className="inline-block w-3 h-3 bg-green-600 rounded-full"></span>
                <p className="text-lg font-bold text-green-700">Protected</p>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800 font-medium">
              ⚠️ <strong>Security Notice:</strong> Your admin account has full
              system access. Keep your password secure and never share it with
              unauthorized users. Change your password regularly for better
              security.
            </p>
          </div>
        </div>
      )}

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="text-red-600" size={24} />
                <h3 className="text-lg font-bold text-gray-900">
                  Change Admin Password
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordError("");
                  setPasswordForm({
                    currentPassword: "",
                    newPassword: "",
                    confirmPassword: "",
                  });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {passwordError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700 font-medium">
                    {passwordError}
                  </p>
                </div>
              )}

              {/* Current Password */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showAdminPass ? "text" : "password"}
                    value={passwordForm.currentPassword}
                    onChange={(e) =>
                      setPasswordForm({
                        ...passwordForm,
                        currentPassword: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPass(!showAdminPass)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showAdminPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={passwordForm.newPassword}
                    onChange={(e) =>
                      setPasswordForm({
                        ...passwordForm,
                        newPassword: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {passwordForm.newPassword && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-600">
                        Password Strength
                      </span>
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded ${
                          checkPasswordStrength(passwordForm.newPassword)
                            .color === "bg-green-500"
                            ? "bg-green-100 text-green-700"
                            : checkPasswordStrength(passwordForm.newPassword)
                                .color === "bg-yellow-500"
                            ? "bg-yellow-100 text-yellow-700"
                            : checkPasswordStrength(passwordForm.newPassword)
                                .color === "bg-orange-500"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {checkPasswordStrength(passwordForm.newPassword).label}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          checkPasswordStrength(passwordForm.newPassword).color
                        }`}
                        style={{
                          width: `${
                            checkPasswordStrength(passwordForm.newPassword)
                              .strength
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Confirm New Password
                  {passwordForm.newPassword &&
                    passwordForm.confirmPassword &&
                    (passwordForm.newPassword ===
                    passwordForm.confirmPassword ? (
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
                    value={passwordForm.confirmPassword}
                    onChange={(e) =>
                      setPasswordForm({
                        ...passwordForm,
                        confirmPassword: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
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
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordError("");
                  setPasswordForm({
                    currentPassword: "",
                    newPassword: "",
                    confirmPassword: "",
                  });
                }}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleChangePassword}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-semibold"
              >
                <Save size={18} />
                Update Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users Section */}
      <div className="bg-white rounded-lg shadow-lg p-6 border border-gray-300">
        <div className="flex items-center gap-2 mb-6">
          <User className="text-blue-600" size={24} />
          <h2 className="text-2xl font-bold text-gray-900">System Users</h2>
          <span className="ml-auto bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-semibold">
            {users.length}
          </span>
        </div>

        {users.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <User className="mx-auto text-gray-400 mb-2" size={48} />
            <p className="text-gray-600">No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b-2 border-gray-300">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                          {user.displayName?.[0]?.toUpperCase() || "U"}
                        </div>
                        {user.displayName || "Unknown"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Mail size={16} className="text-gray-400" />
                        {user.email}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold ${
                          user.role === "Admin"
                            ? "bg-red-100 text-red-800"
                            : user.role === "Officer"
                            ? "bg-blue-100 text-blue-800"
                            : user.role === "Encoder"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {user.department || "N/A"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        {user.status === "active" ? (
                          <>
                            <CheckCircle size={16} className="text-green-600" />
                            <span className="text-green-700 font-medium">
                              Active
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertCircle size={16} className="text-red-600" />
                            <span className="text-red-700 font-medium">
                              Suspended
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <div className="text-xs">
                        <p>
                          {user.createdAt
                            ? new Date(user.createdAt).toLocaleDateString()
                            : "N/A"}
                        </p>
                        <p className="text-gray-500">
                          {user.createdAt
                            ? new Date(user.createdAt).toLocaleTimeString()
                            : ""}
                        </p>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>Total Officers:</strong> {users.length} |{" "}
            <strong>Active:</strong>{" "}
            {users.filter((u) => u.status === "active").length} |{" "}
            <strong>Suspended:</strong>{" "}
            {users.filter((u) => u.status === "suspended").length}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminInfo;
