// INTEGRATION GUIDE FOR App.jsx
// This shows how to integrate SMS MFA into your existing login flow

import { useState } from "react";
import "./App.css";
import { db } from "./services/firebase";
import { ref, get, child } from "firebase/database";
import { useNavigate } from "react-router-dom";
import { storeSessionUser } from "./utils/sessionUser";
import SMSMFAVerification from "./Components/SMSMFAVerification"; // ADD THIS IMPORT

function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [suspendedUser, setSuspendedUser] = useState(null);

  // ADD THESE NEW STATES FOR MFA
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

  // ADD THIS NEW HANDLER FUNCTION
  const handleMFAVerified = (isVerified) => {
    if (isVerified && mfaPendingUser) {
      // Complete login process
      storeSessionUser(mfaPendingUser, remember);
      alert(`✅ Login successful! Welcome ${mfaPendingUser.role}.`);
      setUsername("");
      setPassword("");
      setShowMFAVerification(false);
      setMFAPendingUser(null);
      navigate("/dashboard");
    }
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
              // ADD MFA INFO
              mfaEnabled: userRecord.mfaEnabled || false,
              phoneNumber: userRecord.phoneNumber || null,
            };
            break;
          }
        }
      }

      if (!authenticatedUser) {
        alert("❌ Invalid username or password");
        return;
      }

      // ADD MFA CHECK HERE
      if (authenticatedUser.mfaEnabled && authenticatedUser.phoneNumber) {
        // Show MFA verification instead of signing in directly
        setMFAPendingUser(authenticatedUser);
        setShowMFAVerification(true);
        return;
      }

      // ORIGINAL LOGIN FLOW (NO MFA)
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
        {/* ... YOUR EXISTING LOGIN FORM UI ... */}
        {/* Keep all existing JSX here */}

        {/* ADD THIS AT THE END OF YOUR JSX, BEFORE CLOSING DIV */}
        {showMFAVerification && mfaPendingUser && (
          <SMSMFAVerification
            phoneNumber={mfaPendingUser.phoneNumber}
            onVerify={handleMFAVerified}
            onCancel={() => {
              setShowMFAVerification(false);
              setMFAPendingUser(null);
              setPassword(""); // Clear password for security
            }}
          />
        )}
      </div>
    </>
  );
}

export default App;

/*
 * INTEGRATION CHECKLIST:
 *
 * ✅ 1. Import SMSMFAVerification component
 * ✅ 2. Add showMFAVerification and mfaPendingUser state
 * ✅ 3. Add handleMFAVerified function
 * ✅ 4. Add mfaEnabled and phoneNumber to authenticatedUser object
 * ✅ 5. Add MFA check after password verification
 * ✅ 6. Add SMSMFAVerification component to JSX
 * ✅ 7. Add route to /settings page for UserSettings component
 * ✅ 8. Update header/navigation with Settings button
 * ✅ 9. Test with a test user
 * ✅ 10. Configure Firebase SMS MFA
 *
 * DATABASE STRUCTURE NEEDED:
 *
 * users/
 *   {userId}/
 *     mfaEnabled: boolean
 *     phoneNumber: string
 *     verifiedAt: timestamp (optional)
 *
 * OR if you want to store MFA in separate node:
 *
 * users/
 *   {userId}/
 *     mfa/
 *       mfaEnabled: boolean
 *       phoneNumber: string
 *       verifiedAt: timestamp
 *
 * OPTIONAL FEATURES TO ADD:
 *
 * - Add MFA status badge in Header
 * - Show MFA setup prompt on first login
 * - Add MFA recovery codes
 * - Add backup phone number
 * - Add biometric as fallback
 * - Admin dashboard to manage user MFA
 * - Audit logs for MFA events
 */
