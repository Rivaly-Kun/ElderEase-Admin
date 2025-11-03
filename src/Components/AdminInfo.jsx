// Admin Info Component
// Display admin and user information from database

import React, { useState, useEffect } from "react";
import { db } from "../services/firebase";
import { ref, get } from "firebase/database";
import {
  Lock,
  User,
  Mail,
  Shield,
  Key,
  Calendar,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

const AdminInfo = ({ currentUser }) => {
  const [admin, setAdmin] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdminPass, setShowAdminPass] = useState(false);

  const sanitizeStatus = (value) =>
    String(value ?? "active").toLowerCase() === "active"
      ? "active"
      : "suspended";

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
        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg shadow-lg p-6 border border-red-300">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="text-red-600" size={24} />
            <h2 className="text-2xl font-bold text-red-900">Admin Account</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white rounded-lg p-4 border border-red-200">
            {/* Username */}
            <div className="flex items-center gap-3">
              <User className="text-red-600" size={20} />
              <div>
                <p className="text-xs text-gray-600 uppercase tracking-wide font-medium">
                  Username
                </p>
                <p className="text-lg font-bold text-gray-900">
                  {admin.username}
                </p>
              </div>
            </div>

            {/* Password */}
            <div className="flex items-center gap-3">
              <Key className="text-red-600" size={20} />
              <div className="flex-1">
                <p className="text-xs text-gray-600 uppercase tracking-wide font-medium">
                  Password
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-gray-900">
                    {showAdminPass ? admin.pass : "••••••"}
                  </p>
                  <button
                    onClick={() => setShowAdminPass(!showAdminPass)}
                    className="px-2 py-1 bg-red-200 hover:bg-red-300 text-red-700 rounded text-xs font-medium transition"
                  >
                    {showAdminPass ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <p className="text-sm text-red-700 mt-4 p-3 bg-red-100 rounded italic">
            ⚠️ Keep your admin credentials secure. Never share the password with
            unauthorized users.
          </p>
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
