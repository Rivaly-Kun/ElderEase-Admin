import React, { useState, useEffect } from "react";
import { Phone, Shield, Check, X, Loader, Edit2, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { db } from "../services/firebase";
import { ref, get, update } from "firebase/database";
import useResolvedCurrentUser from "../hooks/useResolvedCurrentUser";
import SMSMFASetup from "./SMSMFASetup";

const UserSettings = () => {
  const navigate = useNavigate();
  const currentUser = useResolvedCurrentUser();

  const [userMFAData, setUserMFAData] = useState({
    mfaEnabled: false,
    phoneNumber: null,
    verifiedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [showMFASetup, setShowMFASetup] = useState(false);
  const [showMFARemove, setShowMFARemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    const fetchUserMFASettings = async () => {
      if (!currentUser?.id) return;

      try {
        setLoading(true);
        const userRef = ref(db, `users/${currentUser.id}/mfa`);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
          setUserMFAData(snapshot.val());
        }
      } catch (err) {
        console.error("Error fetching MFA settings:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserMFASettings();
  }, [currentUser]);

  const handleMFASetupComplete = async (mfaData) => {
    try {
      const userMFARef = ref(db, `users/${currentUser.id}/mfa`);
      await update(userMFARef, mfaData);
      setUserMFAData(mfaData);
      setShowMFASetup(false);
      alert("✅ SMS MFA has been enabled successfully!");
    } catch (err) {
      console.error("Error saving MFA settings:", err);
      alert("Failed to save MFA settings. Please try again.");
    }
  };

  const handleRemoveMFA = async () => {
    try {
      setRemoving(true);
      const userMFARef = ref(db, `users/${currentUser.id}/mfa`);
      await update(userMFARef, {
        mfaEnabled: false,
        phoneNumber: null,
        verifiedAt: null,
      });
      setUserMFAData({
        mfaEnabled: false,
        phoneNumber: null,
        verifiedAt: null,
      });
      setShowMFARemove(false);
      alert("✅ SMS MFA has been disabled.");
    } catch (err) {
      console.error("Error removing MFA:", err);
      alert("Failed to disable MFA. Please try again.");
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="mb-4 text-blue-600 hover:text-blue-700 font-semibold"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900">User Settings</h1>
          <p className="text-gray-600 mt-2">
            Manage your account security and preferences
          </p>
        </div>

        {/* SMS MFA Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8 border-l-4 border-blue-600">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Phone className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  SMS Two-Factor Authentication
                </h2>
                <p className="text-gray-600 mt-1">
                  Add an extra layer of security to your account
                </p>
              </div>
            </div>
            <div
              className={`px-4 py-2 rounded-lg font-semibold ${
                userMFAData.mfaEnabled
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {userMFAData.mfaEnabled ? "🔒 Enabled" : "🔓 Disabled"}
            </div>
          </div>

          {/* Current Status */}
          {userMFAData.mfaEnabled ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="flex items-center gap-2 text-green-700 font-semibold mb-2">
                  <Check className="w-5 h-5" /> SMS MFA is Active
                </p>
                <div className="space-y-2 text-sm text-gray-700">
                  <p>
                    <span className="font-semibold">Registered Phone:</span>{" "}
                    {userMFAData.phoneNumber}
                  </p>
                  <p>
                    <span className="font-semibold">Enabled Since:</span>{" "}
                    {new Date(userMFAData.verifiedAt).toLocaleDateString()} at{" "}
                    {new Date(userMFAData.verifiedAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-semibold text-blue-900 mb-2">
                  How it works:
                </h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>✓ When you sign in, you'll receive an SMS code</li>
                  <li>✓ Enter the code to complete your login</li>
                  <li>✓ Only you can sign in with your phone number</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowMFASetup(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition"
                >
                  <Edit2 className="w-4 h-4" />
                  Change Phone Number
                </button>
                <button
                  onClick={() => setShowMFARemove(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-semibold transition"
                >
                  <Trash2 className="w-4 h-4" />
                  Disable MFA
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-700">
                Protect your account by enabling SMS-based two-factor
                authentication. You'll be asked to verify with a code sent to
                your phone whenever you sign in.
              </p>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-semibold text-blue-900 mb-2">Benefits:</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>✓ Extra security even if your password is compromised</li>
                  <li>✓ Prevents unauthorized access to your account</li>
                  <li>✓ Only 30-second verification codes</li>
                </ul>
              </div>

              <button
                onClick={() => setShowMFASetup(true)}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition flex items-center justify-center gap-2"
              >
                <Phone className="w-5 h-5" />
                Enable SMS MFA Now
              </button>
            </div>
          )}
        </div>

        {/* Additional Security Tips */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-600">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-6 h-6 text-purple-600" />
              <h3 className="text-lg font-bold text-gray-900">Security Tips</h3>
            </div>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• Never share your verification codes</li>
              <li>• Keep your phone number up to date</li>
              <li>• Sign out from untrusted devices</li>
              <li>• Use a strong, unique password</li>
            </ul>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-orange-600">
            <div className="flex items-center gap-3 mb-4">
              <Phone className="w-6 h-6 text-orange-600" />
              <h3 className="text-lg font-bold text-gray-900">
                Lost Your Phone?
              </h3>
            </div>
            <p className="text-sm text-gray-700 mb-4">
              If you lose access to your registered phone number, contact your
              administrator for account recovery assistance.
            </p>
            <button
              onClick={() => alert("Contact your administrator for support.")}
              className="text-sm text-orange-600 hover:text-orange-700 font-semibold"
            >
              Request Help →
            </button>
          </div>
        </div>
      </div>

      {/* MFA Setup Modal */}
      {showMFASetup && (
        <SMSMFASetup
          user={currentUser}
          onComplete={handleMFASetupComplete}
          onCancel={() => setShowMFASetup(false)}
        />
      )}

      {/* Remove MFA Confirmation Modal */}
      {showMFARemove && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                  <X className="w-8 h-8 text-red-600" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                Disable SMS MFA?
              </h3>
              <p className="text-gray-700 mb-6">
                Are you sure you want to disable two-factor authentication? Your
                account will be less secure.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowMFARemove(false)}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold transition"
                >
                  Keep MFA
                </button>
                <button
                  onClick={handleRemoveMFA}
                  disabled={removing}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 font-semibold transition flex items-center justify-center gap-2"
                >
                  {removing ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : null}
                  Disable MFA
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserSettings;
