// Protected Route Component
// Enforces role-based access control

import React from "react";
import { Navigate, useParams } from "react-router-dom";
import { hasPermission, canAccessModule } from "./permissionUtils";
import { Lock, AlertCircle } from "lucide-react";

/**
 * ProtectedRoute Component
 * Wraps routes to enforce role-based access control
 */
export const ProtectedRoute = ({
  children,
  requiredPermission,
  requiredRole,
  userRole,
  userId,
  onAccessDenied,
}) => {
  if (!userRole) {
    return <UnauthorizedPage />;
  }

  // Check role requirement if specified
  if (requiredRole && userRole !== requiredRole) {
    if (onAccessDenied) {
      onAccessDenied(userRole, requiredRole);
    }
    return <AccessDeniedPage userRole={userRole} />;
  }

  // Check permission requirement if specified
  if (requiredPermission && !hasPermission(userRole, requiredPermission)) {
    if (onAccessDenied) {
      onAccessDenied(userRole, requiredPermission);
    }
    return <AccessDeniedPage userRole={userRole} />;
  }

  return children;
};

/**
 * Module Access Wrapper
 * Provides granular module-level access control
 */
export const ModuleAccess = ({
  children,
  module,
  action = "view",
  userRole,
  fallback = null,
}) => {
  if (!canAccessModule(userRole, module, action)) {
    return (
      fallback || (
        <div className="p-4 text-center text-gray-500">
          <Lock size={24} className="mx-auto mb-2 opacity-50" />
          <p>You don't have access to this module</p>
        </div>
      )
    );
  }

  return <>{children}</>;
};

/**
 * Permission-based Rendering
 * Shows/hides UI elements based on permissions
 */
export const IfHasPermission = ({
  children,
  permission,
  userRole,
  fallback = null,
}) => {
  if (!hasPermission(userRole, permission)) {
    return fallback;
  }

  return <>{children}</>;
};

/**
 * Action Button Wrapper
 * Renders button only if user has permission for action
 */
export const PermissionButton = ({
  children,
  permission,
  userRole,
  onClick,
  className = "",
  disabled = false,
  title = "You don't have permission to perform this action",
  ...props
}) => {
  const hasAccess = hasPermission(userRole, permission);

  return (
    <button
      {...props}
      className={className}
      disabled={disabled || !hasAccess}
      onClick={hasAccess ? onClick : (e) => e.preventDefault()}
      title={!hasAccess ? title : ""}
    >
      {children}
    </button>
  );
};

/**
 * Unauthorized Page
 * Shown when user is not authenticated
 */
const UnauthorizedPage = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-red-50 to-red-100">
      <div className="text-center">
        <AlertCircle size={64} className="mx-auto mb-4 text-red-500" />
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Unauthorized</h1>
        <p className="text-gray-600 mb-4">
          You must be logged in to access this resource
        </p>
        <a
          href="/login"
          className="inline-block px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
        >
          Go to Login
        </a>
      </div>
    </div>
  );
};

/**
 * Access Denied Page
 * Shown when user doesn't have required permission/role
 */
const AccessDeniedPage = ({ userRole }) => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-yellow-50 to-yellow-100">
      <div className="text-center">
        <Lock size={64} className="mx-auto mb-4 text-yellow-600" />
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Access Denied</h1>
        <p className="text-gray-600 mb-4">
          Your current role ({userRole}) does not have access to this resource
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Contact your administrator if you believe this is an error
        </p>
        <a
          href="/dashboard"
          className="inline-block px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition"
        >
          Return to Dashboard
        </a>
      </div>
    </div>
  );
};

export default {
  ProtectedRoute,
  ModuleAccess,
  IfHasPermission,
  PermissionButton,
};
