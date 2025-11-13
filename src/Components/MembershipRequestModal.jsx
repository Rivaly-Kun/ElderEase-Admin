import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  Users,
  Check,
  AlertCircle,
  RefreshCw,
  Clock,
  User,
  Phone,
  MapPin,
  Cake,
  Mail,
  FileText,
  Trash2,
  Plus,
} from "lucide-react";
import { ref as dbRef, push, set, remove, get } from "firebase/database";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { db } from "../services/firebase";
import useResolvedCurrentUser from "../hooks/useResolvedCurrentUser";
import { createAuditLogger } from "../utils/AuditLogger";

const FieldGroup = ({ label, required = false, hint, children, className }) => (
  <div
    className={`flex flex-col gap-1 text-xs font-semibold text-gray-700 ${
      className || ""
    }`}
  >
    <span>
      {label}
      {required ? <span className="text-red-500">*</span> : null}
    </span>
    {hint ? (
      <span className="text-sm font-bold text-orange-600">{hint}</span>
    ) : null}
    {children}
  </div>
);

FieldGroup.defaultProps = {
  required: false,
  hint: undefined,
  className: "",
};

const shuffleCharacters = (input = "") => {
  const chars = input.split("");
  if (chars.length <= 1) return input;
  const randomArray = new Uint32Array(chars.length);
  getCryptoRandomValues(randomArray);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomArray[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};

const getCryptoRandomValues = (array) => {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    return window.crypto.getRandomValues(array);
  }
  for (let i = 0; i < array.length; i += 1) {
    array[i] = Math.floor(Math.random() * 256);
  }
  return array;
};

const createSecureRandomString = (
  length = 8,
  charset = "abcdefghijklmnopqrstuvwxyz0123456789"
) => {
  const result = [];
  const array = new Uint32Array(length);
  getCryptoRandomValues(array);
  for (let i = 0; i < length; i += 1) {
    result.push(charset[array[i] % charset.length]);
  }
  return result.join("");
};

const generateSecurePassword = (length = 12) => {
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = lowercase.toUpperCase();
  const digits = "0123456789";
  const symbols = "!@#$%^&*";
  const allChars = `${lowercase}${uppercase}${digits}${symbols}`;

  const requiredChars = [
    createSecureRandomString(1, lowercase),
    createSecureRandomString(1, uppercase),
    createSecureRandomString(1, digits),
    createSecureRandomString(1, symbols),
  ];

  const remainingLength = Math.max(length - requiredChars.length, 0);
  const randomTail = createSecureRandomString(remainingLength, allChars).split(
    ""
  );
  const passwordChars = requiredChars.concat(randomTail);
  const password = shuffleCharacters(passwordChars.join(""));
  return password.slice(0, length);
};

