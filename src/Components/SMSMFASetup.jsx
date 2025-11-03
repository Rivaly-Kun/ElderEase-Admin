import React, { useState } from "react";
import { Phone, Check, X, Loader } from "lucide-react";

const SMSMFASetup = ({ user, onComplete, onCancel }) => {
  const [step, setStep] = useState("phone"); // phone, verify, success
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resendCount, setResendCount] = useState(0);
  const [resendTimer, setResendTimer] = useState(0);

  // Format phone number
  const formatPhoneNumber = (value) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length === 0) return "";
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6)
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(
      6,
      10
    )}`;
  };

  const handlePhoneChange = (e) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneNumber(formatted);
    setError(null);
  };

  const validatePhoneNumber = (phone) => {
    const cleaned = phone.replace(/\D/g, "");
    return cleaned.length === 10 && cleaned.startsWith("9");
  };

  const handleSendCode = async () => {
    if (!validatePhoneNumber(phoneNumber)) {
      setError("Please enter a valid 10-digit phone number starting with 9");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Here you would call Firebase MFA API
      // For now, we'll simulate it
      const mockCode = Math.random().toString().slice(2, 8);
      console.log(
        `[DEMO] SMS Code would be sent to ${phoneNumber}: ${mockCode}`
      );

      // Store for verification (in production, this would be handled by Firebase)
      sessionStorage.setItem("mfaCode", mockCode);
      sessionStorage.setItem("mfaPhone", phoneNumber);

      setStep("verify");
      setResendTimer(60);

      // Countdown timer
      const timer = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError("Failed to send verification code. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError("Please enter a valid 6-digit code");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Verify with Firebase MFA
      const storedCode = sessionStorage.getItem("mfaCode");

      if (verificationCode === storedCode) {
        // In production, this would be handled by Firebase
        sessionStorage.removeItem("mfaCode");
        sessionStorage.removeItem("mfaPhone");

        setStep("success");
        setTimeout(() => {
          onComplete({
            mfaEnabled: true,
            phoneNumber,
            verifiedAt: new Date().toISOString(),
          });
        }, 2000);
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
    if (resendTimer > 0) return;

    setResendCount((prev) => prev + 1);
    if (resendCount >= 3) {
      setError("Too many resend attempts. Please try again later.");
      return;
    }

    await handleSendCode();
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
            <h2 className="text-2xl font-bold text-gray-900">SMS MFA Setup</h2>
            <p className="text-sm text-gray-600">
              Add extra security to your account
            </p>
          </div>
        </div>

        {/* Step 1: Phone Number */}
        {step === "phone" && (
          <div className="space-y-4">
            <p className="text-gray-700 mb-4">
              Enter your phone number to receive verification codes via SMS.
            </p>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Phone Number
              </label>
              <div className="flex gap-2">
                <span className="flex items-center px-3 bg-gray-100 rounded-lg text-gray-600 font-semibold">
                  +63
                </span>
                <input
                  type="tel"
                  placeholder="9XX-XXX-XXXX"
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  maxLength="12"
                  className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                />
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Enter 10-digit mobile number starting with 9
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg flex items-center gap-2">
                <X className="w-4 h-4" />
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSendCode}
                disabled={loading || !phoneNumber}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-semibold transition flex items-center justify-center gap-2"
              >
                {loading ? <Loader className="w-4 h-4 animate-spin" /> : null}
                Send Code
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Verify Code */}
        {step === "verify" && (
          <div className="space-y-4">
            <p className="text-gray-700 mb-4">
              We've sent a 6-digit code to{" "}
              <span className="font-semibold">{phoneNumber}</span>
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
                className="w-full px-4 py-2 text-2xl text-center tracking-widest border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none font-mono"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg flex items-center gap-2">
                <X className="w-4 h-4" />
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setStep("phone")}
                className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold transition"
              >
                Back
              </button>
              <button
                onClick={handleVerifyCode}
                disabled={loading || verificationCode.length !== 6}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-semibold transition flex items-center justify-center gap-2"
              >
                {loading ? <Loader className="w-4 h-4 animate-spin" /> : null}
                Verify
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
                Resend Code
              </button>
            )}
          </div>
        )}

        {/* Step 3: Success */}
        {step === "success" && (
          <div className="text-center space-y-4">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-900">
              SMS MFA Enabled!
            </h3>
            <p className="text-gray-700">
              Your account is now protected with two-factor authentication.
              You'll need to verify with SMS when signing in.
            </p>
            <div className="p-3 bg-blue-100 text-blue-700 rounded-lg text-sm">
              <p className="font-semibold mb-1">✓ Registered Phone:</p>
              <p>{phoneNumber}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SMSMFASetup;
