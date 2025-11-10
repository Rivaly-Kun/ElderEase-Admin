// Notification Dashboard Component
// Main hub for managing announcements, events, templates, analytics, and message history

import React, { useState, useEffect } from "react";
import { db } from "../services/firebase";
import { ref, get, set, remove, onValue } from "firebase/database";
import { sendSMSBatch, getAccountBalance } from "../services/clicksendService";
import {
  Bell,
  Calendar,
  BarChart3,
  Plus,
  Edit2,
  Trash2,
  AlertCircle,
  MessageSquare,
  Send,
  Eye,
  Copy,
  CheckCircle,
  Users,
  MapPin,
  Clock,
  X,
} from "lucide-react";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { createAuditLogger } from "../utils/AuditLogger";

const UPCOMING_WINDOW_DAYS = 3;

// Helpers to normalize message metadata so analytics stay consistent
const SUCCESS_STATUS_SET = new Set(["success", "completed", "delivered"]);
const FAILURE_STATUS_SET = new Set([
  "failed",
  "failure",
  "undelivered",
  "rejected",
  "blocked",
  "error",
]);

const normalizeStatusValue = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeBarangayName = (value) =>
  typeof value === "string" ? value.trim() : "";

const evaluateStatusList = (statuses) => {
  if (!Array.isArray(statuses) || statuses.length === 0) {
    return null;
  }

  if (statuses.every((status) => SUCCESS_STATUS_SET.has(status))) {
    return "completed";
  }

  if (statuses.some((status) => FAILURE_STATUS_SET.has(status))) {
    return "failed";
  }

  if (
    statuses.some((status) =>
      ["pending", "queued", "processing", "submitted"].includes(status)
    )
  ) {
    return "pending";
  }

  return "pending";
};

const deriveMessageDeliveryStatus = (record = {}) => {
  const primaryStatus = normalizeStatusValue(record.status);
  const secondaryStatus = normalizeStatusValue(record.deliveryStatus);
  const statusHints = [primaryStatus, secondaryStatus].filter(Boolean);

  for (const status of statusHints) {
    if (SUCCESS_STATUS_SET.has(status)) {
      return "completed";
    }

    if (FAILURE_STATUS_SET.has(status)) {
      return "failed";
    }

    if (["pending", "queued", "processing", "submitted"].includes(status)) {
      return "pending";
    }
  }

  const clicksendStatusList = [
    ...(Array.isArray(record.clicksendStatuses)
      ? record.clicksendStatuses.map((status) => normalizeStatusValue(status))
      : []),
    ...(Array.isArray(record.clicksendResponse?.messages)
      ? record.clicksendResponse.messages.map((message) =>
          normalizeStatusValue(message?.status)
        )
      : []),
  ].filter(Boolean);

  const derivedFromMessages = evaluateStatusList(clicksendStatusList);
  if (derivedFromMessages) {
    return derivedFromMessages;
  }

  if (statusHints.includes("sent")) {
    return "completed";
  }

  return "pending";
};

const normalizeMessageRecord = (record = {}) => {
  const normalizedStatus = deriveMessageDeliveryStatus(record);
  const appliedFilters = record.appliedFilters || record.filters || {};

  return {
    ...record,
    rawStatus: record.status,
    status: normalizedStatus,
    deliveryStatus: normalizedStatus,
    barangay: record.barangay || appliedFilters.barangay || null,
    paymentStatus: record.paymentStatus || appliedFilters.paymentStatus || null,
    ageGroup: record.ageGroup || appliedFilters.ageGroup || null,
    recipientBreakdown: Array.isArray(record.recipientBreakdown)
      ? record.recipientBreakdown
      : [],
  };
};

const buildMessagesByBarangay = (history = [], members = []) => {
  const counts = {};

  history.forEach((message) => {
    if (!message) {
      return;
    }

    if (
      Array.isArray(message.recipientBreakdown) &&
      message.recipientBreakdown.length > 0
    ) {
      message.recipientBreakdown.forEach((recipient) => {
        const barangay = normalizeBarangayName(recipient?.barangay);
        if (!barangay) {
          return;
        }

        counts[barangay] = (counts[barangay] || 0) + 1;
      });
      return;
    }

    const barangay = normalizeBarangayName(message.barangay);
    if (barangay) {
      const increment = Number(message.recipientCount) || 1;
      counts[barangay] = (counts[barangay] || 0) + increment;
      return;
    }

    // Fallback: if no barangay on message, count by member barangay distribution
    if (
      Number(message.recipientCount) > 0 &&
      Array.isArray(members) &&
      members.length > 0
    ) {
      const membersPerBarangay = {};
      members.forEach((member) => {
        const memberBarangay = normalizeBarangayName(member.barangay);
        if (memberBarangay) {
          membersPerBarangay[memberBarangay] =
            (membersPerBarangay[memberBarangay] || 0) + 1;
        }
      });

      const totalMembers = Object.values(membersPerBarangay).reduce(
        (a, b) => a + b,
        0
      );
      if (totalMembers > 0) {
        Object.entries(membersPerBarangay).forEach(([barangayName, count]) => {
          const proportion = count / totalMembers;
          const barangayShare = Math.round(message.recipientCount * proportion);
          if (barangayShare > 0) {
            counts[barangayName] = (counts[barangayName] || 0) + barangayShare;
          }
        });
      }
    }
  });

  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
};

const getEventTimestamp = (event) => {
  if (!event || !event.date) {
    return null;
  }

  const rawTime = (event.time || "").toString().trim();
  const validTime = /\d{1,2}:\d{2}/.test(rawTime)
    ? rawTime.padStart(5, "0")
    : "00:00";
  const composed = `${event.date}T${validTime}`;
  const parsed = Date.parse(composed);

  if (!Number.isNaN(parsed)) {
    return parsed;
  }

  const fallback = Date.parse(event.date);
  return Number.isNaN(fallback) ? null : fallback;
};

const sortEventsByDateDesc = (list) => {
  if (!Array.isArray(list)) {
    return [];
  }

  return [...list].sort(
    (a, b) => (getEventTimestamp(b) ?? 0) - (getEventTimestamp(a) ?? 0)
  );
};

