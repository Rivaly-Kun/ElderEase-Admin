import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { NAVIGATION_MODULES } from "../utils/navigationConfig";
import { useAuth } from "../Context/AuthContext";
import { LogOut, AlertCircle, Loader2 } from "lucide-react";

const Sidebar = ({ activeMenu, setActiveMenu }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, hasModuleAccess, isSuperAdmin, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const accessibleMenuItems = useMemo(() => {
    return NAVIGATION_MODULES.filter((item) =>
      hasModuleAccess(item.id, "view")
    );
  }, [hasModuleAccess]);

  useEffect(() => {
    const currentItem = accessibleMenuItems.find(
      (item) => item.path === location.pathname
    );
    if (currentItem && activeMenu !== currentItem.label) {
      setActiveMenu(currentItem.label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, accessibleMenuItems]);

  const handleClick = (item) => {
    setActiveMenu(item.label);
    navigate(item.path);
  };

  const displayNameRaw =
    user?.displayName || user?.name || user?.email || "Guest User";
  const normalizedRole = (user?.role || "guest").toLowerCase();
  const displayName = displayNameRaw;
  const displayRole = user?.role || "Guest";
  const displayEmail = user?.email || user?.username || "";
  const userInitial = displayName.charAt(0).toUpperCase();

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm">
      {/* === Header === */}
      <div className="p-5 border-b border-gray-100 flex items-center gap-3">
        <div className="w-12 h-12 flex items-center justify-center">
          <img
            src="/img/ElderEaseLogo.png"
            alt="ElderEase logo"
            className="w-full h-full object-contain"
          />
        </div>
        <span className="text-lg font-bold text-gray-800">Elder Ease</span>
      </div>

      {/* === User Info === */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100">
          <span className="text-base font-semibold text-gray-700">
            {userInitial}
          </span>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{displayName}</h3>
          <p className="text-xs text-gray-500">
            {displayRole}
            {displayEmail ? ` - ${displayEmail}` : ""}
          </p>
        </div>
      </div>

      {/* === Navigation === */}
      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {accessibleMenuItems.length === 0 && (
            <li>
              <div className="px-4 py-3 text-sm text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                No modules available. Please contact the administrator.
              </div>
            </li>
          )}
          {accessibleMenuItems.map((item) => {
            const isActive = activeMenu === item.label;
            return (
              <li key={item.label}>
                <button
                  onClick={() => handleClick(item)}
                  className={`group w-full flex items-start gap-4 px-4 py-2.5 rounded-lg transition-all duration-150 relative ${
                    isActive
                      ? "bg-purple-100 text-purple-600 font-medium"
                      : "text-gray-600 hover:bg-gray-50 hover:text-purple-600"
                  }`}
                >
                  {/* Alignment bar fixed */}
                  <div
                    className={`absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-5 rounded-full transition-all duration-150 ${
                      isActive
                        ? "bg-purple-600"
                        : "bg-transparent group-hover:bg-purple-300"
                    }`}
                  />
                  <item.icon
                    className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                      isActive ? "text-purple-600" : "text-gray-500"
                    }`}
                  />
                  <span className="flex-1 text-sm tracking-wide text-left leading-5">
                    {item.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* === Logout Button === */}
      <div className="px-3 py-4 border-t border-gray-100">
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold transition-colors duration-150"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>

      {/* === Logout Loading Overlay === */}
      {isLoggingOut && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000] backdrop-blur-md">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
            <Loader2 className="w-16 h-16 mx-auto mb-4 text-purple-600 animate-spin" />
            <h3 className="text-xl font-bold text-gray-800 mb-2">
              Logging you out...
            </h3>
            <p className="text-sm text-gray-600">
              Please wait while we return you to the login screen.
            </p>
          </div>
        </div>
      )}

      {/* === Logout Confirmation Modal === */}
      {showLogoutConfirm && !isLoggingOut && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border-l-4 border-red-600 z-[10000]">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    Confirm Logout
                  </h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    Are you sure you want to logout? You'll need to log in again
                    to access your account.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setShowLogoutConfirm(false);
                    setIsLoggingOut(true);

                    // Wait for logout animation (3 seconds)
                    await new Promise((resolve) => setTimeout(resolve, 3000));

                    // Perform logout
                    logout();

                    // Redirect to login
                    window.location.href = "/";
                  }}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-semibold flex items-center justify-center gap-2"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
