import { useState } from "react";
import "./App.css";
import { db } from "./services/firebase";
import { ref, get, child } from "firebase/database";
import { useNavigate } from "react-router-dom";
import { storeSessionUser } from "./utils/sessionUser";
import SMSMFAVerification from "./Components/SMSMFAVerification";

function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [suspendedUser, setSuspendedUser] = useState(null);
  const [showMFAVerification, setShowMFAVerification] = useState(false);
  const [mfaPendingUser, setMFAPendingUser] = useState(null);

  const navigate = useNavigate();

  const sanitizeStatus = (value) =>
    String(value ?? "active").toLowerCase() === "active"
      ? "active"
      : "suspended";

  const closeSuspendedModal = () => {
    setSuspendedUser(null);
  };

  const handleMFAVerified = () => {
    // MFA verification successful
    setShowMFAVerification(false);
    storeSessionUser(mfaPendingUser, remember);
    alert(`✅ Login successful! Welcome ${mfaPendingUser.role}.`);
    setUsername("");
    setPassword("");
    setMFAPendingUser(null);
    navigate("/dashboard");
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

    try {
      const dbRef = ref(db);
      const [adminSnapshot, usersSnapshot] = await Promise.all([
        get(child(dbRef, "admin")),
        get(child(dbRef, "users")),
      ]);

      const normalizedUser = inputUser.toLowerCase();
      const normalizedPass = String(inputPass).trim();

      let authenticatedUser = null;

      if (adminSnapshot.exists()) {
        const adminData = adminSnapshot.val();
        const adminUsername = String(adminData.username ?? "").trim();
        const adminPassword = String(adminData.pass ?? "");

        if (
          adminUsername.toLowerCase() === normalizedUser &&
          adminPassword === normalizedPass
        ) {
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
        const usersData = usersSnapshot.val();
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
            const normalizedStatus = sanitizeStatus(userRecord.status);

            if (normalizedStatus !== "active") {
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
        alert("❌ Invalid username or password");
        return;
      }

      // Check if user has MFA enabled
      if (authenticatedUser.mfaEnabled) {
        // Store user temporarily and show MFA verification
        setMFAPendingUser(authenticatedUser);

        // Send SMS code
        const mockCode = Math.random().toString().slice(2, 8);
        console.log(
          `[DEMO] SMS Code sent to ${authenticatedUser.contactNumber}: ${mockCode}`
        );
        sessionStorage.setItem("mfaCode", mockCode);

        setShowMFAVerification(true);
        return;
      }

      // No MFA, proceed with login
      storeSessionUser(authenticatedUser, remember);

      alert(`✅ Login successful! Welcome ${authenticatedUser.role}.`);
      setUsername("");
      setPassword("");
      navigate("/dashboard");
    } catch (err) {
      console.error(err);
      alert("⚠️ Error connecting to Firebase");
    }
  };

  return (
    <>
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
