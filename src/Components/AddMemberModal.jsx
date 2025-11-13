import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  Users,
  Upload,
  Check,
  AlertCircle,
  RefreshCw,
  Camera,
  Plus,
  Trash2,
} from "lucide-react";
import { ref as dbRef, push, set, onValue } from "firebase/database";
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

const AVAILABLE_BARANGAYS = ["Nagpayong", "Pinagbuhatan"];
const DEFAULT_PUROKS = [
  "Purok Catleya",
  "Purok Jasmin",
  "Purok Rosal",
  "Purok Velasco Ave / Urbano",
];

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

const sanitizeForEmail = (value) =>
  (value || "member")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();

const generateMemberCredentials = ({ lastName, oscaID }) => {
  const baseName = sanitizeForEmail(lastName);
  const baseId = sanitizeForEmail(oscaID);
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

const AddMemberModal = ({ isOpen, onClose, onMemberAdded }) => {
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

  const [region] = useState("Manila");
  const [province] = useState("Metro Manila");
  const [city] = useState("Pasig City");
  const [barangay] = useState("Pinagbuhatan"); // Hardcoded to Pinagbuhatan
  const [houseStreet, setHouseStreet] = useState("");
  const [purok, setPurok] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [purokOptions, setPurokOptions] = useState(DEFAULT_PUROKS);

  const inputControlClass =
    "w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500";

  const [formData, setFormData] = useState({
    // Identification
    oscaID: "",
    contrNum: "",
    ncscNum: "",
    precinctNo: "",

    // Personal Info
    firstName: "",
    middleName: "",
    lastName: "",
    suffix: "",
    gender: "",
    civilStat: "",
    birthday_month: "",
    birthday_day: "",
    birthday_year: "",
    age: "",
    placeOfBirth: "",
    nationality: "Filipino",
    citizenship: "Filipino",

    // Contact
    contactNum: "",

    // Health & Status
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

    // IDs & Documents
    tin: "",
    philHealth: "",
    sssId: "",
    nationalId: "",
    barangayId: "",

    // Living Arrangement
    livingArr: "",
    familyMembers: [],

    // Emergency Contact
    emergencyContactName: "",
    emergencyContactAddress: "",
    emergencyContactNum: "",
    emergencyContactRelation: "",

    // Other
    psource: "",
    regSupport: "Active",
    dateIssue: "",
    dateExpiration: "",
    healthRecords: "",
    img: null,
  });

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const streamRef = React.useRef(null);

  const refreshCredentials = useCallback(() => {
    if (!formData.lastName || !formData.oscaID) {
      setEmail("");
      setPassword("");
      return;
    }
    const { email: generatedEmail, password: generatedPassword } =
      generateMemberCredentials({
        lastName: formData.lastName,
        oscaID: formData.oscaID,
      });
    setEmail(generatedEmail);
    setPassword(generatedPassword);
  }, [formData.lastName, formData.oscaID]);

  const addressPreview = (() => {
    const parts = [];
    if (houseStreet) parts.push(houseStreet);
    if (purok) parts.push(purok); // Purok name already includes "Purok" prefix

    const mainAddress = parts.join(", ");
    const locationSuffix = `[Barangay ${barangay}, ${city}]`;

    return mainAddress ? `${mainAddress} ${locationSuffix}` : "";
  })();

  const canGenerateCredentials = Boolean(formData.lastName && formData.oscaID);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (name.startsWith("birthday_")) {
      const { birthday_year, birthday_month, birthday_day } = {
        ...formData,
        [name]: value,
      };
      if (birthday_year && birthday_month && birthday_day) {
        const birthDate = new Date(
          `${birthday_year}-${birthday_month.padStart(
            2,
            "0"
          )}-${birthday_day.padStart(2, "0")}`
        );
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (
          monthDiff < 0 ||
          (monthDiff === 0 && today.getDate() < birthDate.getDate())
        ) {
          age--;
        }
        setFormData((prev) => ({ ...prev, age: age.toString() }));
      }
    }
  };

  const handleFamilyMemberChange = (index, field, value) => {
    const updatedFamilyMembers = [...formData.familyMembers];
    if (!updatedFamilyMembers[index]) {
      updatedFamilyMembers[index] = {
        name: "",
        age: "",
        address: "",
        relationship: "",
      };
    }
    updatedFamilyMembers[index][field] = value;
    setFormData((prev) => ({ ...prev, familyMembers: updatedFamilyMembers }));
  };

  const addFamilyMember = () => {
    if (formData.familyMembers.length < 2) {
      setFormData((prev) => ({
        ...prev,
        familyMembers: [
          ...prev.familyMembers,
          { name: "", age: "", address: "", relationship: "" },
        ],
      }));
    }
  };

  const removeFamilyMember = (index) => {
    setFormData((prev) => ({
      ...prev,
      familyMembers: prev.familyMembers.filter((_, i) => i !== index),
    }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Image size should be less than 5MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please upload a valid image file");
      return;
    }
    setFormData((prev) => ({ ...prev, img: file }));
    setPreview(URL.createObjectURL(file));
    setError("");
  };

  const startCamera = async () => {
    try {
      setShowCamera(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setError("Unable to access camera. Please check permissions.");
      setShowCamera(false);
    }
  };

  const capturePhoto = () => {
    if (canvasRef.current && videoRef.current) {
      const context = canvasRef.current.getContext("2d");
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);

      canvasRef.current.toBlob(
        (blob) => {
          const file = new File([blob], "camera-photo.jpg", {
            type: "image/jpeg",
          });
          setFormData((prev) => ({ ...prev, img: file }));
          setPreview(URL.createObjectURL(file));
          stopCamera();
          setError("");
        },
        "image/jpeg",
        0.95
      );
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  // Medical conditions handlers
  const addMedCondition = () => {
    setFormData((prev) => ({
      ...prev,
      medConditions: [...prev.medConditions, ""],
    }));
  };

  const updateMedCondition = (index, value) => {
    setFormData((prev) => {
      const updated = [...prev.medConditions];
      updated[index] = value;
      return { ...prev, medConditions: updated };
    });
  };

  const removeMedCondition = (index) => {
    setFormData((prev) => ({
      ...prev,
      medConditions: prev.medConditions.filter((_, i) => i !== index),
    }));
  };

  const validateForm = () => {
    // Required fields
    const required = [
      "oscaID",
      "firstName",
      "lastName",
      "gender",
      "civilStat",
      "birthday_month",
      "birthday_day",
      "birthday_year",
      "placeOfBirth",
      "contactNum",
      "emergencyContactNum",
      "bedridden",
      "dswdPensioner",
      "dswdWithATM",
      "localSeniorPensioner",
    ];

    // Check all required fields are filled
    for (let field of required) {
      if (!formData[field]) {
        setError("Please fill out all required fields.");
        return false;
      }
    }

    // Check address fields (required)
    if (!barangay || !houseStreet || !purok) {
      setError(
        "Please complete the address fields (House/Street, Purok, and Barangay)."
      );
      return false;
    }

    // Validate contact number format
    if (!/^09\d{9}$/.test(formData.contactNum)) {
      setError("Contact number must be in format 09XXXXXXXXX");
      return false;
    }

    // Validate emergency contact number format
    if (!/^09\d{9}$/.test(formData.emergencyContactNum)) {
      setError("Emergency contact number must be in format 09XXXXXXXXX");
      return false;
    }

    // Validate age
    if (parseInt(formData.age) < 60) {
      setError("Member must be 60 years old or older");
      return false;
    }

    // Profile photo is required
    if (!formData.img) {
      setError("Please upload a profile photo");
      return false;
    }

    // Credentials are required
    if (!email || !password) {
      setError("Please generate credentials before submitting the form.");
      return false;
    }

    // Validate family members (if any are added)
    for (let familyMember of formData.familyMembers) {
      if (
        !familyMember.name ||
        !familyMember.age ||
        !familyMember.address ||
        !familyMember.relationship
      ) {
        setError(
          "Please complete all details for each listed family member or remove the incomplete entry."
        );
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess(false);
    if (!validateForm()) return;

    setLoading(true);

    try {
      const auth = getAuth();

      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const uid = userCredential.user.uid;

      // 2. Upload profile photo
      let imageUrl = "";
      if (formData.img) {
        const storage = getStorage();
        const imageRef = storageRef(
          storage,
          `member-photos/${formData.oscaID}_${Date.now()}.jpg`
        );
        await uploadBytes(imageRef, formData.img);
        imageUrl = await getDownloadURL(imageRef);
      }

      // 3. Prepare member data
      const birthday = `${formData.birthday_month.padStart(
        2,
        "0"
      )}/${formData.birthday_day.padStart(2, "0")}/${formData.birthday_year}`;
      const fullAddressSegments = [
        houseStreet,
        purok, // Purok name already includes "Purok" prefix
        barangay ? `Brgy. ${barangay}` : "",
        city,
        province,
        region,
      ].filter(Boolean);

      const fullAddress = fullAddressSegments.join(", ");

      const memberData = {
        ...formData,
        medConditions: formData.medConditions
          .filter((c) => c.trim())
          .join(", "), // Convert array to comma-separated string
        birthday,
        age: parseInt(formData.age),
        address: fullAddress,
        barangay,
        img: imageUrl,
        email, // store generated email
        password, // store generated password
        authUid: uid, // link to Firebase Auth
        archived: 0,
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

      // 4. Save member data to Realtime Database
      const membersRef = dbRef(db, "members");
      const newMemberRef = push(membersRef);
      await set(newMemberRef, memberData);

      const memberName = `${formData.firstName} ${formData.lastName}`.trim();
      await auditLogger.logMemberCreated(
        newMemberRef.key,
        memberName || formData.oscaID || newMemberRef.key,
        memberData
      );

      setSuccess(true);
      setTimeout(() => {
        if (onMemberAdded) onMemberAdded();
        onClose();
        resetForm();
      }, 2000);
    } catch (err) {
      console.error("Error adding member:", err);
      setError(err.message || "Failed to add member. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      // Identification
      oscaID: "",
      contrNum: "",
      ncscNum: "",
      precinctNo: "",

      // Personal Info
      firstName: "",
      middleName: "",
      lastName: "",
      suffix: "",
      gender: "",
      civilStat: "",
      birthday_month: "",
      birthday_day: "",
      birthday_year: "",
      age: "",
      placeOfBirth: "",
      nationality: "Filipino",
      citizenship: "Filipino",

      // Contact
      contactNum: "",

      // Health & Status
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

      // IDs & Documents
      tin: "",
      philHealth: "",
      sssId: "",
      nationalId: "",
      barangayId: "",

      // Living Arrangement
      livingArr: "",
      familyMembers: [],

      // Emergency Contact
      emergencyContactName: "",
      emergencyContactAddress: "",
      emergencyContactNum: "",
      emergencyContactRelation: "",

      // Other
      psource: "",
      regSupport: "Active",
      dateIssue: "",
      dateExpiration: "",
      healthRecords: "",
      img: null,
    });
    setPreview(null);
    // Barangay is hardcoded, no need to reset
    setHouseStreet("");
    setPurok("");
    setEmail("");
    setPassword("");
    setError("");
    setSuccess(false);
  };

  // Fetch dynamic puroks from Firebase
  useEffect(() => {
    const settingsRef = dbRef(db, "settings/idSettings/puroks");
    const unsubscribe = onValue(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list = Array.isArray(data) ? data : Object.values(data || {});
        const sanitized = list
          .map((entry) => (entry || "").toString().trim())
          .filter((entry, idx, arr) => entry && arr.indexOf(entry) === idx);
        setPurokOptions(sanitized.length > 0 ? sanitized : DEFAULT_PUROKS);
      } else {
        setPurokOptions(DEFAULT_PUROKS);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    refreshCredentials();
  }, [refreshCredentials]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">
                New Membership Application
              </h2>
              <p className="text-sm text-gray-500">
                Complete all required fields marked with *
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
                        Validation Error
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
                Member added successfully!
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-gray-50 rounded-xl p-4 border-2 border-dashed border-gray-300">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Profile Photo *
                </label>
                <div className="aspect-square bg-white rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                  {preview ? (
                    <img
                      src={preview}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Users className="w-16 h-16 text-gray-300" />
                  )}
                </div>
                <label className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 cursor-pointer transition">
                  <Upload className="w-4 h-4" />
                  <span className="text-sm font-medium">Upload Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={loading}
                  />
                </label>
                <button
                  type="button"
                  onClick={startCamera}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 mt-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Camera className="w-4 h-4" />
                  <span className="text-sm font-medium">Take Photo</span>
                </button>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Max 5MB, JPG/PNG
                </p>
              </div>
            </div>

            <div className="lg:col-span-3 space-y-6">
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg shadow-sm text-sm text-gray-800">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h4 className="text-purple-700 font-semibold">
                    Generated Credentials
                  </h4>
                  <button
                    type="button"
                    onClick={refreshCredentials}
                    disabled={!canGenerateCredentials || loading}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {email ? "Regenerate" : "Generate"}
                  </button>
                </div>
                <p className="text-xs text-purple-800 mb-2">
                  Credentials become available once the member&apos;s last name
                  and OSCA ID are provided. Regenerate to issue a new secure
                  password when needed.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-white px-3 py-2 rounded-md border border-gray-200">
                    <span className="font-medium text-gray-700">Email</span>
                    <span className="text-gray-900 break-all">
                      {email || "Awaiting last name and OSCA ID"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-white px-3 py-2 rounded-md border border-gray-200">
                    <span className="font-medium text-gray-700">Password</span>
                    <span className="text-gray-900 break-all">
                      {password || "Generate credentials to view"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                <h3 className="text-sm font-bold text-blue-900 mb-3 uppercase">
                  Personal Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <FieldGroup label="First Name" required>
                    <input
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="Middle Name">
                    <input
                      type="text"
                      name="middleName"
                      value={formData.middleName}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="Last Name" required>
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="Suffix" hint="Jr., Sr., III, etc.">
                    <input
                      type="text"
                      name="suffix"
                      value={formData.suffix}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="Gender" required>
                    <select
                      name="gender"
                      value={formData.gender}
                      onChange={handleInputChange}
                      className={`${inputControlClass} bg-white`}
                      disabled={loading}
                    >
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </FieldGroup>
                  <FieldGroup label="Civil Status" required>
                    <select
                      name="civilStat"
                      value={formData.civilStat}
                      onChange={handleInputChange}
                      className={`${inputControlClass} bg-white`}
                      disabled={loading}
                    >
                      <option value="">Select status</option>
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                      <option value="Widowed">Widowed</option>
                      <option value="Separated">Separated</option>
                      <option value="Divorced">Divorced</option>
                    </select>
                  </FieldGroup>
                  <FieldGroup label="Religion">
                    <input
                      type="text"
                      name="religion"
                      value={formData.religion}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="Citizenship">
                    <input
                      type="text"
                      name="citizenship"
                      value={formData.citizenship}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                </div>
              </div>

              <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
                <h3 className="text-sm font-bold text-orange-900 mb-3 uppercase">
                  Date of Birth
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <FieldGroup label="Birth Month" required>
                    <select
                      name="birthday_month"
                      value={formData.birthday_month}
                      onChange={handleInputChange}
                      className={`${inputControlClass} bg-white`}
                      disabled={loading}
                    >
                      <option value="">Select month</option>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>
                          {new Date(0, m - 1).toLocaleString("default", {
                            month: "long",
                          })}
                        </option>
                      ))}
                    </select>
                  </FieldGroup>
                  <FieldGroup label="Birth Day" required>
                    <select
                      name="birthday_day"
                      value={formData.birthday_day}
                      onChange={handleInputChange}
                      className={`${inputControlClass} bg-white`}
                      disabled={loading}
                    >
                      <option value="">Select day</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </FieldGroup>
                  <FieldGroup label="Birth Year" required>
                    <select
                      name="birthday_year"
                      value={formData.birthday_year}
                      onChange={handleInputChange}
                      className={`${inputControlClass} bg-white`}
                      disabled={loading}
                    >
                      <option value="">Select year</option>
                      {Array.from(
                        { length: 50 },
                        (_, i) => new Date().getFullYear() - 60 - i
                      ).map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </FieldGroup>
                  <FieldGroup label="Computed Age">
                    <input
                      type="text"
                      name="age"
                      value={formData.age}
                      readOnly
                      className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-700"
                    />
                  </FieldGroup>
                </div>
                <FieldGroup label="Place of Birth" required className="mt-4">
                  <input
                    type="text"
                    name="placeOfBirth"
                    value={formData.placeOfBirth}
                    onChange={handleInputChange}
                    className={inputControlClass}
                    disabled={loading}
                  />
                </FieldGroup>
              </div>

              <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                <h3 className="text-sm font-bold text-green-900 mb-3 uppercase">
                  Contact Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <FieldGroup label="Contact Number" required>
                    <input
                      type="text"
                      name="contactNum"
                      maxLength={11}
                      placeholder="09XXXXXXXXX"
                      value={formData.contactNum}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>

                  <FieldGroup
                    label="House / Street No."
                    required
                    hint="Example: Block 1 Lot 2, Sampaguita Street"
                    className="lg:col-span-2"
                  >
                    <textarea
                      rows={2}
                      placeholder="Describe the exact house and street address"
                      value={houseStreet}
                      onChange={(e) => setHouseStreet(e.target.value)}
                      className={`${inputControlClass} resize-y min-h-[72px]`}
                      disabled={loading}
                    />
                  </FieldGroup>

                  <FieldGroup label="Purok" required>
                    <select
                      value={purok}
                      onChange={(e) => setPurok(e.target.value)}
                      className={`${inputControlClass} bg-white`}
                      disabled={loading}
                    >
                      <option value="">Select Purok</option>
                      {purokOptions.map((purokName) => (
                        <option key={purokName} value={purokName}>
                          {purokName}
                        </option>
                      ))}
                    </select>
                  </FieldGroup>

                  <FieldGroup label="Barangay" required>
                    <input
                      type="text"
                      value={barangay}
                      readOnly
                      className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-600"
                    />
                  </FieldGroup>

                  <FieldGroup label="City">
                    <input
                      type="text"
                      value={city}
                      readOnly
                      className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-600"
                    />
                  </FieldGroup>

                  <FieldGroup
                    label="Full Address Preview"
                    hint="This value will be saved for the member"
                    className="lg:col-span-3"
                  >
                    <input
                      type="text"
                      value={addressPreview || "Complete the address fields"}
                      readOnly
                      className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-700"
                    />
                  </FieldGroup>
                </div>
              </div>

              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200">
                <h3 className="text-sm font-bold text-indigo-900 mb-3 uppercase">
                  Identification Numbers
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <FieldGroup label="OSCA ID" required>
                    <input
                      type="text"
                      name="oscaID"
                      value={formData.oscaID}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="NCSC Number" hint="Optional">
                    <input
                      type="text"
                      name="ncscNum"
                      value={formData.ncscNum}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="Control Number" hint="Optional">
                    <input
                      type="text"
                      name="contrNum"
                      value={formData.contrNum}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="Precinct Number" hint="Optional">
                    <input
                      type="text"
                      name="precinctNo"
                      value={formData.precinctNo}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Date of Registration"
                    hint="Auto-filled today"
                  >
                    <input
                      type="text"
                      value={new Date().toLocaleDateString()}
                      disabled
                      className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-600"
                      title="Date of Registration (Auto-filled)"
                    />
                  </FieldGroup>
                </div>
              </div>

              <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                <h3 className="text-sm font-bold text-red-900 mb-3 uppercase">
                  ID Validity & Dates
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-red-700 mb-1">
                      Date Issue
                    </label>
                    <input
                      type="date"
                      name="dateIssue"
                      value={formData.dateIssue}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-red-700 mb-1">
                      Date Expiration
                    </label>
                    <input
                      type="date"
                      name="dateExpiration"
                      value={formData.dateExpiration}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                <h3 className="text-sm font-bold text-yellow-900 mb-3 uppercase">
                  Health Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <FieldGroup label="Blood Type" hint="Optional">
                    <input
                      type="text"
                      name="bloodType"
                      value={formData.bloodType}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Medical Conditions"
                    hint="Hypertension, Diabetes, etc. (Optional)"
                  >
                    <div className="space-y-2">
                      {formData.medConditions.map((condition, index) => (
                        <div key={index} className="flex gap-2">
                          <input
                            type="text"
                            placeholder={`Condition ${index + 1}`}
                            value={condition}
                            onChange={(e) =>
                              updateMedCondition(index, e.target.value)
                            }
                            className={`${inputControlClass} flex-1`}
                            disabled={loading}
                          />
                          <button
                            type="button"
                            onClick={() => removeMedCondition(index)}
                            className="px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition"
                            disabled={loading}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addMedCondition}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-purple-500 hover:text-purple-600 transition"
                        disabled={loading}
                      >
                        <Plus className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          Add Condition
                        </span>
                      </button>
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Disabilities" hint="Optional">
                    <input
                      type="text"
                      name="disabilities"
                      value={formData.disabilities}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Primary Health Facility"
                    hint="Barangay health center or hospital (Optional)"
                  >
                    <input
                      type="text"
                      name="healthFacility"
                      value={formData.healthFacility}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Emergency Hospital Preference"
                    hint="Optional"
                  >
                    <input
                      type="text"
                      name="emergencyHospital"
                      value={formData.emergencyHospital}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="Health Records Notes" hint="Optional">
                    <textarea
                      name="healthRecords"
                      value={formData.healthRecords}
                      onChange={handleInputChange}
                      rows="2"
                      className={`${inputControlClass} resize-y`}
                      disabled={loading}
                    />
                  </FieldGroup>
                </div>
              </div>

              <div className="bg-cyan-50 rounded-xl p-4 border border-cyan-200">
                <h3 className="text-sm font-bold text-cyan-900 mb-3 uppercase">
                  Health & Social Status (Required)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <FieldGroup label="Bedridden" required>
                    <select
                      name="bedridden"
                      value={formData.bedridden}
                      onChange={handleInputChange}
                      className={`${inputControlClass} bg-white`}
                      disabled={loading}
                    >
                      <option value="">Select option</option>
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </FieldGroup>
                  <FieldGroup label="DSWD Pensioner" required>
                    <select
                      name="dswdPensioner"
                      value={formData.dswdPensioner}
                      onChange={handleInputChange}
                      className={`${inputControlClass} bg-white`}
                      disabled={loading}
                    >
                      <option value="">Select option</option>
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </FieldGroup>
                  <FieldGroup label="DSWD Cash Card Holder" required>
                    <select
                      name="dswdWithATM"
                      value={formData.dswdWithATM}
                      onChange={handleInputChange}
                      className={`${inputControlClass} bg-white`}
                      disabled={loading}
                    >
                      <option value="">Select option</option>
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </FieldGroup>
                  <FieldGroup label="Local Senior Pensioner" required>
                    <select
                      name="localSeniorPensioner"
                      value={formData.localSeniorPensioner}
                      onChange={handleInputChange}
                      className={`${inputControlClass} bg-white`}
                      disabled={loading}
                    >
                      <option value="">Select option</option>
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </FieldGroup>
                </div>
              </div>

              <div className="bg-pink-50 rounded-xl p-4 border border-pink-200">
                <h3 className="text-sm font-bold text-pink-900 mb-3 uppercase">
                  Emergency Contact
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FieldGroup label="Emergency Contact Name" required>
                    <input
                      type="text"
                      name="emergencyContactName"
                      value={formData.emergencyContactName}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="Emergency Contact Number" required>
                    <input
                      type="text"
                      name="emergencyContactNum"
                      value={formData.emergencyContactNum}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                      placeholder="09XXXXXXXXX"
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Emergency Contact Address"
                    className="md:col-span-2"
                  >
                    <textarea
                      name="emergencyContactAddress"
                      value={formData.emergencyContactAddress}
                      onChange={handleInputChange}
                      rows="2"
                      className={`${inputControlClass} resize-y`}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="Relationship to Senior">
                    <input
                      type="text"
                      name="emergencyContactRelation"
                      value={formData.emergencyContactRelation}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                </div>
              </div>

              <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                <h3 className="text-sm font-bold text-purple-900 mb-3 uppercase">
                  Government IDs
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FieldGroup label="PhilHealth ID Number">
                    <input
                      type="text"
                      name="philHealth"
                      value={formData.philHealth}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="SSS ID Number">
                    <input
                      type="text"
                      name="sssId"
                      value={formData.sssId}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="National ID Number">
                    <input
                      type="text"
                      name="nationalId"
                      value={formData.nationalId}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="Barangay ID Number">
                    <input
                      type="text"
                      name="barangayId"
                      value={formData.barangayId}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="Tax Identification Number (TIN)">
                    <input
                      type="text"
                      name="tin"
                      value={formData.tin}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                </div>
              </div>

              <div className="bg-teal-50 rounded-xl p-4 border border-teal-200">
                <h3 className="text-sm font-bold text-teal-900 mb-3 uppercase">
                  Additional Information (Optional)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FieldGroup label="Educational Attainment" hint="Optional">
                    <input
                      type="text"
                      name="educAttain"
                      value={formData.educAttain}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="Nationality" hint="Optional">
                    <input
                      type="text"
                      name="nationality"
                      value={formData.nationality}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="Religion">
                    <input
                      type="text"
                      name="religion"
                      value={formData.religion}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="Living Arrangement">
                    <input
                      type="text"
                      name="livingArr"
                      value={formData.livingArr}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                  <FieldGroup label="Pension Source">
                    <input
                      type="text"
                      name="psource"
                      value={formData.psource}
                      onChange={handleInputChange}
                      className={inputControlClass}
                      disabled={loading}
                    />
                  </FieldGroup>
                </div>
              </div>

              <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-green-900 uppercase">
                    Living with Family Members / Guardians (Optional)
                  </h3>
                  <button
                    onClick={addFamilyMember}
                    disabled={loading || formData.familyMembers.length >= 2}
                    className="text-sm px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                  >
                    + Add Family Member
                  </button>
                </div>
                {formData.familyMembers.length === 0 && (
                  <p className="text-sm text-green-700 mb-3">
                    Add up to two household contacts to help staff reach the
                    member quickly. Leave blank if not applicable.
                  </p>
                )}
                <div className="space-y-4">
                  {formData.familyMembers.map((member, index) => (
                    <div
                      key={index}
                      className="p-4 bg-white border border-green-200 rounded-lg relative"
                    >
                      <button
                        onClick={() => removeFamilyMember(index)}
                        className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                        disabled={loading}
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <FieldGroup label="Full Name" required>
                          <input
                            type="text"
                            value={member.name}
                            onChange={(e) =>
                              handleFamilyMemberChange(
                                index,
                                "name",
                                e.target.value
                              )
                            }
                            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                            disabled={loading}
                          />
                        </FieldGroup>
                        <FieldGroup label="Age" required>
                          <input
                            type="number"
                            value={member.age}
                            onChange={(e) =>
                              handleFamilyMemberChange(
                                index,
                                "age",
                                e.target.value
                              )
                            }
                            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                            disabled={loading}
                          />
                        </FieldGroup>
                        <FieldGroup label="Address" required>
                          <input
                            type="text"
                            value={member.address}
                            onChange={(e) =>
                              handleFamilyMemberChange(
                                index,
                                "address",
                                e.target.value
                              )
                            }
                            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                            disabled={loading}
                          />
                        </FieldGroup>
                        <FieldGroup label="Relationship" required>
                          <input
                            type="text"
                            value={member.relationship}
                            onChange={(e) =>
                              handleFamilyMemberChange(
                                index,
                                "relationship",
                                e.target.value
                              )
                            }
                            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                            disabled={loading}
                          />
                        </FieldGroup>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSubmit}
                  className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium flex items-center justify-center gap-2 disabled:bg-purple-300 disabled:cursor-not-allowed"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Adding Member...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      <span>Add Member</span>
                    </>
                  )}
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Camera Modal */}
        {showCamera && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
              <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
                <h3 className="font-semibold">Take Photo</h3>
                <button
                  onClick={stopCamera}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4">
                <div className="bg-black rounded-lg overflow-hidden mb-4">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-auto"
                  />
                </div>
                <canvas ref={canvasRef} className="hidden" />

                <div className="flex gap-3">
                  <button
                    onClick={capturePhoto}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                  >
                    <Camera className="w-5 h-5" />
                    Capture
                  </button>
                  <button
                    onClick={stopCamera}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddMemberModal;