const NotificationDashboard = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState("sms_sender");
  const [announcements, setAnnouncements] = useState([]);
  const [events, setEvents] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [messageHistory, setMessageHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attendanceModalEventId, setAttendanceModalEventId] = useState("");

  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    content: "",
    priority: "medium",
    publishedDate: new Date().toISOString().split("T")[0],
  });

  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    date: "",
    time: "",
    location: "",
  });

  const [templateForm, setTemplateForm] = useState({
    name: "",
    category: "reminder",
    content: "",
  });

  const [smsSenderForm, setSmsSenderForm] = useState({
    officer: "",
    recipients: "",
    messageType: "reminder",
    barangay: "",
    paymentStatus: "",
    ageGroup: "",
    subject: "",
    message: "",
  });

  const [barangayDistribution, setBarangayDistribution] = useState([]);
  const [messagesByBarangay, setMessagesByBarangay] = useState([]);
  const [clicksendBalance, setClicksendBalance] = useState(null);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [allMembers, setAllMembers] = useState([]);
  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);

  // Search and filter states for announcements and events
  const [announcementSearch, setAnnouncementSearch] = useState("");
  const [announcementPriorityFilter, setAnnouncementPriorityFilter] =
    useState("all");
  const [eventSearch, setEventSearch] = useState("");
  const [eventDateFilter, setEventDateFilter] = useState("all");

  const actorId = currentUser?.uid || currentUser?.id || "unknown";
  const actorLabel =
    currentUser?.actorLabel ||
    currentUser?.displayName ||
    currentUser?.email ||
    currentUser?.role ||
    "Unknown";

  const auditLogger = createAuditLogger(actorId, actorLabel, currentUser?.role);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);

        const announcementsRef = ref(db, "announcements");
        const announcementsSnapshot = await get(announcementsRef);
        if (isMounted) {
          if (announcementsSnapshot.exists()) {
            const data = Object.entries(announcementsSnapshot.val()).map(
              ([id, value]) => ({
                id,
                ...value,
              })
            );
            setAnnouncements(
              data.sort(
                (a, b) =>
                  new Date(b.publishedDate || 0) -
                  new Date(a.publishedDate || 0)
              )
            );
          } else {
            setAnnouncements([]);
          }
        }

        const eventsRef = ref(db, "events");
        const eventsSnapshot = await get(eventsRef);
        if (isMounted) {
          if (eventsSnapshot.exists()) {
            const data = Object.entries(eventsSnapshot.val()).map(
              ([id, value]) => ({
                id,
                ...value,
              })
            );
            setEvents(sortEventsByDateDesc(data));
          } else {
            setEvents([]);
          }
        }

        const templatesRef = ref(db, "smsTemplates");
        const templatesSnapshot = await get(templatesRef);
        if (isMounted) {
          if (templatesSnapshot.exists()) {
            const data = Object.entries(templatesSnapshot.val()).map(
              ([id, value]) => ({
                id,
                ...value,
              })
            );
            setTemplates(data);
          } else {
            setTemplates([]);
          }
        }

        const historyRef = ref(db, "messageHistory");
        const historySnapshot = await get(historyRef);
        if (isMounted) {
          if (historySnapshot.exists()) {
            const rawHistory = Object.entries(historySnapshot.val()).map(
              ([id, value]) =>
                normalizeMessageRecord({
                  id,
                  ...value,
                })
            );

            rawHistory.sort(
              (a, b) => new Date(b.sentDate || 0) - new Date(a.sentDate || 0)
            );

            setMessageHistory(rawHistory);
          } else {
            setMessageHistory([]);
            setMessagesByBarangay([]);
          }
        }

        const membersRef = ref(db, "members");
        const membersSnapshot = await get(membersRef);
        if (isMounted) {
          if (membersSnapshot.exists()) {
            const rawData = membersSnapshot.val();
            const barangayCount = {};
            const membersList = [];

            Object.entries(rawData).forEach(([memberId, member]) => {
              if (member && typeof member === "object") {
                // For barangay chart
                const normalizedBarangay = normalizeBarangayName(
                  member.barangay
                );
                if (normalizedBarangay) {
                  barangayCount[normalizedBarangay] =
                    (barangayCount[normalizedBarangay] || 0) + 1;
                }
                // Store member data for search/selection
                membersList.push({
                  id: memberId,
                  ...member,
                  barangay: normalizedBarangay || member.barangay || null,
                });
              }
            });

            const chartData = Object.entries(barangayCount)
              .map(([name, value]) => ({
                name,
                value,
              }))
              .sort((a, b) => b.value - a.value);

            setBarangayDistribution(chartData);
            setAllMembers(membersList);
          } else {
            setBarangayDistribution([]);
            setAllMembers([]);
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const eventsRefRealtime = ref(db, "events");
    const unsubscribe = onValue(eventsRefRealtime, (snapshot) => {
      if (snapshot.exists()) {
        const data = Object.entries(snapshot.val()).map(([id, value]) => ({
          id,
          ...value,
        }));
        setEvents(sortEventsByDateDesc(data));
      } else {
        setEvents([]);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setMessagesByBarangay(buildMessagesByBarangay(messageHistory, allMembers));
  }, [messageHistory, allMembers]);

  // Close member dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showMemberDropdown) {
        const dropdown = document.getElementById("member-search-dropdown");
        if (dropdown && !dropdown.contains(e.target)) {
          setShowMemberDropdown(false);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMemberDropdown]);

  // Save template
  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim() || !templateForm.content.trim()) {
      alert("Name and content are required");
      return;
    }

    try {
      const templateId = editingTemplate?.id || Date.now().toString();
      const templateRef = ref(db, `smsTemplates/${templateId}`);
      const isEditing = Boolean(editingTemplate);
      const existingTemplate = isEditing
        ? templates.find((t) => t.id === editingTemplate.id)
        : null;

      const data = {
        name: templateForm.name,
        category: templateForm.category,
        content: templateForm.content,
        updatedAt: new Date().toISOString(),
        updatedBy: actorLabel,
        updatedById: actorId,
      };

      if (!isEditing) {
        data.createdAt = new Date().toISOString();
        data.createdBy = actorLabel;
        data.createdById = actorId;
      }

      await set(templateRef, data);

      if (isEditing) {
        const previousValues = existingTemplate
          ? {
              name: existingTemplate.name,
              category: existingTemplate.category,
              content: existingTemplate.content,
            }
          : null;
        const newValues = {
          name: data.name,
          category: data.category,
          content: data.content,
        };

        await auditLogger.logAction("UPDATE", "SMS Templates", {
          recordId: templateId,
          previousValues,
          newValues,
        });
      } else {
        await auditLogger.logAction("CREATE", "SMS Templates", {
          recordId: templateId,
          name: data.name,
          category: data.category,
        });
      }

      if (isEditing) {
        setTemplates(
          templates.map((t) =>
            t.id === templateId ? { id: templateId, ...data } : t
          )
        );
      } else {
        setTemplates([{ id: templateId, ...data }, ...templates]);
      }

      setShowTemplateModal(false);
      setEditingTemplate(null);
      setTemplateForm({
        name: "",
        category: "reminder",
        content: "",
      });
    } catch (error) {
      console.error("Error saving template:", error);
      alert("Error saving template");
    }
  };

  // Delete template
  const handleDeleteTemplate = async (id, name) => {
    if (window.confirm(`Delete template "${name}"?`)) {
      try {
        const templateRef = ref(db, `smsTemplates/${id}`);
        const targetTemplate = templates.find((t) => t.id === id) || null;
        await remove(templateRef);
        setTemplates(templates.filter((t) => t.id !== id));
        await auditLogger.logAction("DELETE", "SMS Templates", {
          recordId: id,
          name: targetTemplate?.name || name,
          category: targetTemplate?.category || null,
        });
      } catch (error) {
        console.error("Error deleting template:", error);
        alert("Error deleting template");
      }
    }
  };

  // Send SMS via ClickSend API
  const handleSendSMS = async () => {
    if (!smsSenderForm.message.trim()) {
      alert("Message content is required");
      return;
    }

    if (!smsSenderForm.recipients.trim()) {
      alert("Please enter at least one recipient phone number");
      return;
    }

    try {
      // Show loading state
      const historyId = Date.now().toString();
      const recipientList = smsSenderForm.recipients
        ? smsSenderForm.recipients
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];

      const selectedMemberNumbers = selectedMembers
        .map((member) => {
          const rawContact =
            typeof member.contactNum === "string"
              ? member.contactNum.trim()
              : member.contactNum !== undefined && member.contactNum !== null
              ? String(member.contactNum).trim()
              : "";

          if (!rawContact) {
            return null;
          }

          if (rawContact.startsWith("+")) {
            return rawContact;
          }

          const stripped = rawContact.replace(/^0/, "");
          return `+63${stripped}`;
        })
        .filter(Boolean);

      const numbersMatchSelection =
        selectedMemberNumbers.length > 0 &&
        selectedMemberNumbers.length === recipientList.length &&
        selectedMemberNumbers.every((number) => recipientList.includes(number));

      const recipientDetails = numbersMatchSelection
        ? selectedMembers.map((member) => {
            const firstName =
              typeof member.firstName === "string"
                ? member.firstName.trim()
                : "";
            const lastName =
              typeof member.lastName === "string" ? member.lastName.trim() : "";
            const composedName = [firstName, lastName]
              .filter(Boolean)
              .join(" ");

            return {
              memberId: member.id || null,
              fullName:
                composedName ||
                (typeof member.displayName === "string"
                  ? member.displayName.trim()
                  : null) ||
                null,
              barangay: normalizeBarangayName(member.barangay) || null,
              contactNum: member.contactNum || null,
            };
          })
        : [];

      // Validate phone numbers format
      const invalidNumbers = recipientList.filter(
        (num) => !num.startsWith("+")
      );
      if (invalidNumbers.length > 0) {
        alert(
          `Invalid phone number format. Use format: +639001234567\nInvalid: ${invalidNumbers.join(
            ", "
          )}`
        );
        return;
      }

      // Send SMS via ClickSend API
      const smsResult = await sendSMSBatch(
        recipientList,
        smsSenderForm.message,
        "ElderEase"
      );

      if (!smsResult.success) {
        alert(`Error sending SMS: ${smsResult.error}`);
        return;
      }

      // Log to Firebase
      const historyRef = ref(db, `messageHistory/${historyId}`);

      // Determine delivery status from ClickSend response
      console.log("SMS Result messages:", smsResult.messages);
      const allMessagesSuccessful =
        smsResult.messages &&
        smsResult.messages.length > 0 &&
        smsResult.messages.every((msg) => msg.status === "SUCCESS");
      const deliveryStatus = allMessagesSuccessful ? "completed" : "failed";

      console.log("All messages successful:", allMessagesSuccessful);
      console.log("Delivery status:", deliveryStatus);

      const appliedFilters = {
        barangay: smsSenderForm.barangay || null,
        paymentStatus: smsSenderForm.paymentStatus || null,
        ageGroup: smsSenderForm.ageGroup || null,
      };

      appliedFilters.barangay =
        normalizeBarangayName(appliedFilters.barangay) || null;

      const data = {
        messageType: smsSenderForm.messageType,
        subject: smsSenderForm.subject || "SMS Notification",
        recipientCount: smsResult.totalSent,
        status: deliveryStatus,
        deliveryStatus: deliveryStatus,
        sentDate: new Date().toISOString(),
        sentBy: actorLabel,
        sentById: actorId,
        content: smsSenderForm.message,
        clicksendMessageIds: smsResult.messages.map((msg) => msg.message_id),
        clicksendStatuses: smsResult.messages.map((msg) => msg.status),
        clicksendResponse: smsResult,
        appliedFilters,
        barangay: normalizeBarangayName(appliedFilters.barangay) || null,
        paymentStatus: appliedFilters.paymentStatus,
        ageGroup: appliedFilters.ageGroup,
        recipientBreakdown: recipientDetails,
      };

      console.log("Data to be saved:", data);

      await set(historyRef, data);

      await auditLogger.logAction("SEND", "Notifications", {
        recordId: historyId,
        messageType: smsSenderForm.messageType,
        subject: data.subject,
        recipientCount: smsResult.totalSent,
        deliveryStatus: deliveryStatus,
        clicksendStatuses: smsResult.messages.map((msg) => msg.status),
        filters: appliedFilters,
      });

      setMessageHistory((prevHistory) => [
        normalizeMessageRecord({ id: historyId, ...data }),
        ...prevHistory,
      ]);
      setSmsSenderForm({
        officer: "",
        recipients: "",
        messageType: "reminder",
        barangay: "",
        paymentStatus: "",
        ageGroup: "",
        subject: "",
        message: "",
      });

      setSelectedMembers([]);
      setMemberSearchTerm("");
      setShowMemberDropdown(false);

      alert(
        `✅ SMS sent successfully!\n\nTotal messages: ${smsResult.totalSent}\n${
          smsResult.invalidNumbers?.length > 0
            ? `Invalid numbers skipped: ${smsResult.invalidNumbers.length}`
            : ""
        }`
      );
    } catch (error) {
      console.error("Error sending SMS:", error);
      alert(`Error sending SMS: ${error.message}`);
    }
  };

  // Handle member selection
  const handleSelectMember = (member) => {
    // Check if member already selected
    const isAlreadySelected = selectedMembers.some((m) => m.id === member.id);

    let updatedSelectedMembers;
    if (isAlreadySelected) {
      updatedSelectedMembers = selectedMembers.filter(
        (m) => m.id !== member.id
      );
    } else {
      updatedSelectedMembers = [...selectedMembers, member];
    }

    setSelectedMembers(updatedSelectedMembers);

    // Update recipients field with phone numbers
    const phoneNumbers = updatedSelectedMembers
      .map((m) => {
        const contactNum = m.contactNum || "";
        // Add + prefix if not present
        return contactNum.startsWith("+")
          ? contactNum
          : `+63${contactNum.replace(/^0/, "")}`;
      })
      .join(",");

    setSmsSenderForm({
      ...smsSenderForm,
      recipients: phoneNumbers,
    });
  };

  // Filter members based on search
  const filteredMembers = allMembers.filter((member) => {
    // Only show members from registered barangays
    const memberBarangay = member.address
      ? member.address.split(",")[member.address.split(",").length - 2]?.trim()
      : "";

    if (!memberSearchTerm.trim()) return !!memberBarangay; // Only return if has barangay

    const searchLower = memberSearchTerm.toLowerCase();
    const firstName = (member.firstName || "").toLowerCase();
    const lastName = (member.lastName || "").toLowerCase();
    const email = (member.email || "").toLowerCase();
    const contactNum = (member.contactNum || "").toLowerCase();

    return (
      !!memberBarangay && // Must have a barangay
      (firstName.includes(searchLower) ||
        lastName.includes(searchLower) ||
        email.includes(searchLower) ||
        contactNum.includes(searchLower))
    );
  });

  // Get unique barangays from members
  const registeredBarangays = Array.from(
    new Set(
      allMembers
        .map((member) => {
          if (!member.address) return null;
          const parts = member.address.split(",");
          return parts[parts.length - 2]?.trim();
        })
        .filter((b) => !!b)
    )
  ).sort();

  // Check ClickSend Account Balance
  const handleCheckBalance = async () => {
    setCheckingBalance(true);
    try {
      const balance = await getAccountBalance();
      if (balance.success) {
        setClicksendBalance(balance);
        alert(
          `💰 ClickSend Account Balance\n\nBalance: $${
            balance.balance?.toFixed(2) || "0.00"
          }\nCurrency: ${balance.currency || "USD"}\nSMS Credit: ${
            balance.smsCredit || "N/A"
          }`
        );
      } else {
        alert(`Error checking balance: ${balance.error}`);
      }
    } catch (error) {
      console.error("Error checking balance:", error);
      alert(`Error checking balance: ${error.message}`);
    } finally {
      setCheckingBalance(false);
    }
  };

  // Publish event announcement
  const handlePublishEvent = async () => {
    if (!eventForm.title.trim() || !eventForm.date || !eventForm.time) {
      alert("Title, date, and time are required");
      return;
    }

    try {
      const eventId = Date.now().toString();
      const eventRef = ref(db, `events/${eventId}`);
      const timestamp = new Date().toISOString();

      const data = {
        title: eventForm.title,
        description: eventForm.description,
        date: eventForm.date,
        time: eventForm.time,
        location: eventForm.location,
        createdAt: timestamp,
        createdBy: actorLabel,
        createdById: actorId,
      };

      await set(eventRef, data);

      await auditLogger.logAction("CREATE", "Events", {
        recordId: eventId,
        title: data.title,
        date: data.date,
        time: data.time,
        location: data.location || null,
      });

      // Real-time listener will automatically update the events list
      // No need to manually update state here to avoid double entries

      setEventForm({
        title: "",
        description: "",
        date: "",
        time: "",
        location: "",
      });

      alert("Event published successfully!");
    } catch (error) {
      console.error("Error publishing event:", error);
      alert("Error publishing event");
    }
  };

  const handleDeleteEvent = async (id) => {
    if (!window.confirm("Delete this event announcement?")) {
      return;
    }

    try {
      const eventRef = ref(db, `events/${id}`);
      const targetEvent = events.find((event) => event.id === id) || null;
      await remove(eventRef);

      await auditLogger.logAction("DELETE", "Events", {
        recordId: id,
        title: targetEvent?.title || null,
        date: targetEvent?.date || null,
        time: targetEvent?.time || null,
      });

      setEvents((prevEvents) => prevEvents.filter((event) => event.id !== id));
      alert("Event deleted successfully!");
    } catch (error) {
      console.error("Error deleting event:", error);
      alert("Error deleting event");
    }
  };

  const handleViewAttendance = (eventId) => {
    setAttendanceModalEventId(eventId);
    setShowAttendanceModal(true);
  };

  const closeAttendanceModal = () => {
    setShowAttendanceModal(false);
    setAttendanceModalEventId("");
  };

  // Calculate analytics
  const calculateAnalytics = () => {
    const aggregates = messageHistory.reduce(
      (acc, message) => {
        const clicksendStatuses = Array.isArray(message.clicksendStatuses)
          ? message.clicksendStatuses.map((status) =>
              normalizeStatusValue(status)
            )
          : [];

        if (clicksendStatuses.length > 0) {
          clicksendStatuses.forEach((status) => {
            if (SUCCESS_STATUS_SET.has(status)) {
              acc.completed += 1;
            } else if (FAILURE_STATUS_SET.has(status)) {
              acc.failed += 1;
            } else {
              acc.pending += 1;
            }
          });

          acc.total += clicksendStatuses.length;
          return acc;
        }

        const recipientTotal = Number(message.recipientCount) || 0;

        if (recipientTotal === 0) {
          acc.total += 1;
          if (message.status === "completed") {
            acc.completed += 1;
          } else if (message.status === "failed") {
            acc.failed += 1;
          } else {
            acc.pending += 1;
          }
          return acc;
        }

        acc.total += recipientTotal;
        if (message.status === "completed") {
          acc.completed += recipientTotal;
        } else if (message.status === "failed") {
          acc.failed += recipientTotal;
        } else {
          acc.pending += recipientTotal;
        }

        return acc;
      },
      { total: 0, completed: 0, failed: 0, pending: 0 }
    );

    const successRateValue =
      aggregates.total > 0
        ? ((aggregates.completed / aggregates.total) * 100).toFixed(2)
        : "0.00";

    return {
      total: aggregates.total,
      completed: aggregates.completed,
      failed: aggregates.failed,
      successRate: successRateValue,
    };
  };

  const analytics = calculateAnalytics();

  const formatDateTime = (isoString) => {
    if (!isoString) return "—";
    const parsed = new Date(isoString);
    if (Number.isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getAttendanceEntries = (attendance) => {
    if (!attendance || typeof attendance !== "object") return [];
    return Object.entries(attendance)
      .map(([id, record]) => ({
        id,
        ...record,
      }))
      .sort(
        (a, b) =>
          new Date(b.lastUpdated || b.checkedInAt || 0) -
          new Date(a.lastUpdated || a.checkedInAt || 0)
      );
  };

  const activeAttendanceEvent =
    events.find((event) => event.id === attendanceModalEventId) || null;

  const attendanceModalEntries = getAttendanceEntries(
    activeAttendanceEvent?.attendance
  );

  const attendanceModalBarangayCount = attendanceModalEntries.length
    ? new Set(
        attendanceModalEntries.map((entry) => entry.barangay || "Unspecified")
      ).size
    : 0;

  const attendanceModalLastCheckInMs = attendanceModalEntries.reduce(
    (latest, entry) => {
      const candidate = new Date(
        entry.lastUpdated || entry.checkedInAt || 0
      ).getTime();
      return candidate > latest ? candidate : latest;
    },
    0
  );

  const attendanceModalLastCheckInDisplay = attendanceModalLastCheckInMs
    ? formatDateTime(new Date(attendanceModalLastCheckInMs).toISOString())
    : null;

  // Publish announcement
  const handlePublishAnnouncement = async () => {
    if (!announcementForm.title.trim() || !announcementForm.content.trim()) {
      alert("Title and content are required");
      return;
    }

    try {
      const announcementId = Date.now().toString();
      const announcementRef = ref(db, `announcements/${announcementId}`);

      const data = {
        title: announcementForm.title,
        content: announcementForm.content,
        priority: announcementForm.priority || "medium",
        publishedDate: announcementForm.publishedDate,
        createdAt: new Date().toISOString(),
        createdBy: actorLabel,
        createdById: actorId,
      };

      await set(announcementRef, data);
      await auditLogger.logAction("CREATE", "Announcements", {
        recordId: announcementId,
        title: announcementForm.title,
        priority: data.priority,
        publishedDate: data.publishedDate,
      });
      setAnnouncements([{ id: announcementId, ...data }, ...announcements]);

      setAnnouncementForm({
        title: "",
        content: "",
        priority: "medium",
        publishedDate: new Date().toISOString().split("T")[0],
      });

      alert("Announcement published successfully!");
    } catch (error) {
      console.error("Error publishing announcement:", error);
      alert("Error publishing announcement");
    }
  };

  // Delete announcement
  const handleDeleteAnnouncement = async (id) => {
    if (window.confirm("Are you sure you want to delete this announcement?")) {
      try {
        const announcementRef = ref(db, `announcements/${id}`);
        const targetAnnouncement =
          announcements.find((a) => a.id === id) || null;
        await remove(announcementRef);
        setAnnouncements(announcements.filter((a) => a.id !== id));
        await auditLogger.logAction("DELETE", "Announcements", {
          recordId: id,
          title: targetAnnouncement?.title || null,
        });

        alert("Announcement deleted successfully!");
      } catch (error) {
        console.error("Error deleting announcement:", error);
        alert("Error deleting announcement");
      }
    }
  };

  // Filter and search logic
  const filteredAnnouncements = announcements.filter((announcement) => {
    const matchesSearch = announcement.title
      .toLowerCase()
      .includes(announcementSearch.toLowerCase());
    const matchesPriority =
      announcementPriorityFilter === "all" ||
      announcement.priority === announcementPriorityFilter;
    return matchesSearch && matchesPriority;
  });

  const searchTerm = eventSearch.trim().toLowerCase();
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const upcomingThreshold = new Date(
    now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const filteredEvents = events.filter((event) => {
    const haystack = `${event.title || ""} ${event.location || ""}`
      .toLowerCase()
      .trim();
    const matchesSearch = !searchTerm || haystack.includes(searchTerm);
    if (!matchesSearch) {
      return false;
    }

    if (eventDateFilter === "all") {
      return true;
    }

    const eventTimestamp = getEventTimestamp(event);
    if (!eventTimestamp) {
      return true;
    }

    if (eventDateFilter === "past") {
      return eventTimestamp < startOfToday.getTime();
    }

    if (eventDateFilter === "present") {
      return (
        eventTimestamp >= startOfToday.getTime() &&
        eventTimestamp < endOfToday.getTime()
      );
    }

    if (eventDateFilter === "upcoming") {
      return (
        eventTimestamp >= endOfToday.getTime() &&
        eventTimestamp <= upcomingThreshold.getTime()
      );
    }

    if (eventDateFilter === "future") {
      return eventTimestamp > upcomingThreshold.getTime();
    }

    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin mb-4">
            <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full mx-auto"></div>
          </div>
          <p className="text-gray-600">Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-0">
      {/* Page Header */}
      <div className="mb-8 flex items-center gap-4">
        <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl flex items-center justify-center">
          <Bell className="w-8 h-8 text-white" />
        </div>
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Notification Management
          </h1>
          <p className="text-gray-600">
            Send SMS, manage announcements, and track message delivery
          </p>
        </div>
      </div>

      {/* Stats Cards - Matching System Theme */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Messages */}
        <div className="bg-purple-600 rounded-2xl shadow-lg p-6 text-white transform hover:scale-105 transition-transform">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-purple-100 text-sm font-medium mb-1">
                Total Messages Sent
              </p>
              <h3 className="text-4xl font-bold">{analytics.total}</h3>
            </div>
            <MessageSquare className="w-8 h-8 text-purple-200" />
          </div>
          <p className="text-purple-100 text-xs">All time messages</p>
        </div>

        {/* Delivered */}
        <div className="bg-green-600 rounded-2xl shadow-lg p-6 text-white transform hover:scale-105 transition-transform">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-green-100 text-sm font-medium mb-1">
                Successfully Delivered
              </p>
              <h3 className="text-4xl font-bold">{analytics.completed}</h3>
            </div>
            <CheckCircle className="w-8 h-8 text-green-200" />
          </div>
          <p className="text-green-100 text-xs">Completed messages</p>
        </div>

        {/* Failed */}
        <div className="bg-red-600 rounded-2xl shadow-lg p-6 text-white transform hover:scale-105 transition-transform">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-red-100 text-sm font-medium mb-1">Failed</p>
              <h3 className="text-4xl font-bold">{analytics.failed}</h3>
            </div>
            <AlertCircle className="w-8 h-8 text-red-200" />
          </div>
          <p className="text-red-100 text-xs">Failed deliveries</p>
        </div>

        {/* Success Rate */}
        <div className="bg-blue-600 rounded-2xl shadow-lg p-6 text-white transform hover:scale-105 transition-transform">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-blue-100 text-sm font-medium mb-1">
                Success Rate
              </p>
              <h3 className="text-4xl font-bold">{analytics.successRate}%</h3>
            </div>
            <BarChart3 className="w-8 h-8 text-blue-200" />
          </div>
          <p className="text-blue-100 text-xs">Delivery success</p>
        </div>
      </div>

      {/* Tab Navigation - Better design */}
      <div className="mb-8">
        <div className="flex gap-2 bg-white rounded-2xl p-2 shadow-sm border border-gray-200">
          {[
            { id: "sms_sender", label: "📨 SMS & Templates", icon: Send },
            { id: "history", label: "📋 Message History", icon: MessageSquare },
            { id: "announcements", label: "📢 Announcements", icon: Bell },
            { id: "events", label: "🎉 Events", icon: Calendar },
            { id: "analytics", label: "📊 Analytics", icon: BarChart3 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-6 py-3 rounded-xl font-semibold transition ${
                activeTab === tab.id
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* SMS Sender Tab */}
      {activeTab === "sms_sender" && (
        <div className="space-y-6">
          {/* SMS Sender Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Send className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Send SMS</h3>
                <p className="text-gray-600 text-sm">
                  Broadcast messages to seniors
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Recipients Selection */}
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  <Users className="inline w-4 h-4 mr-2" />
                  Select Recipients from Members
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={memberSearchTerm}
                    onChange={(e) => {
                      setMemberSearchTerm(e.target.value);
                      setShowMemberDropdown(true);
                    }}
                    onFocus={() => setShowMemberDropdown(true)}
                    placeholder="Search by name, email, or phone..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  />

                  {showMemberDropdown && (
                    <div
                      id="member-search-dropdown"
                      className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-lg z-50"
                    >
                      {filteredMembers.length > 0 ? (
                        filteredMembers.map((member) => {
                          const isSelected = selectedMembers.some(
                            (m) => m.id === member.id
                          );
                          const displayName =
                            `${member.firstName || ""} ${
                              member.lastName || ""
                            }`.trim() ||
                            member.email ||
                            "Unknown";
                          return (
                            <div
                              key={member.id}
                              onClick={() => handleSelectMember(member)}
                              className={`px-4 py-2 cursor-pointer border-b ${
                                isSelected
                                  ? "bg-purple-100 text-purple-900"
                                  : "hover:bg-gray-50"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="w-4 h-4"
                                />
                                <div className="flex-1">
                                  <p className="font-semibold text-sm">
                                    {displayName}
                                  </p>
                                  <p className="text-xs text-gray-600">
                                    {member.contactNum || "No phone"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="px-4 py-3 text-gray-500 text-sm">
                          {memberSearchTerm
                            ? "No members found"
                            : "Type to search members"}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {selectedMembers.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-semibold text-gray-700 mb-2">
                      Selected Members ({selectedMembers.length}):
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedMembers.map((member) => {
                        const displayName =
                          `${member.firstName || ""} ${
                            member.lastName || ""
                          }`.trim() ||
                          member.email ||
                          "Unknown";
                        return (
                          <div
                            key={member.id}
                            className="bg-purple-100 text-purple-900 px-3 py-1 rounded-full text-sm flex items-center gap-2"
                          >
                            <span>{displayName}</span>
                            <button
                              onClick={() => handleSelectMember(member)}
                              className="hover:text-purple-700 font-bold"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Manual Recipients (optional override) */}
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Manual Recipients (optional - overrides selected members)
                </label>
                <input
                  type="text"
                  value={smsSenderForm.recipients}
                  onChange={(e) =>
                    setSmsSenderForm({
                      ...smsSenderForm,
                      recipients: e.target.value,
                    })
                  }
                  placeholder="e.g., +639001234567,+639007654321"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                />
                <p className="text-xs text-gray-500 mt-1">
                  ℹ️ Format: +639001234567 (with + and country code)
                </p>
              </div>

              {/* Message Type & Template Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Message Type
                  </label>
                  <select
                    value={smsSenderForm.messageType}
                    onChange={(e) =>
                      setSmsSenderForm({
                        ...smsSenderForm,
                        messageType: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  >
                    <option value="reminder">Reminder</option>
                    <option value="announcement">Announcement</option>
                    <option value="payment">Payment Notice</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Use Template
                  </label>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        const selectedTemplate = templates.find(
                          (t) => t.id === e.target.value
                        );
                        if (selectedTemplate) {
                          const updatedForm = {
                            ...smsSenderForm,
                            message: selectedTemplate.content,
                            subject: selectedTemplate.name,
                            messageType:
                              selectedTemplate.category || "reminder",
                          };
                          setSmsSenderForm(updatedForm);
                          alert(
                            `✅ Template "${selectedTemplate.name}" applied!`
                          );
                          // Reset the select to "-- No template --"
                          e.target.value = "";
                        }
                      }
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition bg-white"
                  >
                    <option value="">-- No template --</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Filtering Row */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-900 mb-3">
                  Filter Recipients (Optional)
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <select
                    value={smsSenderForm.barangay}
                    onChange={(e) =>
                      setSmsSenderForm({
                        ...smsSenderForm,
                        barangay: e.target.value,
                      })
                    }
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">All Barangays</option>
                    <option value="barangay1">Barangay 1</option>
                    <option value="barangay2">Barangay 2</option>
                  </select>
                  <select
                    value={smsSenderForm.paymentStatus}
                    onChange={(e) =>
                      setSmsSenderForm({
                        ...smsSenderForm,
                        paymentStatus: e.target.value,
                      })
                    }
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">All Payment Status</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                  </select>
                  <select
                    value={smsSenderForm.ageGroup}
                    onChange={(e) =>
                      setSmsSenderForm({
                        ...smsSenderForm,
                        ageGroup: e.target.value,
                      })
                    }
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">All Ages</option>
                    <option value="60-65">60-65</option>
                    <option value="65-75">65-75</option>
                  </select>
                </div>
              </div>

              {/* Subject & Message */}
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={smsSenderForm.subject}
                  onChange={(e) =>
                    setSmsSenderForm({
                      ...smsSenderForm,
                      subject: e.target.value,
                    })
                  }
                  placeholder="e.g., Monthly Checkup Reminder"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Message Content
                </label>
                <textarea
                  value={smsSenderForm.message}
                  onChange={(e) =>
                    setSmsSenderForm({
                      ...smsSenderForm,
                      message: e.target.value,
                    })
                  }
                  placeholder="Write your message here..."
                  rows={5}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition resize-none"
                />
                <p className="text-xs text-gray-500 mt-2">
                  {smsSenderForm.message.length} characters
                </p>
              </div>

              {/* Estimated Recipients Box */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4">
                <p className="text-blue-900 text-xs font-semibold mb-1">
                  ESTIMATED RECIPIENTS
                </p>
                <p className="text-3xl font-bold text-blue-600">
                  {smsSenderForm.recipients
                    ? smsSenderForm.recipients.split(",").length
                    : 0}{" "}
                  Members
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSendSMS}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl hover:from-purple-600 hover:to-purple-700 transition font-bold shadow-md"
                >
                  <Send size={18} />
                  Send Now
                </button>
              </div>
            </div>
          </div>

          {/* Templates Section */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
                  <Copy className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">
                    SMS Templates
                  </h3>
                  <p className="text-gray-600 text-sm">
                    {templates.length} templates available
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTemplateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition font-semibold"
              >
                <Plus size={18} />
                New Template
              </button>
            </div>

            {/* Templates Table */}
            {templates.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                        Name
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                        Category
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                        Preview
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((template) => (
                      <tr
                        key={template.id}
                        className="border-b border-gray-100 hover:bg-gray-50 transition"
                      >
                        <td className="py-3 px-4 text-sm font-medium text-gray-900">
                          {template.name}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded">
                            {template.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {template.content.substring(0, 40)}...
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              console.log("Using template:", template);
                              const updatedForm = {
                                ...smsSenderForm,
                                message: template.content,
                                subject: template.name,
                              };
                              console.log("Updated form:", updatedForm);
                              setSmsSenderForm(updatedForm);
                              setActiveTab("sms_sender");
                              alert(
                                `✅ Template "${
                                  template.name
                                }" applied! Message: "${template.content.substring(
                                  0,
                                  50
                                )}..."`
                              );
                              // Force a slight delay to ensure state updates
                              setTimeout(() => {
                                const messageField = document.querySelector(
                                  'textarea[placeholder="Write your message here..."]'
                                );
                                if (messageField) {
                                  messageField.focus();
                                  messageField.scrollIntoView({
                                    behavior: "smooth",
                                  });
                                }
                              }, 100);
                            }}
                            className="text-purple-600 hover:text-purple-700 mr-2 font-semibold text-xs"
                            title="Use Template"
                          >
                            Use
                          </button>
                          <button
                            onClick={() => {
                              setEditingTemplate(template);
                              setTemplateForm(template);
                              setShowTemplateModal(true);
                            }}
                            className="text-blue-600 hover:text-blue-700 mr-3"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() =>
                              handleDeleteTemplate(template.id, template.name)
                            }
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <Copy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600">
                  No templates yet. Create one to get started!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages History Tab */}
      {activeTab === "history" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900">
                  Message History
                </h3>
                <p className="text-gray-600 text-sm">
                  {messageHistory.length} messages in history
                </p>
              </div>
            </div>

            {messageHistory.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-4 px-4 text-sm font-semibold text-gray-900">
                        Message Details
                      </th>
                      <th className="text-left py-4 px-4 text-sm font-semibold text-gray-900">
                        Recipients
                      </th>
                      <th className="text-left py-4 px-4 text-sm font-semibold text-gray-900">
                        Status
                      </th>
                      <th className="text-left py-4 px-4 text-sm font-semibold text-gray-900">
                        Sent Date
                      </th>
                      <th className="text-left py-4 px-4 text-sm font-semibold text-gray-900">
                        Sent By
                      </th>
                      <th className="text-center py-4 px-4 text-sm font-semibold text-gray-900">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {messageHistory.map((msg, index) => (
                      <tr
                        key={msg.id}
                        className="border-b border-gray-100 hover:bg-gray-50 transition"
                      >
                        <td className="py-4 px-4">
                          <div>
                            <p className="font-semibold text-gray-900">
                              {msg.messageType?.toUpperCase() || "SMS"}
                            </p>
                            <p className="text-sm text-gray-600">
                              {msg.subject || "No subject"}
                            </p>
                            <span className="inline-block px-2 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded mt-1">
                              {msg.id?.substring(0, 8)}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-gray-900 font-medium">
                          {msg.recipientCount || 0}
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                msg.status === "completed"
                                  ? "bg-green-500"
                                  : msg.status === "failed"
                                  ? "bg-red-500"
                                  : "bg-yellow-500"
                              }`}
                            ></span>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                msg.status === "completed"
                                  ? "bg-green-100 text-green-800"
                                  : msg.status === "failed"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-yellow-100 text-yellow-800"
                              }`}
                            >
                              {msg.status?.charAt(0).toUpperCase() +
                                msg.status?.slice(1) || "Pending"}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-gray-600 text-sm">
                          {new Date(msg.sentDate).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="py-4 px-4 text-gray-600">
                          {msg.sentBy || "Unknown"}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <button
                            onClick={() => {
                              alert(
                                `Message Details:\n\nSubject: ${
                                  msg.subject || "N/A"
                                }\nRecipients: ${
                                  msg.recipientCount || 0
                                }\nStatus: ${msg.status}\nSent by: ${
                                  msg.sentBy
                                }\nDate: ${new Date(
                                  msg.sentDate
                                ).toLocaleDateString()}\n\nMessage:\n${
                                  msg.message ||
                                  msg.content ||
                                  "No message content"
                                }`
                              );
                            }}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-white bg-purple-600 hover:bg-purple-700 transition font-semibold text-sm"
                            title="View Message Details"
                          >
                            <Eye size={16} />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600">No message history yet</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          {/* Analytics Header */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">
                Analytics Dashboard
              </h3>
              <p className="text-gray-600 text-sm">
                Message performance insights
              </p>
            </div>
          </div>

          {/* Charts - AT THE TOP */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
              <h4 className="text-lg font-bold text-gray-900 mb-6">
                🥧 Barangay Distribution
              </h4>
              <div className="space-y-4">
                {barangayDistribution.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={barangayDistribution}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, value }) => `${name}: ${value}`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          <Cell fill="#a855f7" />
                          <Cell fill="#3b82f6" />
                          <Cell fill="#06b6d4" />
                          <Cell fill="#f59e0b" />
                          <Cell fill="#ec4899" />
                          <Cell fill="#14b8a6" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>

                    {/* Legend below chart - dynamic */}
                    <div className="grid grid-cols-2 gap-2 mt-4">
                      {barangayDistribution.map((item, idx) => (
                        <div
                          key={item.name}
                          className="flex items-center gap-2"
                        >
                          <span
                            className="w-3 h-3 rounded"
                            style={{
                              backgroundColor: [
                                "#a855f7",
                                "#3b82f6",
                                "#06b6d4",
                                "#f59e0b",
                                "#ec4899",
                                "#14b8a6",
                              ][idx % 6],
                            }}
                          ></span>
                          <span className="text-sm text-gray-700">
                            {item.name}: {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No barangay data available yet
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
              <h4 className="text-lg font-bold text-gray-900 mb-6">
                📊 Messages Sent by Barangay
              </h4>
              {messagesByBarangay.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart
                    data={messagesByBarangay}
                    margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#a855f7"
                      strokeWidth={3}
                      dot={{ fill: "#a855f7", r: 5 }}
                      name="Messages Sent"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <p>No message data available yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Stats Cards - AT THE BOTTOM */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition">
              <p className="text-sm text-gray-600 font-medium mb-2">
                Total Sent
              </p>
              <p className="text-4xl font-bold text-gray-900 mb-1">
                {analytics.total}
              </p>
              <p className="text-xs text-gray-500">All messages</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition">
              <p className="text-sm text-gray-600 font-medium mb-2">
                Delivered
              </p>
              <p className="text-4xl font-bold text-green-600 mb-1">
                {analytics.completed}
              </p>
              <p className="text-xs text-gray-500">Successfully sent</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition">
              <p className="text-sm text-gray-600 font-medium mb-2">Failed</p>
              <p className="text-4xl font-bold text-red-600 mb-1">
                {analytics.failed}
              </p>
              <p className="text-xs text-gray-500">Delivery failed</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition">
              <p className="text-sm text-gray-600 font-medium mb-2">
                Success Rate
              </p>
              <p className="text-4xl font-bold text-blue-600 mb-1">
                {analytics.successRate}%
              </p>
              <p className="text-xs text-gray-500">Delivery rate</p>
            </div>
          </div>
        </div>
      )}

      {/* Announcements Tab */}
      {activeTab === "announcements" && (
        <div className="space-y-8">
          {/* Announcement Form Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-8 hover:shadow-xl transition">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                <Bell size={24} className="text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  New Announcement
                </h3>
                <p className="text-sm text-gray-600">Broadcast to dashboard</p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Title Field */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={announcementForm.title}
                  onChange={(e) =>
                    setAnnouncementForm({
                      ...announcementForm,
                      title: e.target.value,
                    })
                  }
                  placeholder="e.g., Monthly Health Checkup Reminders"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition placeholder-gray-400 text-sm"
                />
              </div>

              {/* Content Field */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Message
                </label>
                <textarea
                  value={announcementForm.content}
                  onChange={(e) =>
                    setAnnouncementForm({
                      ...announcementForm,
                      content: e.target.value,
                    })
                  }
                  placeholder="Share important updates with seniors..."
                  rows={4}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none placeholder-gray-400 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  {announcementForm.content.length} characters
                </p>
              </div>

              {/* Priority and Date Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Priority
                  </label>
                  <select
                    value={announcementForm.priority}
                    onChange={(e) =>
                      setAnnouncementForm({
                        ...announcementForm,
                        priority: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Publish Date
                  </label>
                  <input
                    type="date"
                    value={announcementForm.publishedDate}
                    onChange={(e) =>
                      setAnnouncementForm({
                        ...announcementForm,
                        publishedDate: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handlePublishAnnouncement}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition font-semibold shadow-md hover:shadow-lg text-sm"
                >
                  <Bell size={16} />
                  Publish
                </button>
                <button
                  className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition font-medium text-sm"
                  onClick={() =>
                    setAnnouncementForm({
                      title: "",
                      content: "",
                      priority: "medium",
                      publishedDate: new Date().toISOString().split("T")[0],
                    })
                  }
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Announcements Table */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-lg">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-4">
                <Bell size={24} className="text-blue-600" />
                Published Announcements ({announcements.length})
              </h3>

              {/* Search and Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Search by Title
                  </label>
                  <input
                    type="text"
                    value={announcementSearch}
                    onChange={(e) => setAnnouncementSearch(e.target.value)}
                    placeholder="Search announcements..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Priority Filter
                  </label>
                  <select
                    value={announcementPriorityFilter}
                    onChange={(e) =>
                      setAnnouncementPriorityFilter(e.target.value)
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="all">All Priorities</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              {/* Results Count */}
              <p className="text-sm text-gray-600 mt-3">
                Showing {filteredAnnouncements.length} of {announcements.length}{" "}
                announcements
              </p>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              {filteredAnnouncements.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                        Title
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                        Priority
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                        Published Date
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                        Content Preview
                      </th>
                      <th className="px-6 py-4 text-center text-sm font-bold text-gray-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAnnouncements.map((announcement, idx) => (
                      <tr
                        key={announcement.id}
                        className={`border-b border-gray-200 hover:bg-blue-50 transition ${
                          idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                        }`}
                      >
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                          {announcement.title}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`inline-flex px-3 py-1 rounded-full text-xs font-bold text-white ${
                              announcement.priority === "high"
                                ? "bg-red-500"
                                : announcement.priority === "medium"
                                ? "bg-yellow-500"
                                : "bg-gray-500"
                            }`}
                          >
                            {announcement.priority.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(
                            announcement.publishedDate
                          ).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                          {announcement.content}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() =>
                              handleDeleteAnnouncement(announcement.id)
                            }
                            className="inline-flex items-center justify-center p-2 text-red-600 hover:bg-red-100 rounded-lg transition"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="px-6 py-12 text-center">
                  <Bell size={32} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">
                    No announcements found matching your criteria.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Events Tab */}
      {activeTab === "events" && (
        <div className="space-y-8">
          {/* Event Form Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-8 hover:shadow-xl transition">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Calendar size={24} className="text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">New Event</h3>
                <p className="text-sm text-gray-600">Schedule activities</p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Event Title */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Event Title
                </label>
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={(e) =>
                    setEventForm({
                      ...eventForm,
                      title: e.target.value,
                    })
                  }
                  placeholder="e.g., Wellness Fair for Seniors"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition placeholder-gray-400 text-sm"
                />
              </div>

              {/* Event Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={eventForm.description}
                  onChange={(e) =>
                    setEventForm({
                      ...eventForm,
                      description: e.target.value,
                    })
                  }
                  placeholder="What to expect at this event..."
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition resize-none placeholder-gray-400 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  {eventForm.description.length} characters
                </p>
              </div>

              {/* Date Time Location Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Date
                  </label>
                  <input
                    type="date"
                    value={eventForm.date}
                    onChange={(e) =>
                      setEventForm({
                        ...eventForm,
                        date: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Time
                  </label>
                  <input
                    type="time"
                    value={eventForm.time}
                    onChange={(e) =>
                      setEventForm({
                        ...eventForm,
                        time: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Location
                  </label>
                  <input
                    type="text"
                    value={eventForm.location}
                    onChange={(e) =>
                      setEventForm({
                        ...eventForm,
                        location: e.target.value,
                      })
                    }
                    placeholder="Venue"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition placeholder-gray-400 text-sm"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handlePublishEvent}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl hover:from-purple-600 hover:to-purple-700 transition font-semibold shadow-md hover:shadow-lg text-sm"
                >
                  <Calendar size={16} />
                  Publish
                </button>
                <button
                  className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition font-medium text-sm"
                  onClick={() =>
                    setEventForm({
                      title: "",
                      description: "",
                      date: "",
                      time: "",
                      location: "",
                    })
                  }
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Events Table */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-lg">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-4">
                <Calendar size={24} className="text-purple-600" />
                Events & Attendance ({events.length})
              </h3>

              {/* Search and Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Search by Title or Location
                  </label>
                  <input
                    type="text"
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                    placeholder="Search events..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Schedule Filter
                  </label>
                  <select
                    value={eventDateFilter}
                    onChange={(e) => setEventDateFilter(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  >
                    <option value="all">All Events</option>
                    <option value="present">Today</option>
                    <option value="upcoming">Next 3 Days</option>
                    <option value="future">Beyond 3 Days</option>
                    <option value="past">Past Events</option>
                  </select>
                </div>
              </div>

              {/* Results Count */}
              <p className="text-sm text-gray-600 mt-3">
                Showing {filteredEvents.length} of {events.length} events
              </p>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              {filteredEvents.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                        Event Title
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                        Date & Time
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                        Location
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                        Description
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                        Attendees
                      </th>
                      <th className="px-6 py-4 text-center text-sm font-bold text-gray-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.map((event, idx) => {
                      const attendanceEntries = getAttendanceEntries(
                        event.attendance
                      );
                      const attendeeCount = attendanceEntries.length;

                      return (
                        <tr
                          key={event.id}
                          className={`border-b border-gray-200 hover:bg-purple-50 transition ${
                            idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                          }`}
                        >
                          <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                            {event.title}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            <div className="flex flex-col">
                              <span>
                                📅{" "}
                                {event.date
                                  ? new Date(event.date).toLocaleDateString()
                                  : "TBD"}
                              </span>
                              <span className="text-xs text-gray-500">
                                🕒 {event.time ? event.time : "Time not set"}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {event.location || "Location TBD"}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                            {event.description || "No description"}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            <span className="font-semibold text-gray-900">
                              {attendeeCount}
                            </span>
                            <span className="ml-1 text-xs text-gray-500">
                              {attendeeCount === 1 ? "attendee" : "attendees"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleViewAttendance(event.id)}
                                className="inline-flex items-center justify-center p-2 text-purple-600 hover:bg-purple-100 rounded-lg transition"
                                aria-label="View attendance"
                              >
                                <Eye size={18} />
                              </button>
                              <button
                                onClick={() => handleDeleteEvent(event.id)}
                                className="inline-flex items-center justify-center p-2 text-red-600 hover:bg-red-100 rounded-lg transition"
                                aria-label="Delete event"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="px-6 py-12 text-center">
                  <Calendar size={32} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">
                    No events found matching your criteria.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAttendanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h4 className="text-xl font-bold text-gray-900">
                  {activeAttendanceEvent?.title || "Event Attendance"}
                </h4>
                <p className="text-sm text-gray-600">
                  {activeAttendanceEvent
                    ? "Real-time attendee details"
                    : "Event data unavailable"}
                </p>
              </div>
              <button
                onClick={closeAttendanceModal}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
                aria-label="Close attendance modal"
              >
                <X size={20} />
              </button>
            </div>

            {activeAttendanceEvent ? (
              <>
                <div className="px-6 py-4 border-b border-gray-200 grid gap-4 sm:grid-cols-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Date
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        {activeAttendanceEvent.date
                          ? new Date(
                              activeAttendanceEvent.date
                            ).toLocaleDateString()
                          : "Date TBD"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Clock size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Time
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        {activeAttendanceEvent.time || "Time TBD"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
                      <MapPin size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Location
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        {activeAttendanceEvent.location || "Location TBD"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-sm font-semibold">
                    <Users size={16} />
                    {attendanceModalEntries.length}{" "}
                    {attendanceModalEntries.length === 1
                      ? "attendee"
                      : "attendees"}
                  </span>
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold">
                    <MapPin className="w-4 h-4" />
                    {attendanceModalBarangayCount}{" "}
                    {attendanceModalBarangayCount === 1
                      ? "barangay"
                      : "barangays"}
                  </span>
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-sm font-semibold">
                    <Clock className="w-4 h-4" />
                    {attendanceModalLastCheckInDisplay || "No check-ins yet"}
                  </span>
                </div>

                <div className="flex-1 overflow-hidden">
                  {attendanceModalEntries.length > 0 ? (
                    <div className="overflow-auto max-h-[52vh]">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                              Participant
                            </th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                              OSCA ID
                            </th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                              Barangay
                            </th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                              First Check-In
                            </th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                              Last Update
                            </th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                              Method
                            </th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                              Registered By
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {attendanceModalEntries.map((entry) => (
                            <tr
                              key={entry.id}
                              className="border-b border-gray-200 hover:bg-purple-50 transition"
                            >
                              <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                                {entry.displayName || "Unknown"}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {entry.oscaID || "—"}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {entry.barangay || "Unspecified"}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {formatDateTime(entry.checkedInAt)}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {formatDateTime(entry.lastUpdated)}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {entry.method === "manual"
                                  ? "Manual Entry"
                                  : entry.method === "qr"
                                  ? "QR Scan"
                                  : "—"}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {entry.registeredBy || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center px-6 py-12 text-sm text-gray-500">
                      No attendance recorded yet.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-gray-500 text-sm">
                Event details could not be loaded.
              </div>
            )}

            {/* Footer with Cancel Button */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={closeAttendanceModal}
                className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SMS Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-gradient-to-r from-orange-600 to-orange-700 px-6 py-6 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-bold text-white">
                  {editingTemplate ? "Edit Template" : "Create New Template"}
                </h3>
                <p className="text-orange-100 text-sm mt-1">
                  {editingTemplate
                    ? "Update your SMS template"
                    : "Create a reusable SMS template"}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowTemplateModal(false);
                  setEditingTemplate(null);
                  setTemplateForm({
                    name: "",
                    category: "reminder",
                    content: "",
                  });
                }}
                className="p-2 text-white hover:bg-orange-500 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Template Name */}
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Template Name
                </label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) =>
                    setTemplateForm({
                      ...templateForm,
                      name: e.target.value,
                    })
                  }
                  placeholder="e.g., Birthday Greetings, Health Reminder"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Category
                </label>
                <select
                  value={templateForm.category}
                  onChange={(e) =>
                    setTemplateForm({
                      ...templateForm,
                      category: e.target.value,
                    })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition bg-white"
                >
                  <option value="reminder">Reminder</option>
                  <option value="announcement">Announcement</option>
                  <option value="alert">Alert</option>
                  <option value="greeting">Greeting</option>
                  <option value="event">Event</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Message Content
                </label>
                <textarea
                  value={templateForm.content}
                  onChange={(e) =>
                    setTemplateForm({
                      ...templateForm,
                      content: e.target.value,
                    })
                  }
                  placeholder="Enter your SMS message template (max 160 characters recommended)"
                  rows="6"
                  maxLength="500"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition resize-none"
                />
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-gray-600">
                    Characters: {templateForm.content.length}/500
                  </span>
                  {templateForm.content.length > 160 && (
                    <span className="text-orange-600 font-semibold">
                      ⚠️ Message exceeds standard SMS length (
                      {Math.ceil(templateForm.content.length / 160)} parts)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowTemplateModal(false);
                  setEditingTemplate(null);
                  setTemplateForm({
                    name: "",
                    category: "reminder",
                    content: "",
                  });
                }}
                className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={
                  !templateForm.name.trim() || !templateForm.content.trim()
                }
                className="px-6 py-2.5 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-xl hover:from-orange-700 hover:to-orange-800 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingTemplate ? "Update Template" : "Create Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationDashboard;
