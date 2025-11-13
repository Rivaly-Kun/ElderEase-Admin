import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  Plus,
  Printer,
  Archive,
  Pencil,
  Trash2,
  Users,
  Camera,
  RefreshCw,
  Search,
  HeartPulse,
  Settings,
  Clock,
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Loader2,
} from "lucide-react";
import { ref as dbRef, onValue, remove, update } from "firebase/database";
import { db } from "../services/firebase";
import Sidebar from "../Components/Sidebar";
import Header from "../Components/Header";
import AddMemberModal from "../Components/AddMemberModal";
import MemberProfileModal from "../Components/MemberProfileModal";
import MembershipRequestModal from "../Components/MembershipRequestModal";
import AIPoweredScanner from "../Components/QrScanner";
import IDSettings from "../Components/IDSettings";
import PrintModule from "../Components/PrintModule";
import { useMemberSearch } from "../Context/MemberSearchContext";
import useResolvedCurrentUser from "../hooks/useResolvedCurrentUser";
import { createAuditLogger } from "../utils/AuditLogger";

const PAYMENT_SUCCESS_STATUSES = new Set([
  "paid",
  "complete",
  "completed",
  "settled",
  "success",
  "successful",
]);

const MODAL_VARIANT_STYLES = {
  info: {
    accent: "bg-purple-100 text-purple-600",
    confirmButton: "bg-purple-600 hover:bg-purple-700 text-white",
  },
  success: {
    accent: "bg-green-100 text-green-600",
    confirmButton: "bg-green-600 hover:bg-green-700 text-white",
  },
  warning: {
    accent: "bg-amber-100 text-amber-600",
    confirmButton: "bg-amber-500 hover:bg-amber-600 text-white",
  },
  danger: {
    accent: "bg-red-100 text-red-600",
    confirmButton: "bg-red-600 hover:bg-red-700 text-white",
  },
  error: {
    accent: "bg-red-100 text-red-600",
    confirmButton: "bg-red-600 hover:bg-red-700 text-white",
  },
};

const MODAL_VARIANT_ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  error: XCircle,
};

const formatMemberName = (member = {}) => {
  const name = `${member.firstName || ""} ${member.lastName || ""}`.trim();
  return name || member.oscaID || "Member";
};

const parsePaymentDate = (payment = {}) => {
  const rawDate =
    payment.payDate ||
    payment.date_created ||
    payment.dateCreated ||
    payment.createdAt ||
    payment.timestamp;

  if (!rawDate) return null;

  const parsed = new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateTimeForDisplay = (date) => {
  if (!date) return "Not recorded";
  try {
    return new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch (err) {
    console.error("Error formatting date:", err);
    return date.toLocaleString();
  }
};

const extractNumericAmount = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.,-]/g, "");
    const normalized = cleaned.replace(/,/g, "");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatCurrencyPHP = (value) => {
  if (value === null) return null;
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 2,
    }).format(value);
  } catch (err) {
    console.error("Error formatting currency:", err);
    return `₱${value.toFixed(2)}`;
  }
};

const formatPaymentSummary = (payment = {}) => {
  const date = parsePaymentDate(payment);
  const descriptor = (payment.payDesc || payment.paymentFor || "").trim();
  const mode = (payment.modePay || payment.modeOfPayment || "").trim();
  const amount = formatCurrencyPHP(extractNumericAmount(payment.amount));

  const parts = [];
  if (date) {
    parts.push(`Last paid ${formatDateTimeForDisplay(date)}`);
  } else if (descriptor || amount || mode) {
    parts.push("Latest payment recorded");
  }
  if (descriptor) parts.push(descriptor);
  if (mode) parts.push(mode);
  if (amount) parts.push(amount);

  return parts.length > 0
    ? parts.join(" • ")
    : "No paid transactions recorded.";
};

const isPaymentMarkedPaid = (payment = {}) => {
  const statusRaw =
    payment.payment_status ||
    payment.status ||
    payment.paymentStatus ||
    payment.statusText ||
    "";
  const status = statusRaw.toString().toLowerCase();
  if (PAYMENT_SUCCESS_STATUSES.has(status)) return true;
  // Accept empty status as paid (legacy records)
  return status === "";
};

// Time constants for membership lifecycle
const ONE_MONTH_MS = 1000 * 60 * 60 * 24 * 30;
const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;

// Default puroks if no custom puroks are defined in settings
const DEFAULT_PUROKS = ["Purok 1", "Purok 2", "Purok 3", "Purok 4", "Purok 5"];

