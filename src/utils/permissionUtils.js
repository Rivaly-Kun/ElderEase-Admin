// Permission utilities for role-based access control
import { ROLE_PERMISSIONS, PERMISSIONS } from "./rbacConfig";

/**
 * Check if a user has a specific permission
 * @param {string} userRole - The user's role
 * @param {string} permission - The permission to check
 * @returns {boolean} Whether the user has the permission
 */
export const hasPermission = (userRole, permission) => {
  if (!userRole) return false;
  const permissions = ROLE_PERMISSIONS[userRole] || [];
  return permissions.includes(permission);
};

/**
 * Check if a user has any of the given permissions
 * @param {string} userRole - The user's role
 * @param {string[]} permissionsList - List of permissions to check
 * @returns {boolean} Whether the user has any of the permissions
 */
export const hasAnyPermission = (userRole, permissionsList) => {
  if (!userRole || !Array.isArray(permissionsList)) return false;
  const userPermissions = ROLE_PERMISSIONS[userRole] || [];
  return permissionsList.some((perm) => userPermissions.includes(perm));
};

/**
 * Check if a user has all of the given permissions
 * @param {string} userRole - The user's role
 * @param {string[]} permissionsList - List of permissions to check
 * @returns {boolean} Whether the user has all the permissions
 */
export const hasAllPermissions = (userRole, permissionsList) => {
  if (!userRole || !Array.isArray(permissionsList)) return false;
  const userPermissions = ROLE_PERMISSIONS[userRole] || [];
  return permissionsList.every((perm) => userPermissions.includes(perm));
};

/**
 * Get all permissions for a user role
 * @param {string} userRole - The user's role
 * @returns {string[]} List of permissions
 */
export const getUserPermissions = (userRole) => {
  return ROLE_PERMISSIONS[userRole] || [];
};

/**
 * Check if user can perform module-level action
 * @param {string} userRole - The user's role
 * @param {string} module - Module name (e.g., "Senior Citizens")
 * @param {string} action - Action name (e.g., "edit", "delete")
 * @returns {boolean} Whether the user can perform the action
 */
export const canAccessModule = (userRole, module, action = "view") => {
  if (!userRole) return false;

  const permissionMap = {
    view: "view",
    create: "create",
    edit: "edit",
    delete: "delete",
    approve: "approve",
    reject: "reject",
    export: "export",
    archive: "archive",
  };

  const action_suffix = permissionMap[action.toLowerCase()] || action;
  const userPermissions = ROLE_PERMISSIONS[userRole] || [];

  // Check if any permission contains the module and action
  return userPermissions.some((perm) => {
    const moduleLower = module.toLowerCase().replace(/\s+/g, "_");
    return perm.includes(moduleLower) && perm.includes(action_suffix);
  });
};

/**
 * Get accessible modules for a user
 * @param {string} userRole - The user's role
 * @returns {string[]} List of accessible modules
 */
export const getAccessibleModules = (userRole) => {
  const modules = [
    "Dashboard",
    "Senior Citizens",
    "Payments",
    "Services",
    "Reports",
    "Notifications",
    "Documents",
  ];

  return modules.filter((module) => canAccessModule(userRole, module, "view"));
};

/**
 * Get action buttons that should be visible for a module
 * @param {string} userRole - The user's role
 * @param {string} module - Module name
 * @returns {Object} Available actions with boolean flags
 */
export const getAvailableActions = (userRole, module) => {
  return {
    create: canAccessModule(userRole, module, "create"),
    edit: canAccessModule(userRole, module, "edit"),
    delete: canAccessModule(userRole, module, "delete"),
    view: canAccessModule(userRole, module, "view"),
    approve: canAccessModule(userRole, module, "approve"),
    reject: canAccessModule(userRole, module, "reject"),
    export: canAccessModule(userRole, module, "export"),
    archive: canAccessModule(userRole, module, "archive"),
  };
};

export default {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getUserPermissions,
  canAccessModule,
  getAccessibleModules,
  getAvailableActions,
};
