import React, { useState, useEffect } from "react";
import { Phone, Check, X, Loader } from "lucide-react";

const SMSMFAVerification = ({ phoneNumber, onVerify, onCancel }) => {
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resendTimer, setResendTimer] = useState(0);
  const [resendCount, setResendCount] = useState(0);

  useEffect(() => {
    // Start resend countdown
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError("Please enter a valid 6-digit code");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // In production, verify with Firebase MFA
      const storedCode = sessionStorage.getItem("mfaCode");

      if (verificationCode === storedCode) {
        sessionStorage.removeItem("mfaCode");
        onVerify(true);
      } else {
        setError("Invalid verification code. Please try again.");
      }
    } catch (err) {
      setError("Verification failed. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendTimer > 0 || resendCount >= 3) return;

    setResendCount((prev) => prev + 1);
    setError(null);

    try {
      // Send new SMS code
      const mockCode = Math.random().toString().slice(2, 8);
      console.log(`[DEMO] SMS Code sent to ${phoneNumber}: ${mockCode}`);
      sessionStorage.setItem("mfaCode", mockCode);
      setResendTimer(60);
    } catch (err) {
      setError("Failed to resend code. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-blue-100 rounded-lg">
            <Phone className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Verify with SMS
            </h2>
            <p className="text-sm text-gray-600">Two-factor authentication</p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <p className="text-gray-700 mb-4">
            We've sent a verification code to:
            <br />
            <span className="font-semibold text-blue-600">{phoneNumber}</span>
          </p>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Verification Code
            </label>
            <input
              type="text"
              placeholder="000000"
              value={verificationCode}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                setVerificationCode(value);
                setError(null);
              }}
              maxLength="6"
              autoFocus
              className="w-full px-4 py-3 text-2xl text-center tracking-widest border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none font-mono"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg flex items-center gap-2 text-sm">
              <X className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold transition"
            >
              Cancel
            </button>
            <button
              onClick={handleVerifyCode}
              disabled={loading || verificationCode.length !== 6}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-semibold transition flex items-center justify-center gap-2"
            >
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : null}
              Verify & Sign In
            </button>
          </div>

          {resendTimer > 0 ? (
            <p className="text-center text-sm text-gray-600">
              Resend code in {resendTimer}s
            </p>
          ) : (
            <button
              onClick={handleResendCode}
              disabled={resendCount >= 3}
              className="w-full text-sm text-blue-600 hover:text-blue-700 font-semibold transition disabled:text-gray-400"
            >
              {resendCount >= 3 ? "Too many resend attempts" : "Resend Code"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SMSMFAVerification;
