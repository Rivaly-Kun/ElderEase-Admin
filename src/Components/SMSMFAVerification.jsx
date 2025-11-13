import React, { useState, useEffect, useCallback } from "react";
import { Phone, Check, X, Loader } from "lucide-react";
import { auth } from "../services/firebase";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCredential,
} from "firebase/auth";

const SMSMFAVerification = ({ phoneNumber, onVerify, onCancel }) => {
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resendTimer, setResendTimer] = useState(0);
  const [resendCount, setResendCount] = useState(0);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [recaptchaVerifier, setRecaptchaVerifier] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const formatPhoneForFirebase = useCallback((rawNumber = "") => {
    let formatted = rawNumber.trim();

    if (!formatted) {
      return "";
    }

    if (!formatted.startsWith("+")) {
      if (formatted.startsWith("0")) {
        formatted = "+63" + formatted.substring(1);
      } else if (!formatted.startsWith("63")) {
        formatted = "+63" + formatted;
      } else {
        formatted = "+" + formatted;
      }
    }

    return formatted;
  }, []);

  const formatPhoneForDisplay = useCallback(
    (rawNumber = "") => {
      const formatted = formatPhoneForFirebase(rawNumber);

      if (!formatted) {
        return "";
      }

      const beautified = formatted.replace(
        /^(\+63)(\d{3})(\d{3})(\d{4})$/,
        "$1 $2 $3 $4"
      );

      return beautified || formatted;
    },
    [formatPhoneForFirebase]
  );

  // Initialize RecaptchaVerifier and send SMS on mount
  useEffect(() => {
    let isMounted = true;

    const initializeRecaptcha = async () => {
      setError(null);
      setStatusMessage("Sending verification code...");
      setIsSending(true);

      const formattedNumber = formatPhoneForFirebase(phoneNumber);
      if (!formattedNumber) {
        if (isMounted) {
          setError("Phone number is missing or invalid.");
          setStatusMessage("");
        }
        setIsSending(false);
        return;
      }

      try {
        // Clear any existing reCAPTCHA widget first
        const container = document.getElementById("recaptcha-container");
        if (container) {
          container.innerHTML = "";
        }

        // Firebase RecaptchaVerifier automatically uses the reCAPTCHA configured in Firebase Console
        console.log(
          "[Firebase SMS MFA] Initializing Firebase Phone Auth with reCAPTCHA..."
        );

        window.recaptchaVerifier = new RecaptchaVerifier(
          auth,
          "recaptcha-container",
          {
            size: "normal",
            callback: (response) => {
              console.log(
                "[Firebase SMS MFA] ✅ reCAPTCHA verified successfully"
              );
              console.log("[Firebase SMS MFA] Response token:", response);
            },
            "expired-callback": () => {
              console.log(
                "[Firebase SMS MFA] ⚠️ reCAPTCHA expired, please retry"
              );
              if (isMounted) {
                setError("reCAPTCHA expired. Please try again.");
                setStatusMessage("");
              }
            },
            "error-callback": (error) => {
              console.error("[Firebase SMS MFA] ❌ reCAPTCHA error:", error);
              if (isMounted) {
                setError("reCAPTCHA error. Please refresh the page.");
                setStatusMessage("");
              }
            },
          }
        );

        const verifier = window.recaptchaVerifier;

        console.log("[Firebase SMS MFA] Rendering reCAPTCHA...");
        await verifier.render();
        console.log("[Firebase SMS MFA] reCAPTCHA rendered successfully");
        if (isMounted) {
          setRecaptchaVerifier(verifier);
        }

        console.log(
          `[Firebase SMS MFA] Sending verification code to ${formattedNumber}`
        );

        // Send verification SMS via Firebase
        const confirmation = await signInWithPhoneNumber(
          auth,
          formattedNumber,
          verifier
        );

        if (isMounted) {
          setConfirmationResult(confirmation);
          setResendTimer(60);
          setStatusMessage(
            `Verification code sent. Please check the SMS we sent to ${
              formatPhoneForDisplay(phoneNumber) || formattedNumber
            }.`
          );
        }

        console.log("[Firebase SMS MFA] ✅ SMS sent successfully");
      } catch (err) {
        console.error("[Firebase SMS MFA] Error sending SMS:", err);

        if (isMounted) {
          // Provide specific error messages based on error code
          let errorMessage = "Failed to send verification code.";

          if (err.code === "auth/invalid-phone-number") {
            errorMessage =
              "Invalid phone number format. Please check and try again.";
          } else if (err.code === "auth/missing-phone-number") {
            errorMessage = "Phone number is required.";
          } else if (err.code === "auth/quota-exceeded") {
            errorMessage = "SMS quota exceeded. Please try again later.";
          } else if (err.code === "auth/too-many-requests") {
            errorMessage =
              "Too many verification attempts. Please wait and try again later.";
          } else if (err.code === "auth/invalid-app-credential") {
            errorMessage =
              "❌ Firebase Phone Auth not configured properly.\n\n" +
              "Please follow these steps:\n" +
              "1. Go to Firebase Console → Authentication → Sign-in method\n" +
              "2. Enable 'Phone' provider\n" +
              "3. Add 'localhost' to authorized domains\n" +
              "4. Make sure your Firebase project is on Spark or Blaze plan\n\n" +
              "Error details: " +
              err.message;
          } else if (err.code === "auth/captcha-check-failed") {
            errorMessage =
              "reCAPTCHA verification failed. Please refresh and try again.";
          } else if (err.code === "auth/network-request-failed") {
            errorMessage =
              "Network error while sending the code. Please check your connection and try again.";
          } else if (
            err.code === "auth/internal-error" ||
            err.code === "auth/error-code:-39"
          ) {
            errorMessage =
              "The verification service is temporarily unavailable. Please wait a moment and try again.";
          } else {
            errorMessage = `Error: ${
              err.message || err.code || "Unknown error"
            }`;
          }

          setStatusMessage("");
          setError(errorMessage);
        }
      } finally {
        if (isMounted) {
          setIsSending(false);
        }
      }
    };

    initializeRecaptcha();

    // Timer for resend countdown
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      isMounted = false;
      clearInterval(timer);
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
          window.recaptchaVerifier = null;
        } catch (error) {
          console.log("[Firebase SMS MFA] Error clearing reCAPTCHA:", error);
        }
      }
    };
  }, [phoneNumber, formatPhoneForDisplay, formatPhoneForFirebase]);

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError("Please enter a valid 6-digit code");
      return;
    }

    if (!confirmationResult) {
      setError("No verification session found. Please resend code.");
      return;
    }

    setLoading(true);
    setError(null);
    setStatusMessage("Verifying code...");

    try {
      console.log("[Firebase SMS MFA] Verifying code...");
      // Verify the SMS code with Firebase
      await confirmationResult.confirm(verificationCode);
      console.log("[Firebase SMS MFA] ✅ Code verified successfully");
      setStatusMessage("Code verified! Signing you in...");
      onVerify(true);
    } catch (err) {
      console.error("[Firebase SMS MFA] Verification error:", err);
      setError("Invalid verification code. Please try again.");
      setStatusMessage("");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendTimer > 0) {
      return;
    }

    if (resendCount >= 3) {
      setStatusMessage(
        "You have reached the maximum number of resend attempts. Please wait and try again later."
      );
      return;
    }

    setIsResending(true);
    setStatusMessage("Sending a new verification code...");
    setResendCount((prev) => prev + 1);
    setError(null);

    try {
      const formattedNumber = formatPhoneForFirebase(phoneNumber);

      if (!formattedNumber) {
        setError("Phone number is missing or invalid.");
        setStatusMessage("");
        setResendCount((prev) => Math.max(prev - 1, 0));
        return;
      }

      console.log(
        `[Firebase SMS MFA] Resending verification code to ${formattedNumber}`
      );

      // Clear existing reCAPTCHA and create new one for resend
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
      }

      const container = document.getElementById("recaptcha-container");
      if (container) {
        container.innerHTML = "";
      }

      window.recaptchaVerifier = new RecaptchaVerifier(
        auth,
        "recaptcha-container",
        {
          size: "normal",
          callback: () => {
            console.log("[Firebase SMS MFA] ✅ reCAPTCHA verified (resend)");
          },
          "expired-callback": () => {
            console.log("[Firebase SMS MFA] ⚠️ reCAPTCHA expired (resend)");
            setError("reCAPTCHA expired. Please try again.");
            setStatusMessage("");
          },
          "error-callback": (error) => {
            console.error(
              "[Firebase SMS MFA] ❌ reCAPTCHA error (resend):",
              error
            );
            setError("reCAPTCHA error. Please refresh the page.");
            setStatusMessage("");
          },
        }
      );

      const newVerifier = window.recaptchaVerifier;
      await newVerifier.render();
      setRecaptchaVerifier(newVerifier);

      // Resend verification SMS via Firebase
      const confirmation = await signInWithPhoneNumber(
        auth,
        formattedNumber,
        newVerifier
      );

      setConfirmationResult(confirmation);
      setResendTimer(60);
      setStatusMessage(
        `A new verification code was sent to ${
          formatPhoneForDisplay(phoneNumber) || formattedNumber
        }.`
      );
      console.log("[Firebase SMS MFA] ✅ SMS resent successfully");
    } catch (err) {
      console.error("[Firebase SMS MFA] Error resending SMS:", err);

      setResendCount((prev) => Math.max(prev - 1, 0));

      let errorMessage = "Failed to resend code.";
      if (err.code === "auth/invalid-app-credential") {
        errorMessage =
          "Firebase Phone Auth not configured. Please check Firebase Console settings.";
      } else if (err.code === "auth/quota-exceeded") {
        errorMessage = "SMS quota exceeded. Please try again later.";
      } else if (err.code === "auth/too-many-requests") {
        errorMessage =
          "Too many resend attempts detected. Please wait before trying again.";
      } else if (err.code === "auth/network-request-failed") {
        errorMessage =
          "Network error while resending. Please check your connection and try again.";
      } else if (
        err.code === "auth/internal-error" ||
        err.code === "auth/error-code:-39"
      ) {
        errorMessage =
          "The verification service is temporarily unavailable. Please wait a moment and try again.";
      } else {
        errorMessage = `Error: ${err.message || "Please try again."}`;
      }

      setStatusMessage("");
      setError(errorMessage);
    } finally {
      setIsResending(false);
    }
  };

  const isSmsPending = isSending || isResending;

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
            <span className="font-semibold text-blue-600">
              {formatPhoneForDisplay(phoneNumber) || phoneNumber}
            </span>
          </p>

          {statusMessage && (
            <div
              className={`p-3 mb-4 rounded-lg border text-sm flex items-start gap-2 ${
                isSmsPending
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "bg-green-50 border-green-200 text-green-700"
              }`}
              role="status"
              aria-live="polite"
            >
              {isSmsPending ? (
                <Loader className="w-4 h-4 mt-0.5 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mt-0.5" />
              )}
              <span>{statusMessage}</span>
            </div>
          )}

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
            <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
              <div className="flex items-start gap-2">
                <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="whitespace-pre-line">{error}</div>
              </div>
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
              disabled={
                loading || isSmsPending || verificationCode.length !== 6
              }
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-semibold transition flex items-center justify-center gap-2"
            >
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : null}
              {loading ? "Verifying..." : "Verify & Sign In"}
            </button>
          </div>

          {resendTimer > 0 ? (
            <p className="text-center text-sm text-gray-600">
              Resend code in {resendTimer}s
            </p>
          ) : (
            <button
              onClick={handleResendCode}
              disabled={resendCount >= 3 || isResending}
              className="w-full text-sm text-blue-600 hover:text-blue-700 font-semibold transition disabled:text-gray-400"
            >
              {resendCount >= 3 ? (
                "Too many resend attempts"
              ) : isResending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" />
                  Sending new code...
                </span>
              ) : (
                "Resend Code"
              )}
            </button>
          )}

          {/* reCAPTCHA container - visible for debugging */}
          <div className="mt-4 flex justify-center">
            <div id="recaptcha-container" className="flex justify-center"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SMSMFAVerification;
