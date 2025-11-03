/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ref, get } from "firebase/database";
import { db } from "../services/firebase";
import {
  getStoredSessionUser,
  clearStoredSessionUser,
  SESSION_USER_KEY,
  SESSION_USER_CHANGED_EVENT,
} from "../utils/sessionUser";
import { NAVIGATION_MODULES } from "../utils/navigationConfig";

const AuthContext = createContext(null);

const normalizeRoleKey = (roleName = "") =>
  roleName.trim().toLowerCase().replace(/\s+/g, "_");

const deriveSuperAdminFlag = (roleName = "") => {
  const normalized = roleName.trim().toLowerCase();
  return normalized === "super admin";
};

const normalizeModulePermissions = (rawPermissions = {}) => {
  const normalized = {};

  // Process all modules from Firebase with their explicit view flags
  Object.entries(rawPermissions || {}).forEach(([moduleId, value]) => {
    let viewAllowed = false;

    if (typeof value === "boolean") {
      viewAllowed = value;
    } else if (
      value &&
      typeof value === "object" &&
      Object.prototype.hasOwnProperty.call(value, "view")
    ) {
      viewAllowed = Boolean(value.view);
    } else if (value && typeof value === "object") {
      viewAllowed = Object.values(value).some(Boolean);
    } else {
      viewAllowed = Boolean(value);
    }

    // Add ALL modules with their actual permission state (true or false)
    normalized[moduleId] = { view: viewAllowed };
  });

  // Ensure every navigation module is represented, even if missing from Firebase
  NAVIGATION_MODULES.forEach(({ id }) => {
    if (!id || id === "access_control") {
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(normalized, id)) {
      normalized[id] = { view: false };
    }
  });

  return normalized;
};

const defaultPermissionsForSuperAdmin = () => {
  // SuperAdmin doesn't need explicit permissions in the map
  // Access is granted through the isSuperAdmin flag in hasModuleAccess
  return {};
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => getStoredSessionUser());
  const [rolePermissions, setRolePermissions] = useState(() => ({}));
  const [loading, setLoading] = useState(false);

  const isSuperAdmin = useMemo(
    () => deriveSuperAdminFlag(user?.role),
    [user?.role]
  );

  const loadRolePermissions = async (roleName) => {
    if (!roleName) {
      setRolePermissions({});
      return;
    }

    if (deriveSuperAdminFlag(roleName)) {
      setRolePermissions(defaultPermissionsForSuperAdmin());
      return;
    }

    try {
      setLoading(true);
      const normalizedKey = normalizeRoleKey(roleName);
      const directRoleRef = ref(db, `roles/${normalizedKey}`);
      let snapshot = await get(directRoleRef);

      if (!snapshot.exists()) {
        const rolesRef = ref(db, "roles");
        const rolesSnapshot = await get(rolesRef);
        if (rolesSnapshot.exists()) {
          const rolesData = rolesSnapshot.val();
          const matchedEntry = Object.entries(rolesData).find(
            ([, value]) =>
              (value?.roleName || "").trim().toLowerCase() ===
              roleName.trim().toLowerCase()
          );
          if (matchedEntry) {
            snapshot = { exists: () => true, val: () => matchedEntry[1] };
          }
        }
      }

      if (snapshot?.exists()) {
        const roleData = snapshot.val();
        setRolePermissions(
          normalizeModulePermissions(roleData.modulePermissions || {})
        );
      } else {
        // Role not found - set empty permissions (deny all access)
        setRolePermissions({});
      }
    } catch (error) {
      console.error("Failed to load role permissions", error);
      setRolePermissions({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRolePermissions(user?.role);
  }, [user?.role]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return () => {};
    }

    const handleStorageChange = (event) => {
      if (!event || event.key === null || event.key === SESSION_USER_KEY) {
        setUser(getStoredSessionUser());
      }
    };

    const handleSessionEvent = () => {
      setUser(getStoredSessionUser());
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(SESSION_USER_CHANGED_EVENT, handleSessionEvent);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(
        SESSION_USER_CHANGED_EVENT,
        handleSessionEvent
      );
    };
  }, []);

  const hasModuleAccess = (moduleId, action = "view") => {
    if (!moduleId) return false;
    if (isSuperAdmin) return true;

    // Check if module exists in role permissions
    const modulePermissions = rolePermissions?.[moduleId];

    // If module is not explicitly granted, deny access
    if (modulePermissions === undefined) {
      return false;
    }

    if (typeof modulePermissions === "boolean") {
      return modulePermissions;
    }

    if (!modulePermissions) return false;

    const viewAllowed = Boolean(modulePermissions.view);
    if (action === "view") {
      return viewAllowed;
    }

    // Treat all other actions as dependent on the primary view toggle
    return viewAllowed;
  };

  const getFirstAccessiblePath = () => {
    if (isSuperAdmin) {
      return "/dashboard";
    }

    for (const module of NAVIGATION_MODULES) {
      if (hasModuleAccess(module.id, "view")) {
        return module.path;
      }
    }

    return null;
  };

  const logout = () => {
    clearStoredSessionUser();
    setUser(null);
    setRolePermissions({});
  };

  const value = {
    user,
    setUser,
    loading,
    isSuperAdmin,
    rolePermissions,
    hasModuleAccess,
    getFirstAccessiblePath,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
