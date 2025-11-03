import React, { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "../Components/Sidebar";
import Header from "../Components/Header";
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Archive,
  Eye,
  BarChart3,
  TrendingUp,
  Package,
  Users,
  DollarSign,
  Calendar,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
} from "lucide-react";
import {
  ref as dbRef,
  onValue,
  push,
  update,
  remove,
  set,
} from "firebase/database";
import { db } from "../services/firebase";
import useResolvedCurrentUser from "../hooks/useResolvedCurrentUser";
import { createAuditLogger } from "../utils/AuditLogger";

const ServiceAndBenefitsTrack = () => {
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard, availments, benefits
  const [activeMenu, setActiveMenu] = useState(" Benefits Tracking");

  // Availments State
  const [availments, setAvailments] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterBenefit, setFilterBenefit] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Benefits Registry State
  const [benefits, setBenefits] = useState([]);
  const [newBenefit, setNewBenefit] = useState({
    benefitName: "",
    description: "",
    cashValue: "",
    requirements: "",
    isActive: true,
  });
  const [editingBenefit, setEditingBenefit] = useState(null);
  const [showAddBenefitModal, setShowAddBenefitModal] = useState(false);

  // Members for selection
  const [seniors, setSeniors] = useState([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState([]);
  const [showMemberSearchDropdown, setShowMemberSearchDropdown] =
    useState(false);

  // Modals
  const [showAddAvailmentModal, setShowAddAvailmentModal] = useState(false);
  const [showViewDetailsModal, setShowViewDetailsModal] = useState(null);
  const [newAvailment, setNewAvailment] = useState({
    oscaID: "",
    benefitID: "",
    date: "",
    status: "Approved",
    notes: "",
  });

  const [loading, setLoading] = useState(true);

  const { currentUser, loading: userLoading } = useResolvedCurrentUser();

  const actorId = currentUser?.uid || currentUser?.id || "unknown";
  const actorLabel =
    currentUser?.actorLabel ||
    currentUser?.displayName ||
    currentUser?.email ||
    currentUser?.role ||
    "Unknown";

  const auditLogger = useMemo(
    () =>
      createAuditLogger(actorId, actorLabel, currentUser?.role || "Unknown"),
    [actorId, actorLabel, currentUser?.role]
  );

  // Initialize default benefits
  const initializeDefaultBenefits = useCallback(async () => {
    const defaultBenefits = [
      {
        benefitID: "STIP-001",
        benefitName: "Monthly Stipend/Pension",
        description: "Regular monthly financial assistance from the government",
        cashValue: 500,
        requirements: "Qualified senior citizen (60 years old and above)",
        isActive: true,
        dateCreated: new Date().toISOString(),
      },
      {
        benefitID: "MED-001",
        benefitName: "Medical Assistance",
        description:
          "Financial aid for medical needs upon submission of clinical abstract",
        cashValue: 1000,
        requirements: "Clinical abstract, Medical certificate",
        isActive: true,
        dateCreated: new Date().toISOString(),
      },
      {
        benefitID: "BUR-001",
        benefitName: "Burial Assistance",
        description:
          "Financial aid for burial expenses of deceased senior citizens",
        cashValue: 1000,
        requirements: "Death certificate, Family identification",
        isActive: true,
        dateCreated: new Date().toISOString(),
      },
      {
        benefitID: "GRO-001",
        benefitName: "Grocery Packs/Goods Distribution",
        description:
          "Distribution of food packs including rice and grocery items",
        cashValue: 500,
        requirements: "Enrollment in program",
        isActive: true,
        dateCreated: new Date().toISOString(),
      },
      {
        benefitID: "SPEC-001",
        benefitName: "Special Assistance for Bedridden",
        description:
          "Additional assistance for senior citizens who are bedridden",
        cashValue: 1000,
        requirements: "Picture of bedridden senior, Clinical abstract",
        isActive: true,
        dateCreated: new Date().toISOString(),
      },
    ];

    try {
      for (const benefit of defaultBenefits) {
        const benefitsRef = dbRef(db, "benefits");
        await push(benefitsRef, benefit);
      }

      if (auditLogger?.logBulkOperation) {
        await auditLogger.logBulkOperation(
          "CREATE",
          "Benefits Registry",
          defaultBenefits.length,
          {
            initialization: true,
            benefitCodes: defaultBenefits.map((benefit) => benefit.benefitID),
            triggeredBy: actorLabel,
          }
        );
      }
    } catch (error) {
      console.error("Error initializing benefits:", error);
    }
  }, [actorLabel, auditLogger]);

  // Fetch members
  useEffect(() => {
    const membersRef = dbRef(db, "members");
    const unsubscribe = onValue(membersRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const membersList = Object.keys(data).map((key) => ({
          firebaseKey: key,
          ...data[key],
        }));
        setSeniors(membersList);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch benefits registry
  useEffect(() => {
    const benefitsRef = dbRef(db, "benefits");
    const unsubscribe = onValue(benefitsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const benefitsList = Object.keys(data).map((key) => ({
          firebaseKey: key,
          ...data[key],
        }));
        setBenefits(benefitsList);
      } else {
        // Initialize with default benefits if none exist
        initializeDefaultBenefits();
      }
    });
    return () => unsubscribe();
  }, [initializeDefaultBenefits]);

  // Fetch availments
  useEffect(() => {
    const availmentsRef = dbRef(db, "availments");
    const unsubscribe = onValue(availmentsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const availmentsList = Object.keys(data).map((key) => ({
          firebaseKey: key,
          ...data[key],
        }));
        setAvailments(availmentsList);
      } else {
        setAvailments([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Add new benefit
  const addBenefit = async () => {
    if (!newBenefit.benefitName || !newBenefit.cashValue) {
      alert("Please fill in all required fields");
      return;
    }

    try {
      const benefitID = `${newBenefit.benefitName
        .substring(0, 3)
        .toUpperCase()}-${String(benefits.length + 1).padStart(3, "0")}`;

      const benefitsRef = dbRef(db, "benefits");
      const timestamp = new Date().toISOString();
      const parsedCashValue = parseFloat(newBenefit.cashValue);
      const benefitPayload = {
        ...newBenefit,
        benefitID,
        cashValue: Number.isNaN(parsedCashValue) ? 0 : parsedCashValue,
        dateCreated: timestamp,
      };

      const newBenefitRef = push(benefitsRef);
      await set(newBenefitRef, benefitPayload);

      await auditLogger.logAction("CREATE", "Benefits Registry", {
        recordId: newBenefitRef.key,
        benefitId: benefitID,
        name: newBenefit.benefitName,
        cashValue: benefitPayload.cashValue,
        isActive: benefitPayload.isActive,
        requirementsLength: benefitPayload.requirements
          ? benefitPayload.requirements.length
          : 0,
        createdAt: timestamp,
      });

      alert("Benefit added successfully!");
      setNewBenefit({
        benefitName: "",
        description: "",
        cashValue: "",
        requirements: "",
        isActive: true,
      });
      setShowAddBenefitModal(false);
    } catch (error) {
      console.error("Error adding benefit:", error);
      alert("Failed to add benefit");
    }
  };

  // Update benefit
  const updateBenefit = async () => {
    try {
      const benefitRef = dbRef(db, `benefits/${editingBenefit.firebaseKey}`);
      const previousBenefit =
        benefits.find((b) => b.firebaseKey === editingBenefit.firebaseKey) ||
        null;

      const parsedCashValue = parseFloat(editingBenefit.cashValue);
      const updatedValues = {
        benefitName: editingBenefit.benefitName,
        description: editingBenefit.description,
        cashValue: Number.isNaN(parsedCashValue) ? 0 : parsedCashValue,
        requirements: editingBenefit.requirements,
        isActive: editingBenefit.isActive,
      };

      await update(benefitRef, updatedValues);

      const previousValues = previousBenefit
        ? {
            benefitName: previousBenefit.benefitName,
            description: previousBenefit.description,
            cashValue: previousBenefit.cashValue,
            requirements: previousBenefit.requirements,
            isActive: previousBenefit.isActive,
          }
        : null;

      const changes = previousValues
        ? auditLogger.getChangedFields(previousValues, updatedValues)
        : null;

      await auditLogger.logAction("UPDATE", "Benefits Registry", {
        recordId: editingBenefit.firebaseKey,
        benefitId: previousBenefit?.benefitID || editingBenefit.benefitID,
        changes,
        previousValues,
        newValues: updatedValues,
      });
      alert("Benefit updated successfully!");
      setEditingBenefit(null);
    } catch (error) {
      console.error("Error updating benefit:", error);
      alert("Failed to update benefit");
    }
  };

  // Handle member search input
  const handleMemberSearchChange = (e) => {
    const query = e.target.value;
    setMemberSearchQuery(query);

    if (query.trim() === "") {
      setMemberSearchResults([]);
      setShowMemberSearchDropdown(false);
      return;
    }

    // Search members by name or OSCA ID
    const results = seniors
      .filter((s) => {
        const fullName = `${s.firstName || ""} ${
          s.lastName || ""
        }`.toLowerCase();
        const oscaID = (s.oscaID || "").toString().toLowerCase();
        const query_lower = query.toLowerCase();

        return fullName.includes(query_lower) || oscaID.includes(query_lower);
      })
      .slice(0, 8); // Limit to 8 results

    setMemberSearchResults(results);
    setShowMemberSearchDropdown(true);
  };

  // Handle member selection from search
  const handleMemberSelect = (member) => {
    setNewAvailment({ ...newAvailment, oscaID: member.oscaID });
    setMemberSearchQuery("");
    setMemberSearchResults([]);
    setShowMemberSearchDropdown(false);
  };

  // Delete benefit
  const deleteBenefit = async (firebaseKey) => {
    if (!window.confirm("Are you sure you want to delete this benefit?"))
      return;
    try {
      const benefitRef = dbRef(db, `benefits/${firebaseKey}`);
      const targetBenefit =
        benefits.find((b) => b.firebaseKey === firebaseKey) || null;
      await remove(benefitRef);

      await auditLogger.logAction("DELETE", "Benefits Registry", {
        recordId: firebaseKey,
        benefitId: targetBenefit?.benefitID || null,
        name: targetBenefit?.benefitName || null,
        cashValue: targetBenefit?.cashValue ?? null,
        wasActive: targetBenefit?.isActive ?? null,
      });
      alert("Benefit deleted successfully!");
    } catch (error) {
      console.error("Error deleting benefit:", error);
      alert("Failed to delete benefit");
    }
  };

  // Add new availment
  const addAvailment = async () => {
    if (!newAvailment.oscaID || !newAvailment.benefitID) {
      alert("Please select member and benefit");
      return;
    }

    try {
      const member = seniors.find((s) => s.oscaID === newAvailment.oscaID);
      const benefit = benefits.find(
        (b) => b.firebaseKey === newAvailment.benefitID
      );

      const availmentsRef = dbRef(db, "availments");
      const timestamp = new Date().toISOString();
      const availmentPayload = {
        ...newAvailment,
        firstName: member?.firstName,
        lastName: member?.lastName,
        memberFirebaseKey: member?.firebaseKey,
        benefitName: benefit?.benefitName,
        cashValue: benefit?.cashValue,
        dateCreated: timestamp,
      };

      const newAvailmentRef = push(availmentsRef);
      await set(newAvailmentRef, availmentPayload);

      await auditLogger.logAction("CREATE", "Benefit Availments", {
        recordId: newAvailmentRef.key,
        oscaID: newAvailment.oscaID,
        memberName: member
          ? `${member.firstName || ""} ${member.lastName || ""}`.trim()
          : null,
        benefitFirebaseKey: newAvailment.benefitID,
        benefitName: benefit?.benefitName || null,
        cashValue: benefit?.cashValue ?? null,
        status: newAvailment.status,
        notesLength: newAvailment.notes ? newAvailment.notes.length : 0,
        createdAt: timestamp,
      });

      alert("Availment recorded successfully!");
      setNewAvailment({
        oscaID: "",
        benefitID: "",
        date: "",
        status: "Approved",
        notes: "",
      });
      setShowAddAvailmentModal(false);
    } catch (error) {
      console.error("Error adding availment:", error);
      alert("Failed to record availment");
    }
  };

  // Delete availment
  const deleteAvailment = async (firebaseKey) => {
    if (!window.confirm("Are you sure you want to delete this availment?"))
      return;
    try {
      const availmentRef = dbRef(db, `availments/${firebaseKey}`);
      const targetAvailment =
        availments.find((a) => a.firebaseKey === firebaseKey) || null;
      await remove(availmentRef);

      await auditLogger.logAction("DELETE", "Benefit Availments", {
        recordId: firebaseKey,
        oscaID: targetAvailment?.oscaID || null,
        memberName: targetAvailment
          ? `${targetAvailment.firstName || ""} ${
              targetAvailment.lastName || ""
            }`.trim()
          : null,
        benefitName: targetAvailment?.benefitName || null,
        status: targetAvailment?.status || null,
        cashValue: targetAvailment?.cashValue ?? null,
      });
      alert("Availment deleted successfully!");
    } catch (error) {
      console.error("Error deleting availment:", error);
      alert("Failed to delete availment");
    }
  };

  // Update availment status
  const updateAvailmentStatus = async (firebaseKey, newStatus) => {
    try {
      const availmentRef = dbRef(db, `availments/${firebaseKey}`);
      const targetAvailment =
        availments.find((a) => a.firebaseKey === firebaseKey) || null;

      await update(availmentRef, { status: newStatus });

      await auditLogger.logAction("UPDATE", "Benefit Availments", {
        recordId: firebaseKey,
        oscaID: targetAvailment?.oscaID || null,
        memberName: targetAvailment
          ? `${targetAvailment.firstName || ""} ${
              targetAvailment.lastName || ""
            }`.trim()
          : null,
        benefitName: targetAvailment?.benefitName || null,
        previousStatus: targetAvailment?.status || null,
        newStatus,
      });
      alert("Status updated successfully!");
      setShowViewDetailsModal(null);
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Failed to update status");
    }
  };

  // Calculate statistics
  const totalBenefitsThisYear = availments
    .filter(
      (a) =>
        new Date(a.date).getFullYear() === new Date().getFullYear() &&
        a.status === "Approved"
    )
    .reduce((sum, a) => sum + (parseFloat(a.cashValue) || 0), 0);

  const benefitCounts = {};
  availments.forEach((a) => {
    benefitCounts[a.benefitName] = (benefitCounts[a.benefitName] || 0) + 1;
  });

  const topBenefits = Object.entries(benefitCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const recentAvailments = availments
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  // Filter availments
  const filteredAvailments = availments.filter((item) => {
    const matchesSearch =
      !searchTerm ||
      item.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.oscaID?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesBenefit =
      filterBenefit === "All" || item.benefitName === filterBenefit;

    const matchesStatus =
      filterStatus === "All" || item.status === filterStatus;

    return matchesSearch && matchesBenefit && matchesStatus;
  });

  const paginatedAvailments = filteredAvailments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredAvailments.length / itemsPerPage);

  if (loading || userLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="animate-spin">
          <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-purple-50 font-sans">
      <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header notificationCount={3} />

        <main className="flex-1 overflow-y-auto p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Benefit Tracking
            </h1>
            <p className="text-gray-600">
              Monitor services availed and benefits distributed to senior
              citizens
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-4 mb-8">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                activeTab === "dashboard"
                  ? "bg-purple-600 text-white shadow-lg"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <BarChart3 className="w-5 h-5 inline mr-2" />
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab("availments")}
              className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                activeTab === "availments"
                  ? "bg-purple-600 text-white shadow-lg"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Package className="w-5 h-5 inline mr-2" />
              Availments
            </button>
            <button
              onClick={() => setActiveTab("benefits")}
              className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                activeTab === "benefits"
                  ? "bg-purple-600 text-white shadow-lg"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <FileText className="w-5 h-5 inline mr-2" />
              Benefits Registry
            </button>
          </div>

          {/* DASHBOARD TAB */}
          {activeTab === "dashboard" && (
            <div>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Total Benefits Distributed */}
                <div className="bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl shadow-xl p-6 text-white h-full">
                  <div className="flex flex-col h-full justify-between">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-purple-200 text-sm font-medium mb-1">
                          Total Benefits Distributed (This Year)
                        </p>
                        <h3 className="text-4xl font-bold">
                          ₱{totalBenefitsThisYear.toLocaleString()}
                        </h3>
                      </div>
                      <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center flex-shrink-0">
                        <DollarSign className="w-6 h-6" />
                      </div>
                    </div>
                    <p className="text-purple-200 text-xs">
                      {availments.filter((a) => a.status === "Approved").length}{" "}
                      transactions
                    </p>
                  </div>
                </div>

                {/* Services Provided */}
                <div className="bg-gradient-to-br from-green-500 to-green-700 rounded-2xl shadow-xl p-6 text-white h-full">
                  <div className="flex flex-col h-full justify-between">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-green-200 text-sm font-medium mb-1">
                          Services Provided
                        </p>
                        <h3 className="text-4xl font-bold">
                          {benefits.filter((b) => b.isActive).length}
                        </h3>
                      </div>
                      <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Package className="w-6 h-6" />
                      </div>
                    </div>
                    <p className="text-green-200 text-xs">Active benefits</p>
                  </div>
                </div>

                {/* Members Served */}
                <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl shadow-xl p-6 text-white h-full">
                  <div className="flex flex-col h-full justify-between">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-blue-200 text-sm font-medium mb-1">
                          Members Served
                        </p>
                        <h3 className="text-4xl font-bold">
                          {new Set(availments.map((a) => a.oscaID)).size}
                        </h3>
                      </div>
                      <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Users className="w-6 h-6" />
                      </div>
                    </div>
                    <p className="text-blue-200 text-xs">
                      Unique beneficiaries
                    </p>
                  </div>
                </div>

                {/* Pending Requests */}
                <div className="bg-gradient-to-br from-orange-500 to-orange-700 rounded-2xl shadow-xl p-6 text-white h-full">
                  <div className="flex flex-col h-full justify-between">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-orange-200 text-sm font-medium mb-1">
                          Pending Request
                        </p>
                        <h3 className="text-4xl font-bold">
                          {
                            availments.filter((a) => a.status === "Pending")
                              .length
                          }
                        </h3>
                      </div>
                      <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-6 h-6" />
                      </div>
                    </div>
                    <p className="text-orange-200 text-xs">Awaiting Approval</p>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <button
                  onClick={() => setShowAddAvailmentModal(true)}
                  className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105 border-2 border-transparent hover:border-purple-500"
                >
                  <Plus className="w-8 h-8 text-purple-600 mb-3" />
                  <p className="font-bold text-gray-900">Log New Availment</p>
                  <p className="text-sm text-gray-600">
                    Record a benefit transaction
                  </p>
                </button>

                <button
                  onClick={() => setShowAddBenefitModal(true)}
                  className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105 border-2 border-transparent hover:border-green-500"
                >
                  <Plus className="w-8 h-8 text-green-600 mb-3" />
                  <p className="font-bold text-gray-900">
                    Add New Benefit Type
                  </p>
                  <p className="text-sm text-gray-600">
                    Create a new benefit offering
                  </p>
                </button>
              </div>

              {/* Top Availed Benefits Chart */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div className="bg-white rounded-2xl shadow-xl p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-6">
                    Top Availed Benefits
                  </h3>
                  <div className="space-y-4">
                    {topBenefits.length > 0 ? (
                      topBenefits.map((item, idx) => (
                        <div key={idx}>
                          <div className="flex justify-between items-center mb-2">
                            <p className="font-semibold text-gray-700">
                              {item[0]}
                            </p>
                            <span className="text-sm font-bold text-purple-600">
                              {item[1]} claims
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div
                              className="bg-gradient-to-r from-purple-500 to-purple-700 h-3 rounded-full transition-all"
                              style={{
                                width: `${
                                  (item[1] / topBenefits[0][1]) * 100
                                }%`,
                              }}
                            ></div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-center py-8">
                        No data yet
                      </p>
                    )}
                  </div>
                </div>

                {/* Recent Availments */}
                <div className="bg-white rounded-2xl shadow-xl p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-6">
                    Recent Availments
                  </h3>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {recentAvailments.length > 0 ? (
                      recentAvailments.map((item) => (
                        <div
                          key={item.firebaseKey}
                          className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
                        >
                          <div>
                            <p className="font-semibold text-gray-900">
                              {item.firstName} {item.lastName}
                            </p>
                            <p className="text-sm text-gray-600">
                              {item.benefitName}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-purple-600">
                              ₱{item.cashValue?.toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(item.date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-center py-8">
                        No recent availments
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AVAILMENTS TAB */}
          {activeTab === "availments" && (
            <div>
              {/* Search and Filters */}
              <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex-1 min-w-[300px] relative">
                    <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 transform -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search by member name or OSCA ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full border-2 border-gray-200 rounded-xl px-12 py-3 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <select
                    value={filterBenefit}
                    onChange={(e) => setFilterBenefit(e.target.value)}
                    className="border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 bg-white"
                  >
                    <option value="All">All Benefits</option>
                    {benefits
                      .filter((b) => b.isActive)
                      .map((b) => (
                        <option key={b.firebaseKey} value={b.benefitName}>
                          {b.benefitName}
                        </option>
                      ))}
                  </select>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 bg-white"
                  >
                    <option value="All">All Status</option>
                    <option value="Approved">Approved</option>
                    <option value="Pending">Pending</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                  <button
                    onClick={() => setShowAddAvailmentModal(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all"
                  >
                    <Plus className="w-5 h-5" />
                    Log New Availment
                  </button>
                </div>
              </div>

              {/* Availments Table */}
              <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-purple-600 to-purple-700">
                      <tr>
                        {[
                          "Transaction ID",
                          "Member Name",
                          "Benefit Availed",
                          "Date",
                          "Status",
                          "Cash Value",
                          "Actions",
                        ].map((label) => (
                          <th
                            key={label}
                            className="px-6 py-4 text-left text-sm font-semibold text-white"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {paginatedAvailments.length > 0 ? (
                        paginatedAvailments.map((item) => (
                          <tr
                            key={item.firebaseKey}
                            className="hover:bg-purple-50"
                          >
                            <td className="px-6 py-4 text-sm font-mono text-gray-900">
                              {item.firebaseKey.substring(0, 8).toUpperCase()}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {item.firstName} {item.lastName}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700">
                              {item.benefitName}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {new Date(item.date).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                                  item.status === "Approved"
                                    ? "bg-green-100 text-green-700"
                                    : item.status === "Pending"
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-red-100 text-red-700"
                                }`}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-purple-600">
                              ₱{item.cashValue?.toLocaleString()}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setShowViewDetailsModal(item)}
                                  className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"
                                  title="View Details"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() =>
                                    deleteAvailment(item.firebaseKey)
                                  }
                                  className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7" className="text-center py-12">
                            <p className="text-gray-500">No availments found</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t">
                    <div className="text-sm text-gray-600">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                      {Math.min(
                        currentPage * itemsPerPage,
                        filteredAvailments.length
                      )}{" "}
                      of {filteredAvailments.length} results
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setCurrentPage((p) => Math.max(p - 1, 1))
                        }
                        disabled={currentPage === 1}
                        className="p-2 rounded-lg bg-white border border-gray-300 disabled:opacity-50"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      {[...Array(totalPages).keys()].map((n) => (
                        <button
                          key={n}
                          onClick={() => setCurrentPage(n + 1)}
                          className={`px-4 py-2 rounded-lg ${
                            currentPage === n + 1
                              ? "bg-purple-600 text-white"
                              : "bg-white border border-gray-300"
                          }`}
                        >
                          {n + 1}
                        </button>
                      ))}
                      <button
                        onClick={() =>
                          setCurrentPage((p) => Math.min(p + 1, totalPages))
                        }
                        disabled={currentPage === totalPages}
                        className="p-2 rounded-lg bg-white border border-gray-300 disabled:opacity-50"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BENEFITS REGISTRY TAB */}
          {activeTab === "benefits" && (
            <div>
              <div className="mb-8">
                <button
                  onClick={() => setShowAddBenefitModal(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 transition-all"
                >
                  <Plus className="w-5 h-5" />
                  Add New Benefit
                </button>
              </div>

              {/* Benefits Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {benefits.map((benefit) => (
                  <div
                    key={benefit.firebaseKey}
                    className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-xs font-bold text-purple-600 mb-1">
                          {benefit.benefitID}
                        </p>
                        <h3 className="text-lg font-bold text-gray-900">
                          {benefit.benefitName}
                        </h3>
                      </div>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-bold ${
                          benefit.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {benefit.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>

                    <p className="text-sm text-gray-600 mb-4">
                      {benefit.description}
                    </p>

                    <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 mb-4">
                      <p className="text-xs text-gray-600">Cash Value</p>
                      <p className="text-2xl font-bold text-purple-600">
                        ₱{benefit.cashValue?.toLocaleString()}
                      </p>
                    </div>

                    <div className="mb-4">
                      <p className="text-xs font-semibold text-gray-700 mb-2">
                        Requirements:
                      </p>
                      <p className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg">
                        {benefit.requirements}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingBenefit(benefit)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 font-semibold"
                      >
                        <Edit className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => deleteBenefit(benefit.firebaseKey)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 font-semibold"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add Availment Modal */}
      {showAddAvailmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-8 py-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  Log New Availment
                </h2>
                <p className="text-purple-200 text-sm mt-1">
                  Record a benefit transaction
                </p>
              </div>
              <button
                onClick={() => setShowAddAvailmentModal(false)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Users className="w-4 h-4 text-purple-600" />
                  Member
                </label>
                <div className="relative">
                  <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 transform -translate-y-1/2 z-10" />
                  <input
                    type="text"
                    placeholder="Search member by name or OSCA ID..."
                    value={memberSearchQuery}
                    onChange={handleMemberSearchChange}
                    onFocus={() =>
                      memberSearchResults.length > 0 &&
                      setShowMemberSearchDropdown(true)
                    }
                    className="w-full border-2 border-gray-200 rounded-xl px-12 py-3 focus:outline-none focus:border-purple-500 transition-colors"
                  />

                  {/* Search Results Dropdown */}
                  {showMemberSearchDropdown &&
                    memberSearchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-purple-200 rounded-xl shadow-xl z-20 max-h-64 overflow-y-auto">
                        {memberSearchResults.map((member) => (
                          <button
                            key={member.firebaseKey}
                            onClick={() => handleMemberSelect(member)}
                            className="w-full px-4 py-3 hover:bg-purple-50 border-b border-gray-100 last:border-b-0 text-left transition-colors flex items-center gap-3"
                          >
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center text-white font-bold text-sm">
                              {(member.firstName?.[0] || "M").toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 truncate">
                                {member.firstName} {member.lastName}
                              </p>
                              <p className="text-sm text-gray-500">
                                OSCA ID: {member.oscaID || "N/A"}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                </div>

                {/* Display selected member */}
                {newAvailment.oscaID && (
                  <div className="bg-purple-50 rounded-lg px-4 py-3 border border-purple-200">
                    <p className="text-sm text-gray-600">
                      Selected:{" "}
                      <span className="font-semibold text-gray-900">
                        {
                          seniors.find((s) => s.oscaID === newAvailment.oscaID)
                            ?.firstName
                        }{" "}
                        {
                          seniors.find((s) => s.oscaID === newAvailment.oscaID)
                            ?.lastName
                        }
                      </span>{" "}
                      (OSCA ID: {newAvailment.oscaID})
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Package className="w-4 h-4 text-purple-600" />
                  Benefit
                </label>
                <select
                  value={newAvailment.benefitID}
                  onChange={(e) =>
                    setNewAvailment({
                      ...newAvailment,
                      benefitID: e.target.value,
                    })
                  }
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 bg-white"
                >
                  <option value="">-- Select Benefit --</option>
                  {benefits
                    .filter((b) => b.isActive)
                    .map((b) => (
                      <option key={b.firebaseKey} value={b.firebaseKey}>
                        {b.benefitName} (₱{b.cashValue})
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Calendar className="w-4 h-4 text-purple-600" />
                  Date
                </label>
                <input
                  type="date"
                  value={newAvailment.date}
                  onChange={(e) =>
                    setNewAvailment({ ...newAvailment, date: e.target.value })
                  }
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  Status
                </label>
                <select
                  value={newAvailment.status}
                  onChange={(e) =>
                    setNewAvailment({ ...newAvailment, status: e.target.value })
                  }
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 bg-white"
                >
                  <option>Approved</option>
                  <option>Pending</option>
                  <option>Rejected</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Notes
                </label>
                <textarea
                  value={newAvailment.notes}
                  onChange={(e) =>
                    setNewAvailment({ ...newAvailment, notes: e.target.value })
                  }
                  placeholder="Additional notes or remarks..."
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500"
                  rows="3"
                />
              </div>
            </div>

            <div className="bg-gray-50 px-8 py-6 flex gap-4">
              <button
                onClick={addAvailment}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 font-semibold"
              >
                Log Availment
              </button>
              <button
                onClick={() => setShowAddAvailmentModal(false)}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {showViewDetailsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">
                Availment Details
              </h2>
              <button
                onClick={() => setShowViewDetailsModal(null)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-600 font-semibold">
                    Transaction ID
                  </p>
                  <p className="text-lg font-bold text-gray-900">
                    {showViewDetailsModal.firebaseKey
                      ?.substring(0, 8)
                      .toUpperCase()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 font-semibold mb-2">
                    Status
                  </p>
                  <span
                    className={`inline-flex px-3 py-1 rounded-full text-sm font-bold ${
                      showViewDetailsModal.status === "Approved"
                        ? "bg-green-100 text-green-700"
                        : showViewDetailsModal.status === "Pending"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {showViewDetailsModal.status}
                  </span>
                </div>
              </div>

              {/* Status Update Buttons */}
              <div className="border-t pt-4">
                <p className="text-xs text-gray-600 font-semibold mb-3">
                  Update Status
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      updateAvailmentStatus(
                        showViewDetailsModal.firebaseKey,
                        "Approved"
                      )
                    }
                    className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-all ${
                      showViewDetailsModal.status === "Approved"
                        ? "bg-green-500 text-white"
                        : "bg-green-100 text-green-700 hover:bg-green-200"
                    }`}
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() =>
                      updateAvailmentStatus(
                        showViewDetailsModal.firebaseKey,
                        "Pending"
                      )
                    }
                    className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-all ${
                      showViewDetailsModal.status === "Pending"
                        ? "bg-yellow-500 text-white"
                        : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                    }`}
                  >
                    ⏳ Pending
                  </button>
                  <button
                    onClick={() =>
                      updateAvailmentStatus(
                        showViewDetailsModal.firebaseKey,
                        "Rejected"
                      )
                    }
                    className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-all ${
                      showViewDetailsModal.status === "Rejected"
                        ? "bg-red-500 text-white"
                        : "bg-red-100 text-red-700 hover:bg-red-200"
                    }`}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-xs text-gray-600 font-semibold mb-2">
                  Member
                </p>
                <p className="text-lg font-bold text-gray-900">
                  {showViewDetailsModal.firstName}{" "}
                  {showViewDetailsModal.lastName}
                </p>
                <p className="text-sm text-gray-600">
                  OSCA ID: {showViewDetailsModal.oscaID}
                </p>
              </div>

              <div className="border-t pt-4">
                <p className="text-xs text-gray-600 font-semibold mb-2">
                  Benefit Availed
                </p>
                <p className="text-lg font-bold text-gray-900">
                  {showViewDetailsModal.benefitName}
                </p>
                <p className="text-2xl font-bold text-purple-600">
                  ₱{showViewDetailsModal.cashValue?.toLocaleString()}
                </p>
              </div>

              <div className="border-t pt-4">
                <p className="text-xs text-gray-600 font-semibold mb-2">Date</p>
                <p className="text-lg font-bold text-gray-900">
                  {new Date(showViewDetailsModal.date).toLocaleDateString(
                    "en-US",
                    {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    }
                  )}
                </p>
              </div>

              {showViewDetailsModal.notes && (
                <div className="border-t pt-4">
                  <p className="text-xs text-gray-600 font-semibold mb-2">
                    Notes
                  </p>
                  <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">
                    {showViewDetailsModal.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="bg-gray-50 px-8 py-6">
              <button
                onClick={() => setShowViewDetailsModal(null)}
                className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Benefit Modal */}
      {showAddBenefitModal && !editingBenefit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-green-600 to-green-700 px-8 py-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Add New Benefit</h2>
              <button
                onClick={() => setShowAddBenefitModal(false)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Benefit Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Medical Assistance"
                  value={newBenefit.benefitName}
                  onChange={(e) =>
                    setNewBenefit({
                      ...newBenefit,
                      benefitName: e.target.value,
                    })
                  }
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-green-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Description
                </label>
                <textarea
                  placeholder="Describe what this benefit is for..."
                  value={newBenefit.description}
                  onChange={(e) =>
                    setNewBenefit({
                      ...newBenefit,
                      description: e.target.value,
                    })
                  }
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-green-500"
                  rows="3"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">
                    Cash Value (₱) *
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={newBenefit.cashValue}
                    onChange={(e) =>
                      setNewBenefit({
                        ...newBenefit,
                        cashValue: e.target.value,
                      })
                    }
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-green-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newBenefit.isActive}
                      onChange={(e) =>
                        setNewBenefit({
                          ...newBenefit,
                          isActive: e.target.checked,
                        })
                      }
                      className="w-4 h-4"
                    />
                    Is Active?
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Requirements
                </label>
                <textarea
                  placeholder="e.g., Clinical Abstract, Medical Certificate"
                  value={newBenefit.requirements}
                  onChange={(e) =>
                    setNewBenefit({
                      ...newBenefit,
                      requirements: e.target.value,
                    })
                  }
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-green-500"
                  rows="3"
                />
              </div>
            </div>

            <div className="bg-gray-50 px-8 py-6 flex gap-4">
              <button
                onClick={addBenefit}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 font-semibold"
              >
                Add Benefit
              </button>
              <button
                onClick={() => {
                  setShowAddBenefitModal(false);
                  setNewBenefit({
                    benefitName: "",
                    description: "",
                    cashValue: "",
                    requirements: "",
                    isActive: true,
                  });
                }}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Benefit Modal */}
      {editingBenefit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Edit Benefit</h2>
              <button
                onClick={() => setEditingBenefit(null)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Benefit Name
                </label>
                <input
                  type="text"
                  value={editingBenefit.benefitName}
                  onChange={(e) =>
                    setEditingBenefit({
                      ...editingBenefit,
                      benefitName: e.target.value,
                    })
                  }
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Description
                </label>
                <textarea
                  value={editingBenefit.description}
                  onChange={(e) =>
                    setEditingBenefit({
                      ...editingBenefit,
                      description: e.target.value,
                    })
                  }
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500"
                  rows="3"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">
                    Cash Value (₱)
                  </label>
                  <input
                    type="number"
                    value={editingBenefit.cashValue}
                    onChange={(e) =>
                      setEditingBenefit({
                        ...editingBenefit,
                        cashValue: e.target.value,
                      })
                    }
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingBenefit.isActive}
                      onChange={(e) =>
                        setEditingBenefit({
                          ...editingBenefit,
                          isActive: e.target.checked,
                        })
                      }
                      className="w-4 h-4"
                    />
                    Is Active?
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Requirements
                </label>
                <textarea
                  value={editingBenefit.requirements}
                  onChange={(e) =>
                    setEditingBenefit({
                      ...editingBenefit,
                      requirements: e.target.value,
                    })
                  }
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500"
                  rows="3"
                />
              </div>
            </div>

            <div className="bg-gray-50 px-8 py-6 flex gap-4">
              <button
                onClick={updateBenefit}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 font-semibold"
              >
                Update Benefit
              </button>
              <button
                onClick={() => setEditingBenefit(null)}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceAndBenefitsTrack;
