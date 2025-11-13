import { useEffect, useState } from "react";
import "./App.css";
import { db } from "./services/firebase";
import { ref, get, child } from "firebase/database";
import { useNavigate } from "react-router-dom";
import { storeSessionUser } from "./utils/sessionUser";
import SMSMFAVerification from "./Components/SMSMFAVerification";
import { Loader } from "lucide-react";

function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [suspendedUser, setSuspendedUser] = useState(null);
  const [showMFAVerification, setShowMFAVerification] = useState(false);
  const [mfaPendingUser, setMFAPendingUser] = useState(null);
  const [showLogoutLoader, setShowLogoutLoader] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const flag = sessionStorage.getItem("logoutTransition");
    let timer;

    if (flag) {
      sessionStorage.removeItem("logoutTransition");
      setShowLogoutLoader(true);
      timer = setTimeout(() => {
        setShowLogoutLoader(false);
      }, 3000);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  const sanitizeStatus = (value) => {
    const normalized = String(value ?? "active")
      .trim()
      .toLowerCase();
    if (normalized === "active") {
      return "active";
    }
    if (normalized === "suspended") {
      return "suspended";
    }
    return normalized ? "suspended" : "active";
  };

  const closeSuspendedModal = () => {
    setSuspendedUser(null);
  };

  const handleMFAVerified = () => {
    // MFA verification successful
    setShowMFAVerification(false);
    storeSessionUser(mfaPendingUser, remember);

    // Clear form fields
    setUsername("");
    setPassword("");
    setMFAPendingUser(null);

    // Wait a brief moment for the session to be stored and context to update
    // before navigating to prevent race conditions
    setTimeout(() => {
      alert(`✅ Login successful! Welcome ${mfaPendingUser.role}.`);
      navigate("/dashboard");
    }, 100);
  };

  const handleMFACancelled = () => {
    // User cancelled MFA
    setShowMFAVerification(false);
    setMFAPendingUser(null);
    setPassword("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSuspendedUser(null);

    const inputUser = username.trim();
    const inputPass = password;

    console.log("[LOGIN] Starting login attempt with username:", inputUser);

    try {
      const dbRef = ref(db);
      console.log("[LOGIN] Fetching admin and users data from Firebase...");
      const [adminSnapshot, usersSnapshot] = await Promise.all([
        get(child(dbRef, "admin")),
        get(child(dbRef, "users")),
      ]);

      const normalizedUser = inputUser.toLowerCase();
      const normalizedPass = String(inputPass).trim();

      console.log("[LOGIN] Checking credentials against Firebase data...");
      let authenticatedUser = null;

      if (adminSnapshot.exists()) {
        const adminData = adminSnapshot.val();
        const adminUsername = String(adminData.username ?? "").trim();
        const adminPassword = String(adminData.pass ?? "");

        console.log("[LOGIN] Checking admin credentials...");
        if (
          adminUsername.toLowerCase() === normalizedUser &&
          adminPassword === normalizedPass
        ) {
          console.log("[LOGIN] ✅ Admin/Super Admin credentials matched!");
          authenticatedUser = {
            id: "super-admin",
            displayName: "Super Admin",
            email: adminUsername,
            role: "Super Admin",
            status: "active",
            department: "Administration",
          };
        }
      }

      if (!authenticatedUser && usersSnapshot.exists()) {
        console.log("[LOGIN] Checking officer/user credentials...");
        const usersData = usersSnapshot.val();
        console.log(
          "[LOGIN] Total users in database:",
          Object.keys(usersData).length
        );

        for (const [id, userRecord] of Object.entries(usersData)) {
          const emailMatch =
            String(userRecord.email ?? "")
              .trim()
              .toLowerCase() === normalizedUser;
          const usernameMatch =
            String(userRecord.username ?? "")
              .trim()
              .toLowerCase() === normalizedUser;
          const passwordMatch =
            String(userRecord.password ?? "").trim() === normalizedPass;

          if ((emailMatch || usernameMatch) && passwordMatch) {
            console.log("[LOGIN] ✅ User credentials matched for user ID:", id);
            console.log("[LOGIN] User data:", {
              email: userRecord.email,
              username: userRecord.username,
              role: userRecord.role,
              status: userRecord.status,
            });

            const normalizedStatus = sanitizeStatus(userRecord.status);
            console.log("[LOGIN] Sanitized status:", normalizedStatus);

            if (normalizedStatus !== "active") {
              console.log("[LOGIN] ⚠️ User account is suspended");
              setSuspendedUser({
                displayName:
                  userRecord.displayName ||
                  userRecord.email ||
                  userRecord.username ||
                  "User",
                email: userRecord.email || userRecord.username || "",
                role: userRecord.role || "Officer",
              });
              setPassword("");
              return;
            }

            console.log(
              "[LOGIN] ✅ User status is active, creating authenticated user object"
            );
            authenticatedUser = {
              id,
              displayName: userRecord.displayName || "Officer",
              email: userRecord.email || userRecord.username || "",
              role: userRecord.role || "Officer",
              status: normalizedStatus,
              department: userRecord.department || "",
              contactNumber: userRecord.contactNumber || "",
              mfaEnabled: userRecord.mfaEnabled || false,
            };
            break;
          }
        }
      }

      if (!authenticatedUser) {
        console.log("[LOGIN] ❌ Invalid username or password");
        alert("❌ Invalid username or password");
        return;
      }

      console.log("[LOGIN] Authenticated user object:", authenticatedUser);
      console.log("[LOGIN] MFA Enabled?", authenticatedUser.mfaEnabled);
      console.log("[LOGIN] Contact Number:", authenticatedUser.contactNumber);

      // Check if user has MFA enabled
      if (authenticatedUser.mfaEnabled) {
        console.log(
          "[LOGIN] ✅ MFA IS ENABLED - Showing Firebase SMS MFA verification screen"
        );

        if (!authenticatedUser.contactNumber) {
          alert(
            "❌ MFA is enabled but no contact number is set for this account."
          );
          return;
        }

        console.log(
          `[LOGIN] Initiating Firebase SMS MFA for ${authenticatedUser.contactNumber}...`
        );

        // Store user temporarily and show MFA verification
        // Firebase will handle SMS sending in the SMSMFAVerification component
        setMFAPendingUser(authenticatedUser);
        setShowMFAVerification(true);
        return;
      }

      console.log("[LOGIN] ⚠️ MFA NOT ENABLED - Bypassing MFA verification");
      console.log("[LOGIN] No MFA required, storing session user...");
      // No MFA, proceed with login
      storeSessionUser(authenticatedUser, remember);
      console.log("[LOGIN] ✅ Session user stored");

      // Clear form fields
      setUsername("");
      setPassword("");

      console.log(
        "[LOGIN] Waiting 100ms before navigation to allow context update..."
      );
      // Wait a brief moment for the session to be stored and context to update
      // before navigating to prevent race conditions
      setTimeout(() => {
        console.log("[LOGIN] ✅ Login successful! Navigating to dashboard");
        alert(`✅ Login successful! Welcome ${authenticatedUser.role}.`);
        navigate("/dashboard");
      }, 100);
    } catch (err) {
      console.error("[LOGIN] ❌ Error during login:", err);
      alert("⚠️ Error connecting to Firebase");
    }
  };

  return (
    <>
      {showLogoutLoader && (
        <div className="logout-loading-overlay">
          <div className="logout-loading-card">
            <Loader className="logout-spinner" />
            <h3>Logging you out...</h3>
            <p>Please wait while we return you to the login screen.</p>
          </div>
        </div>
      )}
      <div className="container">
        <div className="left-section">
          <div className="login-card">
            <div className="title-section">
              <h1 className="app-title">ELDER EASE ADMIN</h1>
              <p className="subtitle">
                Association of Senior Citizens of Brgy. Pinagbuhatan, Pasig City
                Incorporated
              </p>
            </div>

            <div className="form-container">
              <h2 className="login-title">LOG IN</h2>
              <form onSubmit={handleSubmit}>
                <label className="form-label">USERNAME</label>
                <input
                  type="text"
                  placeholder="Enter username or email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="form-input"
                />

                <label className="form-label">PASSWORD</label>
                <div className="password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="form-input"
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? (
                      // Eye Off SVG
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="icon"
                      >
                        <path d="M17.94 17.94A10.12 10.12 0 0112 20C7 20 2.73 16.11 1 12c.74-1.8 2.16-3.8 4.08-5.44M9.9 4.24A9.12 9.12 0 0112 4c5 0 9.27 3.89 11 8-1 2.44-3.14 4.74-5.66 6.08M1 1l22 22" />
                      </svg>
                    ) : (
                      // Eye SVG
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="icon"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>

                <div className="options-row">
                  <label className="remember-me">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    Remember me
                  </label>
                  <button type="button" className="forgot-btn">
                    Forgot Password
                  </button>
                </div>

                <button type="submit" className="login-btn">
                  Log In
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="right-section">
          <img src="/img/imgbg.jpg" alt="San Sebastian Parish" />
          <div className="overlay" />
          <div className="right-gradient" />
        </div>
      </div>

      {suspendedUser && (
        <div
          className="suspended-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="suspended-modal-title"
        >
          <div className="suspended-modal-card">
            <h3 id="suspended-modal-title">Account Suspended</h3>
            <p className="suspended-modal-message">
              {suspendedUser.displayName}, your account is currently suspended.
              Please contact your system administrator to regain access.
            </p>
            {suspendedUser.email && (
              <p className="suspended-modal-subtext">
                Email: {suspendedUser.email}
              </p>
            )}
            <button
              type="button"
              className="suspended-modal-button"
              onClick={closeSuspendedModal}
            >
              Okay
            </button>
          </div>
        </div>
      )}

      {showMFAVerification && mfaPendingUser && (
        <SMSMFAVerification
          phoneNumber={mfaPendingUser.contactNumber}
          onVerify={handleMFAVerified}
          onCancel={handleMFACancelled}
        />
      )}
    </>
  );
}

export default App;