const SeniorCitizenManagement = () => {
  const location = useLocation();
  const [activeMenu, setActiveMenu] = useState("Senior Citizens");
  const [showAddModal, setShowAddModal] = useState(false);

  // Get global member search context
  const memberSearch = useMemberSearch();
  const [selectedMember, setSelectedMember] = useState(null);
  const [activeTab, setActiveTab] = useState("active");
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentsData, setPaymentsData] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [showIDSettings, setShowIDSettings] = useState(false);
  const [showPrintModule, setShowPrintModule] = useState(false);

  // Global dialog management (replaces native alerts/confirms)
  const [dialogConfig, setDialogConfig] = useState({
    open: false,
    title: "",
    body: null,
    confirmLabel: "Close",
    cancelLabel: "Cancel",
    showCancel: false,
    variant: "info",
    onConfirm: null,
    onCancel: null,
  });
  const [dialogLoading, setDialogLoading] = useState(false);

  const closeDialog = useCallback(() => {
    setDialogConfig((prev) => ({ ...prev, open: false }));
    setDialogLoading(false);
  }, []);

  const openDialog = useCallback((config) => {
    setDialogConfig({
      open: true,
      title: config.title || "",
      body: config.body || null,
      confirmLabel: config.confirmLabel || "Close",
      cancelLabel: config.cancelLabel || "Cancel",
      showCancel: Boolean(config.showCancel),
      variant: config.variant || "info",
      onConfirm: config.onConfirm || null,
      onCancel: config.onCancel || null,
    });
    setDialogLoading(false);
  }, []);

  const handleDialogCancel = () => {
    if (dialogConfig.onCancel) {
      dialogConfig.onCancel({ closeDialog, openDialog });
    }
    closeDialog();
  };

  const handleDialogConfirm = async () => {
    if (!dialogConfig.onConfirm) {
      closeDialog();
      return;
    }

    setDialogLoading(true);
    try {
      await dialogConfig.onConfirm({ closeDialog, openDialog });
    } finally {
      setDialogLoading(false);
    }
  };

  const getMemberPaymentInfo = useCallback(
    (member) => {
      if (!member) {
        return {
          paidPayments: [],
          membershipPayments: [],
          lastPaymentEntry: null,
          lastPaymentDate: null,
          lastMembershipPaymentEntry: null,
          lastMembershipPaymentDate: null,
        };
      }

      const paidPayments = paymentsData
        .filter(
          (payment) =>
            payment?.oscaID === member.oscaID && isPaymentMarkedPaid(payment)
        )
        .sort((a, b) => {
          const timeB = parsePaymentDate(b)?.getTime() || 0;
          const timeA = parsePaymentDate(a)?.getTime() || 0;
          return timeB - timeA;
        });

      const membershipPayments = paidPayments.filter((payment) => {
        const descriptor = `${payment.paymentFor || ""} ${
          payment.payDesc || ""
        }`
          .toLowerCase()
          .trim();
        return (
          descriptor.includes("membership") ||
          descriptor.includes("annual dues")
        );
      });

      const lastPaymentEntry = paidPayments[0] || null;
      const lastMembershipPaymentEntry = membershipPayments[0] || null;

      return {
        paidPayments,
        membershipPayments,
        lastPaymentEntry,
        lastPaymentDate: lastPaymentEntry
          ? parsePaymentDate(lastPaymentEntry)
          : null,
        lastMembershipPaymentEntry,
        lastMembershipPaymentDate: lastMembershipPaymentEntry
          ? parsePaymentDate(lastMembershipPaymentEntry)
          : null,
      };
    },
    [paymentsData]
  );

  const activeDialogStyles =
    MODAL_VARIANT_STYLES[dialogConfig.variant] || MODAL_VARIANT_STYLES.info;
  const DialogIcon =
    MODAL_VARIANT_ICONS[dialogConfig.variant] || MODAL_VARIANT_ICONS.info;

  // Membership Requests
  const [membershipRequests, setMembershipRequests] = useState([]);
  const [showRequestsCenter, setShowRequestsCenter] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [selectedAgeRange, setSelectedAgeRange] = useState("");
  const [selectedGender, setSelectedGender] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedPurok, setSelectedPurok] = useState("");
  const [surnameSortOrder, setSurnameSortOrder] = useState(""); // "asc" or "desc"

  // Dynamic purok settings
  const [purokOptions, setPurokOptions] = useState(DEFAULT_PUROKS);

  const { currentUser, loading: currentUserLoading } = useResolvedCurrentUser();
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

  // Handle navigation state to open new member modal
  useEffect(() => {
    if (location.state?.openAddMemberModal) {
      setShowAddModal(true);
    }
  }, [location.state]);

  const handleUnarchiveMember = (member) => {
    const memberName = formatMemberName(member);
    const { membershipPayments, lastMembershipPaymentEntry, lastPaymentEntry } =
      getMemberPaymentInfo(member);

    const hasPaidMembershipFee = membershipPayments.length > 0;
    const hasFacialVerification = Boolean(member?.lastFacialRecognition);

    const missingRequirements = [];
    if (!hasPaidMembershipFee)
      missingRequirements.push("Membership fee payment");
    if (!hasFacialVerification) missingRequirements.push("Face verification");

    if (missingRequirements.length > 0) {
      openDialog({
        title: "Unarchive Requirements Incomplete",
        variant: "warning",
        confirmLabel: "Close",
        body: (
          <div className="space-y-4 text-sm text-gray-600">
            <p>
              <span className="font-semibold text-gray-800">{memberName}</span>{" "}
              cannot be unarchived yet.
            </p>
            <div>
              <p className="font-medium text-gray-700">Missing requirements</p>
              <ul className="mt-2 space-y-1">
                {missingRequirements.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500"></span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium text-gray-700">
                Latest payment on file
              </p>
              <p className="mt-1 text-gray-600">
                {lastPaymentEntry
                  ? formatPaymentSummary(lastPaymentEntry)
                  : "No paid transactions recorded."}
              </p>
            </div>
          </div>
        ),
        onConfirm: ({ closeDialog }) => closeDialog(),
      });
      return;
    }

    const lastFacialDate = member?.lastFacialRecognition
      ? new Date(member.lastFacialRecognition)
      : null;

    openDialog({
      title: "Unarchive Member",
      variant: "info",
      confirmLabel: "Unarchive",
      cancelLabel: "Cancel",
      showCancel: true,
      body: (
        <div className="space-y-4 text-sm text-gray-600">
          <p>
            Unarchive{" "}
            <span className="font-semibold text-gray-800">{memberName}</span>?
          </p>
          <div>
            <p className="font-medium text-gray-700">Verification summary</p>
            <ul className="mt-2 space-y-1">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-purple-500"></span>
                <span>
                  {lastMembershipPaymentEntry
                    ? formatPaymentSummary(lastMembershipPaymentEntry)
                    : lastPaymentEntry
                    ? formatPaymentSummary(lastPaymentEntry)
                    : "No paid transactions recorded."}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-purple-500"></span>
                <span>
                  {lastFacialDate
                    ? `Last face verification ${formatDateTimeForDisplay(
                        lastFacialDate
                      )}`
                    : "No face verification on record."}
                </span>
              </li>
            </ul>
          </div>
        </div>
      ),
      onConfirm: async ({ closeDialog, openDialog }) => {
        closeDialog();
        try {
          const memberRef = dbRef(db, `members/${member.firebaseKey}`);
          await update(memberRef, {
            archived: false,
            date_updated: new Date().toISOString(),
            updatedBy: actorLabel,
            updatedById: actorId,
            lastActionByRole: actorRole,
          });
          await auditLogger.logAction("UNARCHIVE", "Senior Citizens", {
            recordId: member.firebaseKey,
            recordName: memberName,
          });
          openDialog({
            title: "Member Unarchived",
            variant: "success",
            confirmLabel: "Close",
            body: (
              <div className="space-y-2 text-sm text-gray-600">
                <p>
                  <span className="font-semibold text-gray-800">
                    {memberName}
                  </span>{" "}
                  is now active.
                </p>
              </div>
            ),
            onConfirm: ({ closeDialog }) => closeDialog(),
          });
        } catch (error) {
          console.error("Error unarchiving member:", error);
          openDialog({
            title: "Failed to Unarchive",
            variant: "danger",
            confirmLabel: "Close",
            body: (
              <div className="space-y-2 text-sm text-gray-600">
                <p>We couldn't unarchive the member. Please try again.</p>
                <p className="text-xs text-gray-500">
                  {error.message || "Unknown error occurred."}
                </p>
              </div>
            ),
            onConfirm: ({ closeDialog }) => closeDialog(),
          });
        }
      },
    });
  };

  // ✅ Auto-archive/unarchive based on payment/facial record activity
  useEffect(() => {
    if (members.length === 0 || paymentsData.length === 0) return;

    const now = new Date();
    const TWO_YEARS_MS = ONE_YEAR_MS * 2;

    members.forEach((member) => {
      // Skip deceased members - they should never be modified
      if (member.deceased) return;

      // Find this member's payment history
      const { lastPaymentDate } = getMemberPaymentInfo(member);

      // Get most recent facial recognition (if any)
      const lastFacialDate = member.lastFacialRecognition
        ? new Date(member.lastFacialRecognition)
        : null;

      // Pick latest activity date
      const lastActivity =
        lastPaymentDate && lastFacialDate
          ? new Date(
              Math.max(lastPaymentDate.getTime(), lastFacialDate.getTime())
            )
          : lastPaymentDate || lastFacialDate;

      const memberRef = dbRef(db, `members/${member.firebaseKey}`);

      // 🧩 CASE 1: Has recent activity (< 1 year) → should be ACTIVE
      if (lastActivity) {
        const timeSinceActivity = now - new Date(lastActivity);

        if (timeSinceActivity < ONE_YEAR_MS) {
          // If currently archived but has recent activity, UNARCHIVE them
          if (member.archived) {
            update(memberRef, {
              archived: false,
              date_updated: now.toISOString(),
            });
            console.log(
              `✅ Auto-unarchived ${member.firstName} ${member.lastName} — recent activity detected`
            );
          }
          return; // Member is active, no further action needed
        }
      }

      // 🧩 CASE 2: No activity ever OR inactive for 1+ year → ARCHIVE
      if (!member.archived) {
        if (!lastActivity) {
          update(memberRef, {
            archived: true,
            date_updated: now.toISOString(),
          });
          console.log(
            `📦 Auto-archived ${member.firstName} ${member.lastName} — no activity ever`
          );
        } else {
          const timeSinceActivity = now - new Date(lastActivity);
          if (timeSinceActivity >= ONE_YEAR_MS) {
            update(memberRef, {
              archived: true,
              date_updated: now.toISOString(),
            });
            console.log(
              `📦 Auto-archived ${member.firstName} ${member.lastName} — inactive for 1+ year`
            );
          }
        }
      }

      // 🧩 CASE 3: Archived for 2+ years → mark DECEASED
      if (member.archived) {
        const archiveDate = new Date(
          member.date_updated || member.date_created
        );
        const timeSinceArchive = now - archiveDate;

        if (timeSinceArchive >= TWO_YEARS_MS) {
          update(memberRef, {
            deceased: true,
            date_updated: now.toISOString(),
          });
          console.log(
            `☠️ Marked ${member.firstName} ${member.lastName} as deceased — archived 2+ years`
          );
        }
      }
    });
  }, [members, paymentsData, getMemberPaymentInfo]);

  // Fetch members from Firebase
  useEffect(() => {
    const membersRef = dbRef(db, "members");

    const unsubscribe = onValue(
      membersRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const membersArray = Object.keys(data).map((key) => ({
            firebaseKey: key,
            ...data[key],
          }));
          setMembers(membersArray);
        } else {
          setMembers([]);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching members:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Fetch membership requests
  useEffect(() => {
    const requestsRef = dbRef(db, "createaccreq");

    const unsubscribe = onValue(
      requestsRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const requestsArray = Object.keys(data).map((key) => ({
            id: key,
            ...data[key],
          }));
          // Sort by newest first
          requestsArray.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setMembershipRequests(requestsArray);
        } else {
          setMembershipRequests([]);
        }
      },
      (error) => {
        console.error("Error fetching requests:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Fetch payments
  useEffect(() => {
    const paymentsRef = dbRef(db, "payments");

    const unsubscribe = onValue(
      paymentsRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const paymentsArray = Object.keys(data).map((key) => ({
            firebaseKey: key,
            ...data[key],
          }));
          setPaymentsData(paymentsArray);
        } else {
          setPaymentsData([]);
        }
      },
      (error) => console.error("Error fetching payments:", error)
    );

    return () => unsubscribe();
  }, []);

  // Fetch dynamic purok settings
  useEffect(() => {
    const puroksRef = dbRef(db, "settings/idSettings/puroks");

    const unsubscribe = onValue(
      puroksRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data && Array.isArray(data) && data.length > 0) {
          setPurokOptions(data);
        } else {
          setPurokOptions(DEFAULT_PUROKS);
        }
      },
      (error) => {
        console.error("Error fetching purok settings:", error);
        setPurokOptions(DEFAULT_PUROKS);
      }
    );

    return () => unsubscribe();
  }, []);

  // Payment summary by OSCA ID for membership status tracking
  const paymentSummaryByOscaId = useMemo(() => {
    if (!paymentsData || paymentsData.length === 0) {
      return {};
    }

    const summary = {};

    paymentsData.forEach((payment) => {
      const oscaID =
        payment?.oscaID || payment?.memberOscaID || payment?.memberId;
      if (!oscaID) return;

      const status = (payment?.payment_status || payment?.status || "paid")
        .toString()
        .toLowerCase();
      if (["void", "cancelled", "failed"].includes(status)) return;

      const rawDate =
        payment?.payDate ||
        payment?.date_created ||
        payment?.createdAt ||
        payment?.timestamp;

      if (!rawDate) return;

      const parsedDate = new Date(rawDate);
      if (Number.isNaN(parsedDate.getTime())) return;

      const existing = summary[oscaID]?.lastPaidAt?.getTime() || 0;
      if (!summary[oscaID] || parsedDate.getTime() > existing) {
        summary[oscaID] = {
          lastPaidAt: parsedDate,
        };
      }
    });

    return summary;
  }, [paymentsData]);

  // ✅ Auto-manage membership lifecycle based on latest payment activity
  useEffect(() => {
    if (!members.length) return;

    const now = new Date();
    const nowMs = now.getTime();

    members.forEach((member) => {
      if (!member?.firebaseKey) return;

      // Respect manual overrides for deceased members
      if (member.deceased) return;

      const paymentRecord = paymentSummaryByOscaId[member.oscaID];
      const lastPaymentDate = paymentRecord?.lastPaidAt || null;

      // IMPORTANT: Only proceed if there's an actual payment record
      // Members with no payments should stay archived (no false unarchiving)
      if (!lastPaymentDate) {
        return;
      }

      const memberRef = dbRef(db, `members/${member.firebaseKey}`);
      const lastPaymentMs = lastPaymentDate.getTime();
      const timeSincePayment = nowMs - lastPaymentMs;

      // Case 1: Recent payment within 1 month → Unarchive
      if (timeSincePayment <= ONE_MONTH_MS) {
        if (member.archived) {
          update(memberRef, {
            archived: false,
            date_updated: now.toISOString(),
          });
          console.log(
            `✅ Auto-unarchived ${member.firstName || ""} ${
              member.lastName || ""
            } — recent payment detected`
          );
        }
        return;
      }

      // Case 2: Unpaid for 1-12 months → Archive
      if (timeSincePayment > ONE_MONTH_MS && timeSincePayment < ONE_YEAR_MS) {
        if (!member.archived) {
          update(memberRef, {
            archived: true,
            date_updated: now.toISOString(),
          });
          console.log(
            `📦 Auto-archived ${member.firstName || ""} ${
              member.lastName || ""
            } — unpaid for over a month`
          );
        }
        return;
      }

      // Case 3: Unpaid for 12+ months → Mark as deceased
      if (timeSincePayment >= ONE_YEAR_MS) {
        update(memberRef, {
          archived: true,
          deceased: true,
          date_updated: now.toISOString(),
        });
        console.log(
          `☠️ Auto-marked ${member.firstName || ""} ${
            member.lastName || ""
          } as deceased — unpaid for 12+ months`
        );
        return;
      }
    });
  }, [members, paymentSummaryByOscaId]);

  const getMemberPaymentStatus = useCallback(
    (member) => {
      if (!member) {
        return {
          label: "Unpaid",
          variant: "bg-amber-100 text-amber-700",
          lastPaidAt: null,
        };
      }

      const record = paymentSummaryByOscaId[member.oscaID];
      if (!record?.lastPaidAt) {
        return {
          label: "Unpaid",
          variant: "bg-amber-100 text-amber-700",
          lastPaidAt: null,
        };
      }

      const diff = Date.now() - record.lastPaidAt.getTime();
      const withinYear = diff <= ONE_YEAR_MS;

      return {
        label: withinYear ? "Paid" : "Unpaid",
        variant: withinYear
          ? "bg-emerald-100 text-emerald-700"
          : "bg-amber-100 text-amber-700",
        lastPaidAt: record.lastPaidAt,
        diffMs: diff,
      };
    },
    [paymentSummaryByOscaId]
  );

  // Helpers
  const extractBarangay = (address) => {
    if (!address) return "Pinagbuhatan";

    // Check if address contains [Barangay format]
    const bracketMatch = address.match(/\[Barangay\s+([^,\]]+)/i);
    if (bracketMatch) {
      return bracketMatch[1].trim();
    }

    // Old format: "Purok Catleya, Pinagbuhatan, Pasig City, Metro Manila, Manila"
    const parts = address.split(",").map((part) => part.trim());
    if (parts.length >= 2) {
      // Pinagbuhatan is typically the second part after Purok
      const barangay = parts[1];
      // Return Pinagbuhatan if found, otherwise default to Pinagbuhatan
      return barangay || "Pinagbuhatan";
    }

    // Default to Pinagbuhatan since all members are from this barangay
    return "Pinagbuhatan";
  };

  const extractPurok = (member) => {
    // Check if purok is stored as separate field
    if (member.purok) return member.purok;
    // Otherwise try to extract from address - it should be in position [0] if format is "Purok, Street, Barangay"
    if (member.address) {
      const parts = member.address.split(",");
      return parts.length >= 1 ? parts[0].trim() : "N/A";
    }
    return "N/A";
  };

  const isDeceased = (member) => member.deceased === true;

  const handleReviewRequest = (request) => {
    setSelectedRequest(request);
    setShowRequestsCenter(false);
    setShowRequestModal(true);
  };

  // CSV Export Handler
  const handleExportCSV = () => {
    const exportDate = new Date();
    const formattedDate = exportDate.toLocaleDateString();
    const formattedTime = exportDate.toLocaleTimeString();

    // Calculate statistics
    const totalMembers = filteredMembers.length;
    const activeMembersCount = filteredMembers.filter(
      (m) => !m.archived && !isDeceased(m)
    ).length;
    const archivedMembersCount = filteredMembers.filter(
      (m) => m.archived && !isDeceased(m)
    ).length;
    const deceasedMembersCount = filteredMembers.filter((m) =>
      isDeceased(m)
    ).length;

    // Create header section with metadata
    const metadata = [
      ["ELDEREASE SENIOR CITIZEN MANAGEMENT SYSTEM"],
      ["Member Export Report"],
      [""],
      [`Generated on: ${formattedDate} at ${formattedTime}`],
      [
        `Report Type: ${
          activeTab.charAt(0).toUpperCase() + activeTab.slice(1)
        } Members`,
      ],
      [`Total Records: ${totalMembers}`],
      [""],
      [],
    ];

    const headers = [
      "First Name",
      "Last Name",
      "OSCA ID",
      "Age",
      "Gender",
      "Contact Number",
      "Barangay",
      "Full Address",
      "Status",
      "Date Created",
    ];

    const rows = filteredMembers.map((member) => {
      const status = isDeceased(member)
        ? "Deceased"
        : member.archived
        ? "Archived"
        : "Active";

      return [
        member.firstName || "",
        member.lastName || "",
        member.oscaID || "",
        member.age || "",
        member.gender || "",
        member.contactNum || "",
        extractBarangay(member.address) || "N/A",
        member.address || "",
        status,
        member.date_created
          ? new Date(member.date_created).toLocaleDateString()
          : "",
      ];
    });

    // Add summary section
    const summaryRows = [
      [],
      ["MEMBER STATUS SUMMARY"],
      ["Status", "Count"],
      ["Active", activeMembersCount],
      ["Archived", archivedMembersCount],
      ["Deceased", deceasedMembersCount],
      [],
      ["GENDER DISTRIBUTION"],
      ["Gender", "Count"],
      ...Object.entries(
        filteredMembers.reduce((acc, m) => {
          const gender = m.gender || "Not Specified";
          acc[gender] = (acc[gender] || 0) + 1;
          return acc;
        }, {})
      ).map(([gender, count]) => [gender, count]),
      [],
      ["AGE GROUP DISTRIBUTION"],
      ["Age Group", "Count"],
      [
        "60-69",
        filteredMembers.filter((m) => m.age >= 60 && m.age <= 69).length,
      ],
      [
        "70-79",
        filteredMembers.filter((m) => m.age >= 70 && m.age <= 79).length,
      ],
      ["80+", filteredMembers.filter((m) => m.age >= 80).length],
    ];

    // Combine all sections
    const allRows = [...metadata, headers, ...rows, ...summaryRows];

    // Create CSV content with proper quoting
    const csvContent = allRows
      .map((row) =>
        row
          .map((cell) => {
            const cellStr = String(cell);
            // Quote cells containing commas, quotes, or newlines
            if (
              cellStr.includes(",") ||
              cellStr.includes('"') ||
              cellStr.includes("\n")
            ) {
              return `"${cellStr.replace(/"/g, '""')}"`;
            }
            return cellStr;
          })
          .join(",")
      )
      .join("\n");

    // Create blob and download
    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `ElderEase_Citizens_${activeTab}_${new Date()
        .toISOString()
        .slice(0, 10)}_${new Date()
        .toISOString()
        .slice(11, 16)
        .replace(":", "")}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Filter logic
  const barangayOptions = useMemo(() => {
    const unique = new Set();
    members.forEach((member) => {
      const derived = extractBarangay(member.address);
      if (derived && derived !== "N/A") {
        unique.add(derived);
      }
    });
    return Array.from(unique).sort();
  }, [members]);

  const availablePuroks = useMemo(() => {
    if (purokOptions && purokOptions.length > 0) {
      return [...purokOptions];
    }

    const dynamic = new Set();
    members.forEach((member) => {
      const derived = extractPurok(member);
      if (derived && derived !== "N/A") {
        dynamic.add(derived);
      }
    });
    return Array.from(dynamic).sort();
  }, [members, purokOptions]);

  const filteredMembers = members
    .filter((member) => {
      const matchesTab =
        activeTab === "active"
          ? !member.archived && !isDeceased(member)
          : activeTab === "archived"
          ? member.archived === true && !isDeceased(member)
          : activeTab === "deceased"
          ? isDeceased(member)
          : true;

      const matchesSearch =
        `${member.firstName} ${member.lastName} ${member.oscaID} ${member.contactNum}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase());

      const matchesBarangay =
        !selectedBarangay ||
        extractBarangay(member.address) === selectedBarangay;

      const matchesAgeRange =
        !selectedAgeRange ||
        (selectedAgeRange === "60-69" &&
          member.age >= 60 &&
          member.age <= 69) ||
        (selectedAgeRange === "70-79" &&
          member.age >= 70 &&
          member.age <= 79) ||
        (selectedAgeRange === "80+" && member.age >= 80);

      const matchesGender =
        !selectedGender ||
        (selectedGender === "Male" && member.gender === "Male") ||
        (selectedGender === "Female" && member.gender === "Female");

      const matchesStatus =
        !selectedStatus ||
        (selectedStatus === "Active" &&
          !member.archived &&
          !isDeceased(member)) ||
        (selectedStatus === "Archived" && member.archived === true) ||
        (selectedStatus === "Deceased" && isDeceased(member));

      const matchesPurok =
        !selectedPurok || extractPurok(member) === selectedPurok;

      return (
        matchesTab &&
        matchesSearch &&
        matchesBarangay &&
        matchesAgeRange &&
        matchesGender &&
        matchesStatus &&
        matchesPurok
      );
    })
    .sort((a, b) => {
      // Apply surname sorting if selected
      if (surnameSortOrder) {
        const surnameA = (a.lastName || "").toLowerCase();
        const surnameB = (b.lastName || "").toLowerCase();
        return surnameSortOrder === "asc"
          ? surnameA.localeCompare(surnameB)
          : surnameB.localeCompare(surnameA);
      }
      return 0;
    });

  // Actions
  const handleViewProfile = (member) => {
    memberSearch.openMemberProfile(member);
  };

  const handleArchiveMember = (member) => {
    const memberName = formatMemberName(member);
    const { lastPaymentEntry, lastPaymentDate } = getMemberPaymentInfo(member);

    const lastFacialDate = member?.lastFacialRecognition
      ? new Date(member.lastFacialRecognition)
      : null;

    const lastActivityDate =
      lastPaymentDate && lastFacialDate
        ? new Date(
            Math.max(lastPaymentDate.getTime(), lastFacialDate.getTime())
          )
        : lastPaymentDate || lastFacialDate;

    const hasRecentActivity =
      lastActivityDate && Date.now() - lastActivityDate.getTime() < ONE_YEAR_MS;

    if (hasRecentActivity) {
      openDialog({
        title: "Cannot Archive Member",
        variant: "warning",
        confirmLabel: "Close",
        body: (
          <div className="space-y-4 text-sm text-gray-600">
            <p>
              <span className="font-semibold text-gray-800">{memberName}</span>{" "}
              has recent activity within the last 12 months and must remain
              active.
            </p>
            <div>
              <p className="font-medium text-gray-700">Latest records</p>
              <ul className="mt-2 space-y-1">
                {lastPaymentEntry && (
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-purple-500"></span>
                    <span>{formatPaymentSummary(lastPaymentEntry)}</span>
                  </li>
                )}
                {lastFacialDate && (
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-purple-500"></span>
                    <span>
                      Last face verification{" "}
                      {formatDateTimeForDisplay(lastFacialDate)}
                    </span>
                  </li>
                )}
              </ul>
            </div>
            <p className="text-xs text-gray-500">
              Members with activity in the last 12 months cannot be archived.
            </p>
          </div>
        ),
        onConfirm: ({ closeDialog }) => closeDialog(),
      });
      return;
    }

    openDialog({
      title: "Archive Member",
      variant: "warning",
      confirmLabel: "Archive",
      cancelLabel: "Cancel",
      showCancel: true,
      body: (
        <div className="space-y-4 text-sm text-gray-600">
          <p>
            Archive{" "}
            <span className="font-semibold text-gray-800">{memberName}</span>?
            They will move to the Archived list.
          </p>
          <div>
            <p className="font-medium text-gray-700">Recent records</p>
            <ul className="mt-2 space-y-1">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-purple-500"></span>
                <span>
                  {lastPaymentEntry
                    ? formatPaymentSummary(lastPaymentEntry)
                    : "No paid transactions recorded."}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-purple-500"></span>
                <span>
                  {lastFacialDate
                    ? `Last face verification ${formatDateTimeForDisplay(
                        lastFacialDate
                      )}`
                    : "No face verification on record."}
                </span>
              </li>
            </ul>
          </div>
          <p className="text-xs text-gray-500">
            You can restore archived members anytime from the Archived tab.
          </p>
        </div>
      ),
      onConfirm: async ({ closeDialog, openDialog }) => {
        closeDialog();
        try {
          const memberRef = dbRef(db, `members/${member.firebaseKey}`);
          await update(memberRef, {
            archived: true,
            date_updated: new Date().toISOString(),
            updatedBy: actorLabel,
            updatedById: actorId,
            lastActionByRole: actorRole,
            archivedBy: actorLabel,
            archivedById: actorId,
          });
          await auditLogger.logMemberArchived(
            member.firebaseKey,
            memberName,
            "Manual archive"
          );
          openDialog({
            title: "Member Archived",
            variant: "success",
            confirmLabel: "Close",
            body: (
              <div className="space-y-2 text-sm text-gray-600">
                <p>
                  <span className="font-semibold text-gray-800">
                    {memberName}
                  </span>{" "}
                  has been moved to Archived members.
                </p>
              </div>
            ),
            onConfirm: ({ closeDialog }) => closeDialog(),
          });
        } catch (error) {
          console.error("Error archiving member:", error);
          openDialog({
            title: "Failed to Archive",
            variant: "danger",
            confirmLabel: "Close",
            body: (
              <div className="space-y-2 text-sm text-gray-600">
                <p>We couldn't archive the member. Please try again.</p>
                <p className="text-xs text-gray-500">
                  {error.message || "Unknown error occurred."}
                </p>
              </div>
            ),
            onConfirm: ({ closeDialog }) => closeDialog(),
          });
        }
      },
    });
  };

  const handleDeleteMember = (member) => {
    const memberName = formatMemberName(member);

    openDialog({
      title: "Delete Member",
      variant: "danger",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      showCancel: true,
      body: (
        <div className="space-y-4 text-sm text-gray-600">
          <p>
            Permanently delete{" "}
            <span className="font-semibold text-gray-800">{memberName}</span>?
          </p>
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            This action cannot be undone. All records for this member will be
            removed.
          </div>
        </div>
      ),
      onConfirm: async ({ closeDialog, openDialog }) => {
        closeDialog();
        try {
          const memberRef = dbRef(db, `members/${member.firebaseKey}`);
          await remove(memberRef);
          await auditLogger.logMemberDeleted(
            member.firebaseKey,
            memberName,
            member
          );
          openDialog({
            title: "Member Deleted",
            variant: "success",
            confirmLabel: "Close",
            body: (
              <div className="space-y-2 text-sm text-gray-600">
                <p>
                  <span className="font-semibold text-gray-800">
                    {memberName}
                  </span>{" "}
                  has been removed from the database.
                </p>
              </div>
            ),
            onConfirm: ({ closeDialog }) => closeDialog(),
          });
        } catch (error) {
          console.error("Error deleting member:", error);
          openDialog({
            title: "Delete Failed",
            variant: "danger",
            confirmLabel: "Close",
            body: (
              <div className="space-y-2 text-sm text-gray-600">
                <p>We couldn't delete the member. Please try again.</p>
                <p className="text-xs text-gray-500">
                  {error.message || "Unknown error occurred."}
                </p>
              </div>
            ),
            onConfirm: ({ closeDialog }) => closeDialog(),
          });
        }
      },
    });
  };

  // ✅ Mark member as deceased manually
  const handleMarkAsDeceased = (member) => {
    const memberName = formatMemberName(member);
    const { lastPaymentEntry, lastPaymentDate } = getMemberPaymentInfo(member);

    const lastFacialDate = member?.lastFacialRecognition
      ? new Date(member.lastFacialRecognition)
      : null;

    const lastActivityDate =
      lastPaymentDate && lastFacialDate
        ? new Date(
            Math.max(lastPaymentDate.getTime(), lastFacialDate.getTime())
          )
        : lastPaymentDate || lastFacialDate;

    const hasRecentActivity =
      lastActivityDate && Date.now() - lastActivityDate.getTime() < ONE_YEAR_MS;

    openDialog({
      title: "Mark as Deceased",
      variant: "danger",
      confirmLabel: "Mark as Deceased",
      cancelLabel: "Cancel",
      showCancel: true,
      body: (
        <div className="space-y-4 text-sm text-gray-600">
          {hasRecentActivity && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
              Recent activity detected within the last 12 months
            </div>
          )}
          <p>
            Move{" "}
            <span className="font-semibold text-gray-800">{memberName}</span> to
            the Deceased list?
          </p>
          <div>
            <p className="font-medium text-gray-700">Latest records</p>
            <ul className="mt-2 space-y-1">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-purple-500"></span>
                <span>
                  {lastPaymentEntry
                    ? formatPaymentSummary(lastPaymentEntry)
                    : "No paid transactions recorded."}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-purple-500"></span>
                <span>
                  {lastFacialDate
                    ? `Last face verification ${formatDateTimeForDisplay(
                        lastFacialDate
                      )}`
                    : "No face verification on record."}
                </span>
              </li>
            </ul>
          </div>
          <p className="text-xs text-gray-500">
            This update is logged in the audit trail.
          </p>
        </div>
      ),
      onConfirm: async ({ closeDialog, openDialog }) => {
        closeDialog();
        try {
          const memberRef = dbRef(db, `members/${member.firebaseKey}`);
          await update(memberRef, {
            deceased: true,
            date_updated: new Date().toISOString(),
            updatedBy: actorLabel,
            updatedById: actorId,
            lastActionByRole: actorRole,
          });
          await auditLogger.logAction("MARK_DECEASED", "Senior Citizens", {
            recordId: member.firebaseKey,
            recordName: memberName,
          });
          openDialog({
            title: "Marked as Deceased",
            variant: "success",
            confirmLabel: "Close",
            body: (
              <div className="space-y-2 text-sm text-gray-600">
                <p>
                  <span className="font-semibold text-gray-800">
                    {memberName}
                  </span>{" "}
                  is now listed under Deceased members.
                </p>
              </div>
            ),
            onConfirm: ({ closeDialog }) => closeDialog(),
          });
        } catch (error) {
          console.error("Error marking as deceased:", error);
          openDialog({
            title: "Update Failed",
            variant: "danger",
            confirmLabel: "Close",
            body: (
              <div className="space-y-2 text-sm text-gray-600">
                <p>
                  We couldn't mark the member as deceased. Please try again.
                </p>
                <p className="text-xs text-gray-500">
                  {error.message || "Unknown error occurred."}
                </p>
              </div>
            ),
            onConfirm: ({ closeDialog }) => closeDialog(),
          });
        }
      },
    });
  };

  // ✅ Restore deceased member to active
  const handleRestoreFromDeceased = (member) => {
    const memberName = formatMemberName(member);
    const { membershipPayments, lastMembershipPaymentEntry, lastPaymentEntry } =
      getMemberPaymentInfo(member);

    const hasPaidMembershipFee = membershipPayments.length > 0;
    const lastFacialDate = member?.lastFacialRecognition
      ? new Date(member.lastFacialRecognition)
      : null;

    const missingRequirements = [];
    if (!hasPaidMembershipFee)
      missingRequirements.push("Membership fee payment");
    if (!lastFacialDate) missingRequirements.push("Face verification");

    if (missingRequirements.length > 0) {
      openDialog({
        title: "Restore Requirements Incomplete",
        variant: "warning",
        confirmLabel: "Close",
        body: (
          <div className="space-y-4 text-sm text-gray-600">
            <p>
              <span className="font-semibold text-gray-800">{memberName}</span>{" "}
              cannot be restored yet.
            </p>
            <div>
              <p className="font-medium text-gray-700">Missing requirements</p>
              <ul className="mt-2 space-y-1">
                {missingRequirements.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500"></span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium text-gray-700">
                Latest payment on file
              </p>
              <p className="mt-1 text-gray-600">
                {lastPaymentEntry
                  ? formatPaymentSummary(lastPaymentEntry)
                  : "No paid transactions recorded."}
              </p>
            </div>
          </div>
        ),
        onConfirm: ({ closeDialog }) => closeDialog(),
      });
      return;
    }

    openDialog({
      title: "Restore Member",
      variant: "info",
      confirmLabel: "Restore",
      cancelLabel: "Cancel",
      showCancel: true,
      body: (
        <div className="space-y-4 text-sm text-gray-600">
          <p>
            Restore{" "}
            <span className="font-semibold text-gray-800">{memberName}</span> to
            active status?
          </p>
          <div>
            <p className="font-medium text-gray-700">Verification summary</p>
            <ul className="mt-2 space-y-1">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-purple-500"></span>
                <span>
                  {lastMembershipPaymentEntry
                    ? formatPaymentSummary(lastMembershipPaymentEntry)
                    : lastPaymentEntry
                    ? formatPaymentSummary(lastPaymentEntry)
                    : "No paid transactions recorded."}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-purple-500"></span>
                <span>
                  {lastFacialDate
                    ? `Last face verification ${formatDateTimeForDisplay(
                        lastFacialDate
                      )}`
                    : "No face verification on record."}
                </span>
              </li>
            </ul>
          </div>
        </div>
      ),
      onConfirm: async ({ closeDialog, openDialog }) => {
        closeDialog();
        try {
          const memberRef = dbRef(db, `members/${member.firebaseKey}`);
          await update(memberRef, {
            deceased: false,
            archived: false,
            date_updated: new Date().toISOString(),
            updatedBy: actorLabel,
            updatedById: actorId,
            lastActionByRole: actorRole,
          });
          await auditLogger.logAction(
            "RESTORE_FROM_DECEASED",
            "Senior Citizens",
            {
              recordId: member.firebaseKey,
              recordName: memberName,
            }
          );
          setActiveTab("active");
          openDialog({
            title: "Member Restored",
            variant: "success",
            confirmLabel: "Close",
            body: (
              <div className="space-y-2 text-sm text-gray-600">
                <p>
                  <span className="font-semibold text-gray-800">
                    {memberName}
                  </span>{" "}
                  is now active again.
                </p>
              </div>
            ),
            onConfirm: ({ closeDialog }) => closeDialog(),
          });
        } catch (error) {
          console.error("Error restoring member:", error);
          openDialog({
            title: "Restore Failed",
            variant: "danger",
            confirmLabel: "Close",
            body: (
              <div className="space-y-2 text-sm text-gray-600">
                <p>We couldn't restore the member. Please try again.</p>
                <p className="text-xs text-gray-500">
                  {error.message || "Unknown error occurred."}
                </p>
              </div>
            ),
            onConfirm: ({ closeDialog }) => closeDialog(),
          });
        }
      },
    });
  };

  if (currentUserLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="animate-spin">
          <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header notificationCount={3} />

        <main className="flex-1 overflow-y-auto p-8">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Users className="w-8 h-8 text-purple-600" />
                <h1 className="text-3xl font-bold text-gray-800">
                  Senior Citizen Management
                </h1>
              </div>
              <p className="text-sm text-gray-500 pl-11">
                Comprehensive member management and profile tracking
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRequestsCenter(true)}
                className="relative px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition flex items-center gap-2"
              >
                <Clock className="w-4 h-4 text-purple-600" />
                <span>Membership Requests</span>
                {membershipRequests.length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                    {membershipRequests.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Member
              </button>
              <button
                onClick={() => setShowScanner(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
              >
                <Camera className="w-4 h-4" />
                Scan QR
              </button>
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Export CSV
              </button>
              <button
                onClick={() => setShowPrintModule(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Print Report
              </button>
              <button
                onClick={() => setShowIDSettings(true)}
                className="p-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition flex items-center justify-center"
                aria-label="Open system settings"
              >
                <Settings className="w-4 h-4" />
                <span className="sr-only">Settings</span>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            {[
              { key: "active", label: "Active Members" },
              { key: "archived", label: "Archived" },
              { key: "deceased", label: "Deceased" },
            ].map((tab) => {
              const count = members.filter((m) =>
                tab.key === "active"
                  ? !m.archived && !isDeceased(m)
                  : tab.key === "archived"
                  ? m.archived === true && !isDeceased(m)
                  : isDeceased(m)
              ).length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-6 py-4 rounded-xl font-semibold transition shadow-sm border ${
                    activeTab === tab.key
                      ? "bg-purple-600 text-white border-purple-600"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{tab.label}</span>
                    <span
                      className={`text-sm font-bold ml-2 ${
                        activeTab === tab.key ? "text-white" : "text-purple-600"
                      }`}
                    >
                      {count}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search by name, ID, or contact..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg w-64 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none"
              />
            </div>

            {/* Filters */}
            <select
              value={selectedGender}
              onChange={(e) => setSelectedGender(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400"
            >
              <option value="">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>

            <select
              value={selectedAgeRange}
              onChange={(e) => setSelectedAgeRange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400"
            >
              <option value="">All Ages</option>
              <option value="60-69">60 - 69</option>
              <option value="70-79">70 - 79</option>
              <option value="80+">80+</option>
            </select>

            {/* Purok Filter */}
            <select
              value={selectedPurok}
              onChange={(e) => setSelectedPurok(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400"
            >
              <option value="">All Puroks</option>
              {availablePuroks.map((purok) => (
                <option key={purok} value={purok}>
                  {purok}
                </option>
              ))}
            </select>

            {/* Surname Sorting */}
            <select
              value={surnameSortOrder}
              onChange={(e) => setSurnameSortOrder(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400"
            >
              <option value="">Sort by Surname</option>
              <option value="asc">A - Z</option>
              <option value="desc">Z - A</option>
            </select>

            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedBarangay("");
                setSelectedGender("");
                setSelectedAgeRange("");
                setSelectedStatus("");
                setSelectedPurok("");
                setSurnameSortOrder("");
              }}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-200 transition flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reset Filters
            </button>
          </div>

          {/* Members Table */}
          {loading ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 flex flex-col items-center justify-center">
              <RefreshCw className="w-12 h-12 text-purple-600 animate-spin mb-4" />
              <p className="text-gray-600">Loading members...</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {filteredMembers.length === 0 ? (
                <div className="p-12 text-center">
                  <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-600 text-lg mb-2">No members found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Profile
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          OSCA ID
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Member Details
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Contact
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Membership
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredMembers.map((member) => (
                        <tr
                          key={member.firebaseKey}
                          className="hover:bg-gray-50 transition"
                        >
                          <td className="px-4 py-4">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white text-sm font-bold">
                              {member.img ? (
                                <img
                                  src={member.img}
                                  alt={`${member.firstName} ${member.lastName}`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <>
                                  {member.firstName?.charAt(0) || ""}
                                  {member.lastName?.charAt(0) || ""}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm font-medium text-gray-900">
                              {member.oscaID}
                            </div>
                            <div className="text-xs text-gray-500">
                              {member.contactNum}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm font-medium text-gray-900">
                              {`${member.lastName || ""} ${
                                member.suffix || ""
                              } ${member.firstName || ""} ${
                                member.middleName || ""
                              }`.trim()}
                            </div>
                            <div className="text-xs text-gray-500">
                              {member.age} years old • {member.gender || "N/A"}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-900">
                              {member.contactNum || "N/A"}
                            </div>
                            <div className="text-xs text-gray-500">
                              {extractBarangay(member.address)}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            {(() => {
                              const membershipInfo =
                                getMemberPaymentStatus(member);
                              return (
                                <div className="flex flex-col gap-1">
                                  <span
                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${membershipInfo.variant}`}
                                  >
                                    {membershipInfo.label}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {membershipInfo.lastPaidAt
                                      ? `Last paid ${membershipInfo.lastPaidAt.toLocaleDateString()}`
                                      : "No payment record"}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                isDeceased(member)
                                  ? "bg-red-100 text-red-700"
                                  : member.archived
                                  ? "bg-gray-100 text-gray-800"
                                  : "bg-green-100 text-green-800"
                              }`}
                            >
                              {isDeceased(member)
                                ? "Deceased"
                                : member.archived
                                ? "Archived"
                                : "Active"}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleViewProfile(member)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                title="View Profile"
                              >
                                <Users className="w-4 h-4" />
                              </button>

                              {activeTab === "active" && (
                                <button
                                  onClick={() => handleArchiveMember(member)}
                                  className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition"
                                  title="Archive"
                                >
                                  <Archive className="w-4 h-4" />
                                </button>
                              )}
                              {activeTab === "archived" && (
                                <button
                                  onClick={() => handleUnarchiveMember(member)}
                                  className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition"
                                  title="Unarchive"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                              )}

                              {!member.deceased && (
                                <button
                                  onClick={() => handleMarkAsDeceased(member)}
                                  className="p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
                                  title="Mark as Deceased"
                                >
                                  <HeartPulse className="w-4 h-4" />
                                </button>
                              )}

                              {member.deceased && (
                                <button
                                  onClick={() =>
                                    handleRestoreFromDeceased(member)
                                  }
                                  className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                                  title="Restore to Active"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                              )}

                              <button
                                onClick={() => handleDeleteMember(member)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* QR Scanner */}
      {showScanner && (
        <AIPoweredScanner
          showScanner={showScanner}
          setShowScanner={setShowScanner}
          scChapterData={members}
          paymentsData={paymentsData}
          getImagePath={(url) => url || "/img/default-avatar.png"}
          isDeceased={isDeceased}
          extractBarangay={extractBarangay}
          onMemberFound={(member) => {
            // Guard: Check if member is archived or deceased
            if (member.archived || isDeceased(member)) {
              const statusLabel = isDeceased(member) ? "Deceased" : "Archived";
              openDialog({
                title: "Member Not Active",
                variant: "warning",
                confirmLabel: "Close",
                body: (
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>
                      <span className="font-semibold text-gray-800">
                        {formatMemberName(member)}
                      </span>{" "}
                      is currently marked as {statusLabel}.
                    </p>
                    <p className="text-xs text-gray-500">
                      Only active accounts can be opened from the scanner.
                    </p>
                  </div>
                ),
                onConfirm: ({ closeDialog }) => closeDialog(),
              });
              return;
            }
            console.log("📱 Opening profile modal for:", member);
            memberSearch.openMemberProfile(member);
          }}
        />
      )}

      {/* Membership Requests Center */}
      {showRequestsCenter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">
                  Pending Membership Requests
                </h2>
                <p className="text-sm text-gray-500">
                  Review incoming applications and onboard qualified seniors
                </p>
              </div>
              <button
                onClick={() => {
                  setShowRequestsCenter(false);
                  setSelectedRequest(null);
                }}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition"
                aria-label="Close membership requests"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 overflow-y-auto">
              {membershipRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-16 text-gray-500">
                  <Clock className="w-12 h-12 text-purple-300 mb-4" />
                  <p className="text-lg font-semibold">No pending requests</p>
                  <p className="text-sm mt-1">
                    All membership applications have been processed.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {membershipRequests.map((request) => (
                    <div
                      key={request.id}
                      className="border border-gray-200 rounded-xl p-4 bg-gray-50 hover:bg-white transition shadow-sm hover:shadow-md"
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-600">
                            {request.firstName?.[0]}
                            {request.lastName?.[0]}
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-gray-800">
                              {request.firstName} {request.lastName}
                            </p>
                            <p className="text-sm text-gray-500 break-all">
                              {request.email || "No email provided"}
                            </p>
                            <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                              {request.contactNum && (
                                <span className="px-2 py-1 bg-white rounded-full border border-gray-200">
                                  {request.contactNum}
                                </span>
                              )}
                              {request.age && (
                                <span className="px-2 py-1 bg-white rounded-full border border-gray-200">
                                  Age {request.age}
                                </span>
                              )}
                              {request.createdAt && (
                                <span className="px-2 py-1 bg-white rounded-full border border-gray-200">
                                  {new Date(request.createdAt).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 self-start md:self-center">
                          <button
                            onClick={() => handleReviewRequest(request)}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-semibold"
                          >
                            Review & Accept
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <AddMemberModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onMemberAdded={() => console.log("New member added successfully")}
        />
      )}

      {/* ID Settings Modal */}
      {showIDSettings && (
        <IDSettings
          isOpen={showIDSettings}
          onClose={() => setShowIDSettings(false)}
        />
      )}

      {/* Print Module Modal */}
      {showPrintModule && (
        <PrintModule
          isOpen={showPrintModule}
          onClose={() => setShowPrintModule(false)}
          members={filteredMembers}
        />
      )}

      {/* Membership Request Modal */}
      {selectedRequest && (
        <MembershipRequestModal
          isOpen={showRequestModal}
          onClose={() => {
            setShowRequestModal(false);
            setSelectedRequest(null);
          }}
          requestId={selectedRequest.id}
          requestData={selectedRequest}
          onAccepted={() => {
            setShowRequestsCenter(true);
          }}
        />
      )}

      {dialogConfig.open && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-start gap-3 border-b border-gray-100 px-6 py-4">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${activeDialogStyles.accent}`}
              >
                <DialogIcon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">
                  {dialogConfig.title}
                </h3>
              </div>
              <button
                onClick={handleDialogCancel}
                className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close dialog"
                disabled={dialogLoading}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-4">
              {dialogConfig.body && (
                <div className="text-sm text-gray-600">{dialogConfig.body}</div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              {dialogConfig.showCancel && (
                <button
                  onClick={handleDialogCancel}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                  disabled={dialogLoading}
                >
                  {dialogConfig.cancelLabel}
                </button>
              )}
              <button
                onClick={handleDialogConfirm}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${activeDialogStyles.confirmButton}`}
                disabled={dialogLoading}
              >
                {dialogLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </span>
                ) : (
                  dialogConfig.confirmLabel
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SeniorCitizenManagement;
