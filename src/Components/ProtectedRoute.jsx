import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../Context/AuthContext";

const ProtectedRoute = ({ moduleId, children }) => {
  const location = useLocation();
  const { user, loading, hasModuleAccess, getFirstAccessiblePath } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin mb-4">
            <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full mx-auto"></div>
          </div>
          <p className="text-gray-600">Loading permissions...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  if (!hasModuleAccess(moduleId, "view")) {
    const fallback = getFirstAccessiblePath();
    if (fallback && fallback !== location.pathname) {
      return <Navigate to={fallback} replace />;
    }

    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
