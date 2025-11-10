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

    normalized[moduleId] = { view: viewAllowed };
  });

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

const resolveModuleKey = (rawId) => {
  if (!rawId) {
    return null;
  }

  const rawString = String(rawId).trim();
  if (!rawString) {
    return null;
  }

  const lower = rawString.toLowerCase();
  const matchedModule = NAVIGATION_MODULES.find((module) => {
    const idMatch = module.id?.toLowerCase() === lower;
    const labelMatch = module.label?.toLowerCase() === lower;
    return idMatch || labelMatch;
  });

  if (matchedModule) {
    return matchedModule.id;
  }

  return rawString.replace(/\s+/g, "_").toLowerCase();
};

const normalizeModuleKeys = (permissionsMap = {}) => {
  const remapped = {};
  Object.entries(permissionsMap || {}).forEach(([rawModuleId, value]) => {
    const resolvedKey = resolveModuleKey(rawModuleId);
    if (resolvedKey && resolvedKey !== "access_control") {
      remapped[resolvedKey] = value;
    }
  });
  return remapped;
};

const convertLegacyModules = (legacyList = []) => {
  return legacyList.reduce((accumulator, rawModuleId) => {
    const resolvedKey = resolveModuleKey(rawModuleId);
    if (resolvedKey && resolvedKey !== "access_control") {
      accumulator[resolvedKey] = { view: true };
    }
    return accumulator;
  }, {});
};

const defaultPermissionsForSuperAdmin = () => {
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
      console.log("[AUTH] No role name provided, clearing permissions");
      setRolePermissions({});
      return;
    }

    if (deriveSuperAdminFlag(roleName)) {
      console.log("[AUTH] Super Admin detected, granting all access");
      setRolePermissions(defaultPermissionsForSuperAdmin());
      return;
    }

    console.log("[AUTH] Loading permissions for role:", roleName);
    try {
      setLoading(true);
      const normalizedKey = normalizeRoleKey(roleName);
      console.log("[AUTH] Normalized role key:", normalizedKey);
      const directRoleRef = ref(db, `roles/${normalizedKey}`);
      let snapshot = await get(directRoleRef);

      if (!snapshot.exists()) {
        console.log(
          "[AUTH] Role not found at normalized path, searching all roles..."
        );
        const rolesRef = ref(db, "roles");
        const rolesSnapshot = await get(rolesRef);
        if (rolesSnapshot.exists()) {
          const rolesData = rolesSnapshot.val() || {};
          const matchedEntry = Object.entries(rolesData).find(
            ([, value]) =>
              (value?.roleName || "").trim().toLowerCase() ===
              roleName.trim().toLowerCase()
          );
          if (matchedEntry) {
            console.log("[AUTH] ✅ Role found by name match:", matchedEntry[0]);
            snapshot = { exists: () => true, val: () => matchedEntry[1] };
          }
        }
      } else {
        console.log("[AUTH] ✅ Role found at normalized path");
      }

      if (snapshot.exists()) {
        const roleData = snapshot.val() || {};
        console.log("[AUTH] Role data retrieved:", {
          roleName: roleData?.roleName,
          modules: roleData?.modules,
          modulePermissions: roleData?.modulePermissions,
        });

        let modulePermissions = roleData?.modulePermissions;

        if (
          (!modulePermissions || Object.keys(modulePermissions).length === 0) &&
          Array.isArray(roleData?.modules)
        ) {
          console.log(
            "[AUTH] Converting legacy modules list to permissions map"
          );
          modulePermissions = convertLegacyModules(roleData.modules);
          console.log("[AUTH] Converted legacy modules:", modulePermissions);
        }

        const remappedPermissions = normalizeModuleKeys(
          modulePermissions || {}
        );
        const normalized = normalizeModulePermissions(remappedPermissions);
        console.log("[AUTH] ✅ Normalized module permissions:", normalized);
        setRolePermissions(normalized);
      } else {
        console.log(
          "[AUTH] ❌ Role not found - setting empty permissions (deny all)"
        );
        setRolePermissions({});
      }
    } catch (error) {
      console.error("[AUTH] ❌ Failed to load role permissions:", error);
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
  if (context) {
    return context;
  }

  // Graceful fallback for edge cases where the provider has not yet mounted
  // (e.g., during hot module replacement or early render cycles).
  const fallbackUser = getStoredSessionUser();
  const fallbackIsSuperAdmin = deriveSuperAdminFlag(fallbackUser?.role);

  const fallbackHasModuleAccess = () => fallbackIsSuperAdmin;
  const fallbackGetFirstAccessiblePath = () =>
    fallbackIsSuperAdmin ? "/dashboard" : null;

  return {
    user: fallbackUser,
    setUser: () => {},
    loading: false,
    isSuperAdmin: fallbackIsSuperAdmin,
    rolePermissions: {},
    hasModuleAccess: fallbackHasModuleAccess,
    getFirstAccessiblePath: fallbackGetFirstAccessiblePath,
    logout: () => {},
  };
};