const generateMemberCredentials = ({ lastName, oscaID }) => {
  const baseName = (lastName || "member")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
  const baseId = (oscaID || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
  const uniqueChunk = createSecureRandomString(4);
  const emailSegments = [
    baseName || "senior",
    (baseId || uniqueChunk).slice(-4),
    uniqueChunk,
  ];
  const email = `${emailSegments.filter(Boolean).join("-")}@elderease.com`;
  const password = generateSecurePassword(14);
  return { email, password };
};

const MembershipRequestModal = ({
  isOpen,
  onClose,
  requestId,
  requestData,
  onAccepted,
}) => {
  const { currentUser } = useResolvedCurrentUser();
  const actorId = currentUser?.uid || currentUser?.id || "unknown";
  const actorLabel =
    currentUser?.actorLabel ||
    currentUser?.displayName ||
    currentUser?.email ||
    "Unknown";
  const actorRole = currentUser?.role || currentUser?.roleName || "Unknown";

  const auditLogger = useMemo(
    () => createAuditLogger(actorId, actorLabel, actorRole),
    [actorId, actorLabel, actorRole]
  );

  const inputControlClass =
    "w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Helper to normalize medical conditions from string or array
  const normalizeMedConditions = useCallback((medConds) => {
    if (Array.isArray(medConds)) {
      return medConds
        .map((c) => (typeof c === "string" ? c.trim() : c))
        .filter((c) => typeof c === "string" && c.length > 0);
    }
    if (typeof medConds === "string" && medConds.trim()) {
      return medConds
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
    }
    return [];
  }, []);

  // Pre-filled from request
  const [formData, setFormData] = useState({
    oscaID: (requestData?.oscaID || requestData?.memberOscaId || "").toString(),
    memberOscaId: requestData?.memberOscaId || "",
    firstName: requestData?.firstName || "",
    middleName: requestData?.middleName || "",
    lastName: requestData?.lastName || "",
    suffix: requestData?.suffix || "",
    gender: requestData?.gender || "",
    civilStat: requestData?.civilStat || "",
    birthday: requestData?.birthday || "",
    placeOfBirth: requestData?.placeOfBirth || "",
    nationality: requestData?.nationality || "Filipino",
    citizenship: requestData?.citizenship || "Filipino",
    contactNum: requestData?.contactNum || "",
    address: requestData?.address || "",
    bloodType: requestData?.bloodType || "",
    religion: requestData?.religion || "",
    educAttain: requestData?.educAttain || "",
    disabilities: requestData?.disabilities || "",
    medConditions: normalizeMedConditions(requestData?.medConditions),
    healthFacility: requestData?.healthFacility || "",
    emergencyHospital: requestData?.emergencyHospital || "",
    bedridden: requestData?.bedridden || "No",
    dswdPensioner: requestData?.dswdPensioner || "No",
    dswdWithATM: requestData?.dswdWithATM || "No",
    localSeniorPensioner: requestData?.localSeniorPensioner || "No",
    emergencyContactName: requestData?.emergencyContactName || "",
    emergencyContactAddress: requestData?.emergencyContactAddress || "",
    emergencyContactNum: requestData?.emergencyContactNum || "",
    emergencyContactRelation: requestData?.emergencyContactRelation || "",
    philHealth: requestData?.philHealth || "",
    sssId: requestData?.sssId || "",
    nationalId: requestData?.nationalId || "",
    barangayId: requestData?.barangayId || "",
    tin: requestData?.tin || "",
    dateIssue: "",
    dateExpiration: "",
    email: requestData?.email || "",
  });

  const refreshCredentials = useCallback(() => {
    const cleanedLastName = formData.lastName?.trim();
    const rawOscaId = (
      formData.oscaID ||
      formData.memberOscaId ||
      ""
    ).toString();
    const cleanedOscaId = rawOscaId.trim();

    if (!cleanedLastName || !cleanedOscaId) {
      console.warn(
        "⚠️ [DEBUG] Cannot refresh credentials - missing lastName or oscaID:",
        {
          lastName: cleanedLastName,
          oscaID: cleanedOscaId,
        }
      );
      setEmail("");
      setPassword("");
      return;
    }

    const { email: generatedEmail, password: generatedPassword } =
      generateMemberCredentials({
        lastName: cleanedLastName,
        oscaID: cleanedOscaId,
      });

    console.log("🔄 [DEBUG] Credentials refreshed:", {
      email: generatedEmail,
      password: generatedPassword ? "***" : "FAILED",
      oscaID: cleanedOscaId,
    });

    setFormData((prev) => ({
      ...prev,
      oscaID: cleanedOscaId,
      memberOscaId: cleanedOscaId,
    }));
    setEmail(generatedEmail);
    setPassword(generatedPassword);
  }, [formData.lastName, formData.oscaID, formData.memberOscaId]);

  // Auto-generate credentials when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const cleanedLastName = formData.lastName?.trim();
    const cleanedOscaId = (formData.oscaID || "").trim();

    if (cleanedLastName && cleanedOscaId) {
      console.log("� [DEBUG] Auto-generating credentials", {
        lastName: cleanedLastName,
        oscaID: cleanedOscaId,
      });
      refreshCredentials();
    } else {
      console.warn("⚠️ [DEBUG] Cannot auto-generate credentials:", {
        isOpen,
        hasLastName: !!cleanedLastName,
        hasOscaID: !!cleanedOscaId,
      });
      if (!cleanedOscaId) {
        setEmail("");
        setPassword("");
      }
    }
  }, [
    isOpen,
    formData.lastName,
    formData.oscaID,
    formData.memberOscaId,
    refreshCredentials,
  ]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === "oscaID" || name === "memberOscaId") {
      const updatedValue = value.toString();
      console.log("✏️ [DEBUG] OSCA ID input changed:", updatedValue);
      setFormData((prev) => ({
        ...prev,
        oscaID: updatedValue,
        memberOscaId: updatedValue,
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Medical conditions handlers
  const addMedCondition = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      medConditions: [...(prev.medConditions || []), ""],
    }));
  }, []);

  const updateMedCondition = useCallback((index, value) => {
    setFormData((prev) => ({
      ...prev,
      medConditions: prev.medConditions.map((condition, i) =>
        i === index ? value : condition
      ),
    }));
  }, []);

  const removeMedCondition = useCallback((index) => {
    setFormData((prev) => ({
      ...prev,
      medConditions: prev.medConditions.filter((_, i) => i !== index),
    }));
  }, []);

  const validateForm = () => {
    const trimmedOscaId = (formData.oscaID || "").trim();

    if (!trimmedOscaId) {
      console.warn("⚠️ [DEBUG] Validation failed: OSCA ID missing");
      setError("Please assign an OSCA ID");
      return false;
    }

    // Check required fields
    if (!formData.dateIssue) {
      console.warn("⚠️ [DEBUG] Validation failed: Date of Issue missing");
      setError("Please set a Date of Issue");
      return false;
    }

    if (!formData.dateExpiration) {
      console.warn("⚠️ [DEBUG] Validation failed: Date of Expiration missing");
      setError("Please set a Date of Expiration");
      return false;
    }

    if (!email || !password) {
      console.warn("⚠️ [DEBUG] Validation failed: Email or password missing", {
        email: !!email,
        password: !!password,
      });
      setError("Failed to generate credentials");
      return false;
    }

    console.log("✅ [DEBUG] All validations passed");
    return true;
  };

  const handleAccept = async () => {
    if (
      !window.confirm(
        "Are you sure you want to approve this membership request?"
      )
    ) {
      return;
    }

    setError("");
    setSuccess(false);

    console.log("🔍 [DEBUG] handleAccept triggered");
    console.log("📋 [DEBUG] Form data:", formData);
    console.log("📧 [DEBUG] Email:", email);
    console.log("🔐 [DEBUG] Password:", password ? "***" : "MISSING");
    console.log(" [DEBUG] OSCA ID:", (formData.oscaID || "").trim());

    if (!validateForm()) return;

    console.log("✅ [DEBUG] Form validation passed");

    setLoading(true);

    try {
      const auth = getAuth();
      console.log("🔐 [DEBUG] Auth instance obtained:", !!auth);

      // 1. Create user in Firebase Auth (EXACTLY like AddMemberModal)
      console.log("📝 [DEBUG] Creating Firebase Auth user with email:", email);
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const uid = userCredential.user.uid;
      console.log(
        "✅ [DEBUG] Firebase Auth user created successfully. UID:",
        uid
      );

      // 2. Prepare member data (EXACTLY like AddMemberModal)
      const normalizedOscaId = (formData.oscaID || "").trim();

      const memberData = {
        ...formData,
        oscaID: normalizedOscaId,
        memberOscaId: normalizedOscaId,
        medConditions: formData.medConditions
          .filter((c) => c.trim())
          .join(", "),
        age: parseInt(requestData?.age) || 60,
        barangay: "Pinagbuhatan",
        email, // store generated email
        password, // store generated password
        authUid: uid, // link to Firebase Auth
        archived: true,
        deceased: false,
        createdBy: actorLabel,
        createdById: actorId,
        createdByRole: actorRole,
        updatedBy: actorLabel,
        updatedById: actorId,
        lastActionByRole: actorRole,
        date_created: new Date().toISOString(),
        date_updated: new Date().toISOString(),
      };
      console.log("📦 [DEBUG] Member data prepared:", memberData);

      // 3. Save member data to Realtime Database
      const membersRef = dbRef(db, "members");
      const newMemberRef = push(membersRef);
      console.log("📍 [DEBUG] New member reference path:", newMemberRef.path);
      console.log("💾 [DEBUG] Saving member to Realtime Database...");
      await set(newMemberRef, memberData);
      console.log(
        "✅ [DEBUG] Member saved to Realtime Database. Key:",
        newMemberRef.key
      );

      const memberName = `${formData.firstName} ${formData.lastName}`.trim();
      console.log("🎖️ [DEBUG] Logging audit trail for member:", memberName);
      await auditLogger.logMemberCreated(
        newMemberRef.key,
        memberName || formData.oscaID || newMemberRef.key,
        memberData
      );
      console.log("✅ [DEBUG] Audit log created");

      // 4. Remove from requests
      const requestRef = dbRef(db, `createaccreq/${requestId}`);
      console.log(
        "🗑️ [DEBUG] Removing request from database. RequestId:",
        requestId
      );
      await remove(requestRef);
      console.log("✅ [DEBUG] Request removed from database");

      setSuccess(true);
      console.log("✅ [DEBUG] Success state set. Member creation complete!");

      setTimeout(() => {
        if (onAccepted) onAccepted();
        onClose();
        // Reset form
        setEmail("");
        setPassword("");
        setFormData({
          oscaID: "",
          memberOscaId: "",
          firstName: "",
          middleName: "",
          lastName: "",
          suffix: "",
          gender: "",
          civilStat: "",
          birthday: "",
          placeOfBirth: "",
          nationality: "Filipino",
          citizenship: "Filipino",
          contactNum: "",
          address: "",
          bloodType: "",
          religion: "",
          educAttain: "",
          disabilities: "",
          medConditions: [],
          healthFacility: "",
          emergencyHospital: "",
          bedridden: "No",
          dswdPensioner: "No",
          dswdWithATM: "No",
          localSeniorPensioner: "No",
          emergencyContactName: "",
          emergencyContactAddress: "",
          emergencyContactNum: "",
          emergencyContactRelation: "",
          philHealth: "",
          sssId: "",
          nationalId: "",
          barangayId: "",
          tin: "",
          dateIssue: "",
          dateExpiration: "",
          email: "",
        });
      }, 2000);
    } catch (err) {
      console.error("❌ [DEBUG] Error in handleAccept:", err);
      console.error("📌 [DEBUG] Error code:", err.code);
      console.error("📌 [DEBUG] Error message:", err.message);
      console.error(
        "📌 [DEBUG] Full error object:",
        JSON.stringify(err, null, 2)
      );
      console.error("📌 [DEBUG] Auth email that failed:", email);
      console.error("📌 [DEBUG] Request ID:", requestId);
      setError(err.message || "Failed to accept membership request");
    } finally {
      setLoading(false);
      console.log("🏁 [DEBUG] Loading state cleared");
    }
  };
  const handleReject = async () => {
    if (!window.confirm("Are you sure you want to reject this request?")) {
      return;
    }

    const shouldNotify = window.confirm(
      "Do you want to send a notification to the applicant about this rejection?"
    );

    setLoading(true);
    try {
      const requestRef = dbRef(db, `createaccreq/${requestId}`);
      await remove(requestRef);

      await auditLogger.logAction({
        action: "REJECT_MEMBERSHIP_REQUEST",
        resourceType: "membership_request",
        resourceId: requestId,
        details: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          notificationSent: shouldNotify,
        },
      });

      if (shouldNotify) {
        // Show notification confirmation
        alert(
          `Rejection notification will be sent to ${formData.firstName} ${formData.lastName}. ` +
            `Please use the Notification Management to send the notification.`
        );
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Error rejecting request:", err);
      setError(err.message || "Failed to reject membership request");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const createdDate = requestData?.createdAt
    ? new Date(requestData.createdAt).toLocaleDateString()
    : "Unknown";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Clock className="w-6 h-6 text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800">
                  Membership Request
                </h2>
              </div>
              <p className="text-sm text-gray-500">
                Review and accept this membership application
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
              disabled={loading}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {error && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border-l-4 border-red-600">
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <AlertCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-red-800 mb-2">
                        Error
                      </h3>
                      <p className="text-red-700 text-base leading-relaxed">
                        {error}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setError("")}
                    className="mt-6 w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-semibold"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          )}

          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
              <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-800">
                Membership request processed successfully!
              </p>
            </div>
          )}

          {/* Request Info Card */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 mb-6">
            <h3 className="text-sm font-bold text-blue-900 mb-3 uppercase">
              Request Information
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <p className="text-xs text-gray-600 font-semibold">
                  Request ID
                </p>
                <p className="text-sm font-mono text-gray-900 break-all">
                  {requestId}
                </p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <p className="text-xs text-gray-600 font-semibold">Submitted</p>
                <p className="text-sm text-gray-900">{createdDate}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <p className="text-xs text-gray-600 font-semibold">Status</p>
                <p className="text-sm text-blue-600 font-semibold">
                  Pending Review
                </p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <p className="text-xs text-gray-600 font-semibold">Age</p>
                <p className="text-sm text-gray-900">
                  {requestData?.age || "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Personal Information */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 mb-6">
            <h3 className="text-sm font-bold text-blue-900 mb-3 uppercase">
              Personal Information (Read-Only)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <FieldGroup label="First Name">
                <input
                  type="text"
                  value={formData.firstName}
                  readOnly
                  className={inputControlClass}
                />
              </FieldGroup>
              <FieldGroup label="Middle Name">
                <input
                  type="text"
                  value={formData.middleName}
                  readOnly
                  className={inputControlClass}
                />
              </FieldGroup>
              <FieldGroup label="Last Name">
                <input
                  type="text"
                  value={formData.lastName}
                  readOnly
                  className={inputControlClass}
                />
              </FieldGroup>
              <FieldGroup label="Gender">
                <input
                  type="text"
                  value={formData.gender}
                  readOnly
                  className={inputControlClass}
                />
              </FieldGroup>
              <FieldGroup label="Civil Status">
                <input
                  type="text"
                  value={formData.civilStat}
                  readOnly
                  className={inputControlClass}
                />
              </FieldGroup>
              <FieldGroup label="Age">
                <input
                  type="text"
                  value={requestData?.age || "—"}
                  readOnly
                  className={inputControlClass}
                />
              </FieldGroup>
              <FieldGroup label="Birthday">
                <input
                  type="text"
                  value={formData.birthday}
                  readOnly
                  className={inputControlClass}
                />
              </FieldGroup>
              <FieldGroup label="Place of Birth">
                <input
                  type="text"
                  value={formData.placeOfBirth}
                  readOnly
                  className={inputControlClass}
                />
              </FieldGroup>
            </div>
          </div>

          {/* Contact Information */}
          <div className="bg-green-50 rounded-xl p-4 border border-green-200 mb-6">
            <h3 className="text-sm font-bold text-green-900 mb-3 uppercase">
              Contact Information (Read-Only)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldGroup label="Contact Number">
                <input
                  type="text"
                  value={formData.contactNum}
                  readOnly
                  className={inputControlClass}
                />
              </FieldGroup>
              <FieldGroup label="Email">
                <input
                  type="email"
                  value={formData.email}
                  readOnly
                  className={inputControlClass}
                />
              </FieldGroup>
              <FieldGroup label="Address" className="md:col-span-2">
                <textarea
                  value={formData.address}
                  readOnly
                  className={`${inputControlClass} resize-y min-h-[72px]`}
                />
              </FieldGroup>
            </div>
          </div>

          {/* Health & Status Information */}
          <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200 mb-6">
            <h3 className="text-sm font-bold text-yellow-900 mb-3 uppercase">
              Health & Status Information (Read-Only)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <FieldGroup label="Disabilities">
                <input
                  type="text"
                  value={formData.disabilities}
                  readOnly
                  className={inputControlClass}
                />
              </FieldGroup>
              <FieldGroup label="Bedridden">
                <input
                  type="text"
                  value={formData.bedridden}
                  readOnly
                  className={inputControlClass}
                />
              </FieldGroup>
              <FieldGroup label="DSWD Pensioner">
                <input
                  type="text"
                  value={formData.dswdPensioner}
                  readOnly
                  className={inputControlClass}
                />
              </FieldGroup>
            </div>
          </div>

          {/* Medical Conditions - Editable Array */}
          <div className="bg-red-50 rounded-xl p-4 border border-red-200 mb-6">
            <h3 className="text-sm font-bold text-red-900 mb-3 uppercase">
              Medical Conditions
            </h3>
            <div className="space-y-2">
              {formData.medConditions && formData.medConditions.length > 0 ? (
                formData.medConditions.map((condition, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={condition}
                      onChange={(e) =>
                        updateMedCondition(index, e.target.value)
                      }
                      placeholder="Enter medical condition"
                      className={inputControlClass}
                    />
                    <button
                      onClick={() => removeMedCondition(index)}
                      type="button"
                      className="px-3 py-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg transition flex items-center gap-1"
                      title="Remove condition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 italic">
                  No medical conditions added
                </p>
              )}
              <button
                onClick={addMedCondition}
                type="button"
                className="mt-2 px-3 py-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg transition flex items-center gap-2 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Condition
              </button>
            </div>
          </div>

          {/* Credentials & Required Fields */}
          <div className="bg-purple-50 rounded-xl p-4 border border-purple-200 mb-6">
            <h3 className="text-sm font-bold text-purple-900 mb-3 uppercase">
              Generated Credentials
            </h3>
            <p className="text-xs text-purple-800 mb-3">
              These credentials will be created when you accept this request.
            </p>
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between bg-white px-3 py-2 rounded-md border border-gray-200">
                <span className="font-medium text-gray-700">OSCA ID</span>
                <span className="text-gray-900 font-mono text-sm">
                  {(formData.oscaID || "").trim() || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between bg-white px-3 py-2 rounded-md border border-gray-200">
                <span className="font-medium text-gray-700">Email</span>
                <span className="text-gray-900 font-mono text-sm">
                  {email || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between bg-white px-3 py-2 rounded-md border border-gray-200">
                <span className="font-medium text-gray-700">Password</span>
                <span className="text-gray-900 font-mono text-sm">
                  {password ? "••••••••••••" : "—"}
                </span>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={refreshCredentials}
                className="px-3 py-2 text-sm font-medium text-purple-600 hover:text-purple-700 disabled:text-gray-400 disabled:cursor-not-allowed"
                disabled={
                  loading ||
                  !formData.lastName?.trim() ||
                  !(formData.oscaID || "").trim()
                }
              >
                Regenerate Credentials
              </button>
            </div>
          </div>

          {/* Required Fields for Acceptance */}
          <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 mb-6">
            <h3 className="text-sm font-bold text-orange-900 mb-3 uppercase">
              Additional Information Required *
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <FieldGroup
                label="OSCA ID"
                required
                hint="Required for account creation"
              >
                <input
                  type="text"
                  name="oscaID"
                  value={formData.oscaID}
                  onChange={handleInputChange}
                  onBlur={() =>
                    setFormData((prev) => ({
                      ...prev,
                      oscaID: (prev.oscaID || prev.memberOscaId || "")
                        .toString()
                        .trim(),
                      memberOscaId: (prev.oscaID || prev.memberOscaId || "")
                        .toString()
                        .trim(),
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  disabled={loading}
                  placeholder="Enter OSCA ID"
                  autoComplete="off"
                />
              </FieldGroup>

              <FieldGroup label="Date of Issue" required>
                <input
                  type="date"
                  name="dateIssue"
                  value={formData.dateIssue}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  disabled={loading}
                />
              </FieldGroup>

              <FieldGroup label="Date of Expiration" required>
                <input
                  type="date"
                  name="dateExpiration"
                  value={formData.dateExpiration}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  disabled={loading}
                />
              </FieldGroup>
            </div>
          </div>

          {/* Submitted Documents */}
          {requestData?.documents && requestData.documents.length > 0 && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200 mb-6">
              <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Submitted Documents
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {requestData.documents.map((doc, index) => {
                  const isImage = doc.type && doc.type.startsWith("image/");
                  const isPdf =
                    doc.type === "application/pdf" ||
                    doc.name?.toLowerCase().endsWith(".pdf");
                  const isWord =
                    doc.type?.includes("wordprocessingml") ||
                    doc.type?.includes("msword") ||
                    doc.name?.toLowerCase().endsWith(".docx") ||
                    doc.name?.toLowerCase().endsWith(".doc");

                  let icon, bgColor, borderColor;
                  if (isPdf) {
                    icon = "📄";
                    bgColor = "bg-red-100";
                    borderColor = "border-red-300";
                  } else if (isWord) {
                    icon = "📘";
                    bgColor = "bg-blue-100";
                    borderColor = "border-blue-300";
                  } else if (isImage) {
                    icon = "🖼️";
                    bgColor = "bg-green-100";
                    borderColor = "border-green-300";
                  } else {
                    icon = "📎";
                    bgColor = "bg-gray-100";
                    borderColor = "border-gray-300";
                  }

                  return (
                    <div
                      key={index}
                      className={`${borderColor} border-2 rounded-lg overflow-hidden bg-white hover:shadow-xl transition-all duration-200 group cursor-pointer`}
                    >
                      {isImage ? (
                        <div className="w-full h-48 bg-gray-200 overflow-hidden relative">
                          <img
                            src={doc.url}
                            alt={doc.name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity" />
                        </div>
                      ) : (
                        <div
                          className={`w-full h-48 ${bgColor} flex items-center justify-center flex-col gap-2`}
                        >
                          <span className="text-5xl">{icon}</span>
                          <span className="text-xs font-semibold text-gray-600 text-center px-2">
                            {isWord ? "Word" : isPdf ? "PDF" : "Document"}
                          </span>
                        </div>
                      )}
                      <div className="p-4 border-t border-gray-100">
                        <p className="text-sm font-bold text-gray-800 truncate hover:text-clip">
                          {doc.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          {new Date(doc.uploadedAt).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            }
                          )}
                        </p>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-3 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs font-semibold rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all"
                        >
                          <span>View</span>
                          <span>→</span>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleAccept}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium flex items-center justify-center gap-2 disabled:bg-green-300 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  <span>Accept Request</span>
                </>
              )}
            </button>

            <button
              onClick={handleReject}
              className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium flex items-center justify-center gap-2 disabled:bg-red-300 disabled:cursor-not-allowed"
              disabled={loading}
            >
              <X className="w-5 h-5" />
              <span>Reject</span>
            </button>

            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
              disabled={loading}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MembershipRequestModal;
