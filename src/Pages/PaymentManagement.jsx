import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "../Components/Sidebar";
import Header from "../Components/Header";
import {
  Plus,
  Printer,
  CheckCircle,
  XCircle,
  FileText,
  History,
  Edit,
  Trash2,
  Camera,
  Search,
  X,
  DollarSign,
  Calendar,
  CreditCard,
  User,
  ChevronLeft,
  ChevronRight,
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
import AIPoweredScanner from "../Components/QrScanner";
import MemberProfileModal from "../Components/MemberProfileModal";
import { useMemberSearch } from "../Context/MemberSearchContext";
import useResolvedCurrentUser from "../hooks/useResolvedCurrentUser";
import { createAuditLogger } from "../utils/AuditLogger";

const PaymentManagement = () => {
  const location = useLocation();
  const [showReceipt, setShowReceipt] = useState(null);
  const [payments, setPayments] = useState([]);
  const [seniors, setSeniors] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMethod, setFilterMethod] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHistory, setShowHistory] = useState(null);
  const [editPayment, setEditPayment] = useState(null);

  // QR Scanner & Profile Modal states
  const [showScanner, setShowScanner] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [activeMenu, setActiveMenu] = useState("Payments");

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

  // Handle navigation state to open new payment modal
  useEffect(() => {
    if (location.state?.openNewPaymentModal) {
      setShowAddModal(true);
    }
  }, [location.state]);

  // Member Search Dropdown State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [allMembers, setAllMembers] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Get global member search context
  const memberSearch = useMemberSearch();

  const [newPayment, setNewPayment] = useState({
    oscaID: "",
    amount: "",
    modePay: "GCash",
    payDate: "",
    payDesc: "Annual Dues",
    authorAgent: actorLabel,
  });
  const [searchUser, setSearchUser] = useState("");

  useEffect(() => {
    setNewPayment((prev) => ({ ...prev, authorAgent: actorLabel }));
  }, [actorLabel]);

  // Fetch seniors from Firebase
  useEffect(() => {
    const membersRef = dbRef(db, "members");

    const unsubscribe = onValue(
      membersRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const seniorsArray = Object.keys(data).map((key) => ({
            firebaseKey: key,
            ...data[key],
          }));
          setSeniors(seniorsArray);
          setAllMembers(seniorsArray); // Also populate allMembers for search
        } else {
          setSeniors([]);
          setAllMembers([]);
        }
      },
      (error) => console.error("Error fetching seniors from Firebase:", error)
    );

    return () => unsubscribe();
  }, []);

  // Fetch payments from Firebase
  useEffect(() => {
    const paymentsRef = dbRef(db, "payments");

    const unsubscribe = onValue(
      paymentsRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const paymentsArray = Object.keys(data).map((key) => ({
            firebaseKey: key,
            id: key,
            receiptNo: key,
            ...data[key],
          }));
          setPayments(paymentsArray);
        } else {
          setPayments([]);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching payments:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const addPayment = async () => {
    if (!newPayment.oscaID) {
      alert("Please select a member.");
      return;
    }
    if (!newPayment.amount || !newPayment.payDate) {
      alert("Please enter amount and date.");
      return;
    }

    try {
      const member = seniors.find((s) => s.oscaID === newPayment.oscaID);

      const paymentsRef = dbRef(db, "payments");
      const newPaymentRef = push(paymentsRef);
      const paymentId = newPaymentRef.key;
      const paymentPayload = {
        ...newPayment,
        firstName: member?.firstName || "",
        lastName: member?.lastName || "",
        payment_status: "Paid",
        date_created: new Date().toISOString(),
        createdBy: actorLabel,
        createdById: actorId,
        createdByRole: actorRole,
        updatedBy: actorLabel,
        updatedById: actorId,
        lastActionByRole: actorRole,
      };

      await set(newPaymentRef, paymentPayload);

      await auditLogger.logPaymentCreated(
        paymentId,
        `${member?.firstName || ""} ${member?.lastName || ""}`.trim() ||
          newPayment.oscaID ||
          paymentId,
        parseFloat(newPayment.amount || 0),
        newPayment.modePay
      );

      alert("Payment added successfully!");
      setShowAddModal(false);
      setNewPayment({
        oscaID: "",
        amount: "",
        modePay: "GCash",
        payDate: "",
        payDesc: "Annual Dues",
        authorAgent: actorLabel,
      });
      setSearchUser("");
    } catch (err) {
      console.error("Error adding payment:", err);
      alert("An error occurred while adding payment.");
    }
  };

  const viewHistory = (oscaID) => {
    const history = payments.filter((p) => p.oscaID === oscaID);
    if (history.length > 0) {
      setShowHistory(history);
    } else {
      alert("No payment history found for this member.");
    }
  };

  const saveEdit = async () => {
    try {
      const paymentRef = dbRef(db, `payments/${editPayment.firebaseKey}`);
      const originalPayment = payments.find(
        (p) => p.firebaseKey === editPayment.firebaseKey
      );
      const updatedPayload = {
        amount: editPayment.amount,
        modePay: editPayment.modePay,
        payDate: editPayment.payDate,
        date_updated: new Date().toISOString(),
        updatedBy: actorLabel,
        updatedById: actorId,
        lastActionByRole: actorRole,
      };
      await update(paymentRef, updatedPayload);

      const paymentName = [
        originalPayment?.firstName || "",
        originalPayment?.lastName || "",
      ]
        .join(" ")
        .trim();

      if (originalPayment) {
        await auditLogger.logPaymentUpdated(
          editPayment.firebaseKey,
          paymentName || originalPayment.oscaID || editPayment.firebaseKey,
          parseFloat(originalPayment.amount || 0),
          parseFloat(editPayment.amount || 0)
        );
      } else {
        await auditLogger.logAction("UPDATE", "Payments", {
          recordId: editPayment.firebaseKey,
          changes: updatedPayload,
        });
      }
      alert("Payment updated successfully!");
      setEditPayment(null);
    } catch (error) {
      console.error("Error updating payment:", error);
      alert("Failed to update payment.");
    }
  };

  const deletePayment = async (firebaseKey) => {
    if (!window.confirm("Are you sure you want to delete this payment?"))
      return;

    try {
      const paymentRef = dbRef(db, `payments/${firebaseKey}`);
      const existingPayment = payments.find(
        (p) => p.firebaseKey === firebaseKey
      );
      await remove(paymentRef);
      if (existingPayment) {
        const paymentName = [
          existingPayment.firstName || "",
          existingPayment.lastName || "",
        ]
          .join(" ")
          .trim();
        await auditLogger.logPaymentDeleted(
          firebaseKey,
          paymentName || existingPayment.oscaID || firebaseKey,
          parseFloat(existingPayment.amount || 0)
        );
      } else {
        await auditLogger.logAction("DELETE", "Payments", {
          recordId: firebaseKey,
        });
      }
      alert("Payment deleted successfully!");
    } catch (error) {
      console.error("Error deleting payment:", error);
      alert("Failed to delete payment.");
    }
  };

  const exportToCSV = () => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      ["OSCA ID,Name,Amount,Method,Date"]
        .concat(
          payments.map(
            (p) =>
              `${p.oscaID},${p.firstName} ${p.lastName},${p.amount},${p.modePay},${p.payDate}`
          )
        )
        .join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = "payments_report.csv";
    link.click();
  };

  // Handle member search input
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (query.trim() === "") {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    // Search members by name or OSCA ID
    const results = allMembers
      .filter((member) => {
        const fullName = `${member.firstName || ""} ${
          member.lastName || ""
        }`.toLowerCase();
        const oscaID = (member.oscaID || "").toString().toLowerCase();
        const query_lower = query.toLowerCase();

        return fullName.includes(query_lower) || oscaID.includes(query_lower);
      })
      .slice(0, 8); // Limit to 8 results

    setSearchResults(results);
    setShowSearchDropdown(true);
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

  // Handle member selection from search dropdown
  const handleMemberSearchClick = (member) => {
    console.log("🔍 Member clicked from Payment search:", member);
    if (memberSearch?.openMemberProfile) {
      memberSearch.openMemberProfile(member);
    }
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchDropdown(false);
  };

  // Helper functions for QR Scanner
  const extractBarangay = (address) => {
    if (!address) return "N/A";
    const parts = address.split(",");
    return parts.length >= 2 ? parts[parts.length - 2].trim() : "N/A";
  };

  const isDeceased = (member) => member.deceased === true;

  // Filtering logic
  const filterData = (data, searchTerm) => {
    return data.filter((item) => {
      const matchesSearch =
        !searchTerm ||
        Object.values(item).some((val) =>
          String(val).toLowerCase().includes(searchTerm.toLowerCase())
        );
      const matchesMethod =
        filterMethod === "All" || item.modePay === filterMethod;
      const matchesStatus =
        filterStatus === "All" || item.payment_status === filterStatus;
      return matchesSearch && matchesMethod && matchesStatus;
    });
  };

  const filteredData = filterData(payments, searchTerm);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-purple-50 font-sans">
      <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header notificationCount={3} />

        <main className="flex-1 overflow-y-auto p-8">
          {/* Header Section */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Payment Management
            </h1>
            <p className="text-gray-600">
              Track, manage, and process all payment transactions
            </p>
          </div>

          {/* Enhanced Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Total Collected */}
            <div className="bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl shadow-xl p-6 text-white transform hover:scale-105 transition-transform">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-purple-200 text-sm font-medium mb-1">
                    Total Collected
                  </p>
                  <h3 className="text-4xl font-bold">
                    ₱
                    {payments
                      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
                      .toLocaleString()}
                  </h3>
                </div>
                <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-6 h-6" />
                </div>
              </div>
              <p className="text-purple-200 text-xs">All time revenue</p>
            </div>

            {/* This Month */}
            <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl shadow-xl p-6 text-white transform hover:scale-105 transition-transform">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-blue-200 text-sm font-medium mb-1">
                    This Month
                  </p>
                  <h3 className="text-4xl font-bold">
                    ₱
                    {payments
                      .filter((p) => {
                        const payDate = new Date(p.payDate);
                        const now = new Date();
                        return (
                          payDate.getMonth() === now.getMonth() &&
                          payDate.getFullYear() === now.getFullYear()
                        );
                      })
                      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
                      .toLocaleString()}
                  </h3>
                </div>
                <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                  <Calendar className="w-6 h-6" />
                </div>
              </div>
              <p className="text-blue-200 text-xs">Current month total</p>
            </div>

            {/* Cash Payments */}
            <div className="bg-gradient-to-br from-green-500 to-green-700 rounded-2xl shadow-xl p-6 text-white transform hover:scale-105 transition-transform">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-green-200 text-sm font-medium mb-1">
                    Cash Payments
                  </p>
                  <h3 className="text-4xl font-bold">
                    ₱
                    {payments
                      .filter((p) => p.modePay === "Over-the-counter")
                      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
                      .toLocaleString()}
                  </h3>
                </div>
                <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                  <CreditCard className="w-6 h-6" />
                </div>
              </div>
              <p className="text-green-200 text-xs">Over-the-counter</p>
            </div>

            {/* Online Payments */}
            <div className="bg-gradient-to-br from-orange-500 to-orange-700 rounded-2xl shadow-xl p-6 text-white transform hover:scale-105 transition-transform">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-orange-200 text-sm font-medium mb-1">
                    Online Payments
                  </p>
                  <h3 className="text-4xl font-bold">
                    ₱
                    {payments
                      .filter((p) => p.modePay === "GCash")
                      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
                      .toLocaleString()}
                  </h3>
                </div>
                <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-orange-200 text-xs">GCash transactions</p>
            </div>
          </div>

          {/* Enhanced Search and Filters */}
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex-1 min-w-[300px] relative">
                <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 transform -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by name, OSCA ID, or amount..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-12 py-3 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
              <select
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value)}
                className="border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 bg-white"
              >
                <option value="All">All Methods</option>
                <option value="GCash">GCash</option>
                <option value="Over-the-counter">Over-the-counter</option>
              </select>
              <button
                onClick={() => setShowScanner(true)}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl"
              >
                <Camera className="w-5 h-5" />
                Scan QR
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg hover:shadow-xl"
              >
                <Plus className="w-5 h-5" />
                Add Payment
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all"
              >
                <FileText className="w-5 h-5" />
                Export
              </button>
            </div>
          </div>

          {/* Enhanced Table */}
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-purple-600 to-purple-700">
                  <tr>
                    {[
                      "OSCA ID",
                      "Full Name",
                      "Amount",
                      "Method",
                      "Date",
                      "Status",
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
                <tbody className="divide-y divide-gray-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="text-center py-12">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-purple-500 border-t-transparent"></div>
                      </td>
                    </tr>
                  ) : paginatedData.length > 0 ? (
                    paginatedData.map((item) => (
                      <tr
                        key={item.firebaseKey}
                        className="hover:bg-purple-50 transition-colors"
                      >
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {item.oscaID}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {item.firstName} {item.lastName}
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                          ₱{parseFloat(item.amount).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                              item.modePay === "GCash"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {item.modePay}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {item.payDate
                            ? new Date(item.payDate).toLocaleDateString()
                            : "-"}
                        </td>
                        <td className="px-6 py-4">
                          {item.payment_status === "Paid" ? (
                            <span className="inline-flex items-center gap-1 text-green-600 font-semibold text-sm">
                              <CheckCircle className="w-4 h-4" /> Paid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-sm">
                              <XCircle className="w-4 h-4" /> Not Paid
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => viewHistory(item.oscaID)}
                              className="p-2 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition-colors"
                              title="History"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setShowReceipt(item)}
                              className="p-2 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 transition-colors"
                              title="Receipt"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditPayment(item)}
                              className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                              title="Edit"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deletePayment(item.firebaseKey)}
                              className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
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
                        <div className="text-gray-400 text-lg">
                          No payment records found
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Enhanced Pagination */}
            {totalPages > 1 && (
              <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                  {Math.min(currentPage * itemsPerPage, filteredData.length)} of{" "}
                  {filteredData.length} results
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg bg-white border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  {[...Array(totalPages).keys()].map((n) => (
                    <button
                      key={n}
                      onClick={() => setCurrentPage(n + 1)}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        currentPage === n + 1
                          ? "bg-purple-600 text-white"
                          : "bg-white border border-gray-300 hover:bg-gray-50"
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
                    className="p-2 rounded-lg bg-white border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* QR Scanner Modal */}
      {showScanner && (
        <AIPoweredScanner
          showScanner={showScanner}
          setShowScanner={setShowScanner}
          scChapterData={seniors}
          paymentsData={payments}
          getImagePath={(url) => url || "/img/default-avatar.png"}
          isDeceased={isDeceased}
          extractBarangay={extractBarangay}
          onMemberFound={(member) => {
            console.log("📱 Opening profile modal for:", member);
            setSelectedMember(member);
            setShowProfileModal(true);
          }}
        />
      )}

      {/* Member Profile Modal */}
      {showProfileModal && selectedMember && (
        <MemberProfileModal
          showProfileModal={showProfileModal}
          setShowProfileModal={setShowProfileModal}
          selectedMember={selectedMember}
          paymentsData={payments}
          getImagePath={(url) => url || "/img/default-avatar.png"}
          isDeceased={isDeceased}
          extractBarangay={extractBarangay}
        />
      )}

      {/* Enhanced Add Payment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-8 py-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-white">New Payment</h2>
                <p className="text-purple-200 text-sm mt-1">
                  Record a new payment transaction
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <User className="w-4 h-4 text-purple-600" />
                  Member
                </label>
                <div className="relative">
                  <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 transform -translate-y-1/2 z-10" />
                  <input
                    type="text"
                    placeholder="Search member by name or OSCA ID..."
                    value={searchUser}
                    onChange={(e) => setSearchUser(e.target.value)}
                    onFocus={() =>
                      seniors.filter(
                        (s) =>
                          `${s.firstName} ${s.lastName}`
                            .toLowerCase()
                            .includes(searchUser.toLowerCase()) ||
                          String(s.oscaID)
                            .toLowerCase()
                            .includes(searchUser.toLowerCase())
                      ).length > 0 && setShowSearchDropdown(true)
                    }
                    className="w-full border-2 border-gray-200 rounded-xl px-12 py-3 focus:outline-none focus:border-purple-500 transition-colors"
                  />

                  {/* Search Results Dropdown */}
                  {showSearchDropdown && searchUser.trim() !== "" && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-purple-200 rounded-xl shadow-xl z-20 max-h-64 overflow-y-auto">
                      {seniors
                        .filter(
                          (s) =>
                            `${s.firstName} ${s.lastName}`
                              .toLowerCase()
                              .includes(searchUser.toLowerCase()) ||
                            String(s.oscaID)
                              .toLowerCase()
                              .includes(searchUser.toLowerCase())
                        )
                        .slice(0, 8)
                        .map((s) => (
                          <button
                            key={s.firebaseKey}
                            onClick={() => {
                              setNewPayment({
                                ...newPayment,
                                oscaID: s.oscaID,
                              });
                              setSearchUser("");
                              setShowSearchDropdown(false);
                            }}
                            className="w-full px-4 py-3 hover:bg-purple-50 border-b border-gray-100 last:border-b-0 text-left transition-colors flex items-center gap-3"
                          >
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center text-white font-bold text-sm">
                              {(s.firstName?.[0] || "M").toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 truncate">
                                {s.firstName} {s.lastName}
                              </p>
                              <p className="text-sm text-gray-500">
                                OSCA ID: {s.oscaID || "N/A"}
                              </p>
                            </div>
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                {/* Display selected member */}
                {newPayment.oscaID && (
                  <div className="bg-purple-50 rounded-lg px-4 py-3 border border-purple-200">
                    <p className="text-sm text-gray-600">
                      Selected:{" "}
                      <span className="font-semibold text-gray-900">
                        {
                          seniors.find((s) => s.oscaID === newPayment.oscaID)
                            ?.firstName
                        }{" "}
                        {
                          seniors.find((s) => s.oscaID === newPayment.oscaID)
                            ?.lastName
                        }
                      </span>{" "}
                      (OSCA ID: {newPayment.oscaID})
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <DollarSign className="w-4 h-4 text-purple-600" />
                    Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-semibold">
                      ₱
                    </span>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={newPayment.amount}
                      onChange={(e) =>
                        setNewPayment({ ...newPayment, amount: e.target.value })
                      }
                      className="w-full border-2 border-gray-200 rounded-xl pl-8 pr-4 py-3 focus:outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <CreditCard className="w-4 h-4 text-purple-600" />
                    Payment Method
                  </label>
                  <select
                    value={newPayment.modePay}
                    onChange={(e) =>
                      setNewPayment({ ...newPayment, modePay: e.target.value })
                    }
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-colors bg-white"
                  >
                    <option>GCash</option>
                    <option>Over-the-counter</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Calendar className="w-4 h-4 text-purple-600" />
                  Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={newPayment.payDate}
                  onChange={(e) =>
                    setNewPayment({ ...newPayment, payDate: e.target.value })
                  }
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <FileText className="w-4 h-4 text-purple-600" />
                  Description
                </label>
                <select
                  value={newPayment.payDesc}
                  onChange={(e) =>
                    setNewPayment({ ...newPayment, payDesc: e.target.value })
                  }
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-colors bg-white"
                >
                  <option>Annual Dues</option>
                  <option>Monthly Dues</option>
                  <option>Special Assessment</option>
                  <option>Donation</option>
                  <option>Other</option>
                </select>
              </div>
            </div>

            <div className="bg-gray-50 px-8 py-6 flex gap-4">
              <button
                onClick={addPayment}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg hover:shadow-xl font-semibold"
              >
                Add Payment
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewPayment({
                    oscaID: "",
                    amount: "",
                    modePay: "GCash",
                    payDate: "",
                    payDesc: "Annual Dues",
                    authorAgent: "Admin",
                  });
                  setSearchUser("");
                }}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-all font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-8 py-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  Payment History
                </h2>
                <p className="text-indigo-200 text-sm mt-1">
                  {showHistory[0]?.firstName} {showHistory[0]?.lastName}
                </p>
              </div>
              <button
                onClick={() => setShowHistory(null)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div id="history-content" className="p-8">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white">
                      <th className="px-6 py-3 text-left text-sm font-semibold">
                        Date & Time
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold">
                        Method
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-semibold">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {showHistory.map((h, i) => (
                      <tr key={i} className="hover:bg-indigo-50">
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {new Date(h.payDate).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                          ₱{parseFloat(h.amount).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                              h.modePay === "GCash"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {h.modePay}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {h.payDesc}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex justify-end">
                  <div className="bg-indigo-50 rounded-xl px-6 py-4">
                    <div className="text-sm text-gray-600 mb-1">
                      Total Amount
                    </div>
                    <div className="text-3xl font-bold text-indigo-700">
                      ₱
                      {showHistory
                        .reduce((sum, h) => sum + parseFloat(h.amount), 0)
                        .toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 px-8 py-6 flex gap-4">
              <button
                onClick={() => {
                  const printWindow = window.open(
                    "",
                    "",
                    "width=800,height=1000"
                  );
                  printWindow.document.write(`
                    <html>
                      <head>
                        <title>Payment History</title>
                        <style>
                          @page { margin: 0; }
                          body {
                            font-family: Arial, sans-serif;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                            padding: 40px;
                            max-width: 800px;
                            margin: 0 auto;
                          }
                          .logo {
                            font-size: 32px;
                            font-weight: 800;
                            text-align: center;
                            margin-bottom: 10px;
                          }
                          .logo .highlight { color: #6b21a8; }
                          .member-title {
                            font-size: 20px;
                            font-weight: 600;
                            text-align: center;
                            margin-bottom: 30px;
                            color: #333;
                          }
                          table {
                            width: 100%;
                            border-collapse: collapse;
                            margin: 20px 0;
                          }
                          th, td {
                            border: 1px solid #ddd;
                            padding: 12px;
                            text-align: left;
                          }
                          th {
                            background: #5b21b6;
                            color: white;
                            font-weight: 600;
                          }
                          tr:nth-child(even) { background: #f9fafb; }
                          .total-box {
                            text-align: right;
                            margin-top: 30px;
                            padding: 20px;
                            background: #ede9fe;
                            border-radius: 8px;
                          }
                          .total-label { color: #666; font-size: 14px; }
                          .total-amount { font-size: 28px; font-weight: 700; color: #5b21b6; }
                        </style>
                      </head>
                      <body>
                        <div class="logo">ELDER <span class="highlight">EASE</span></div>
                        <div class="member-title">
                          ${showHistory[0]?.firstName || ""} ${
                    showHistory[0]?.lastName || ""
                  }'s Payment History
                        </div>
                        ${
                          document
                            .getElementById("history-content")
                            .querySelector("table").outerHTML
                        }
                        <div class="total-box">
                          <div class="total-label">Total Amount</div>
                          <div class="total-amount">₱${showHistory
                            .reduce((sum, h) => sum + parseFloat(h.amount), 0)
                            .toLocaleString()}</div>
                        </div>
                      </body>
                    </html>
                  `);
                  printWindow.document.close();
                  printWindow.focus();
                  printWindow.print();
                  printWindow.close();
                }}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl hover:from-indigo-700 hover:to-indigo-800 transition-all shadow-lg hover:shadow-xl font-semibold"
              >
                <Printer className="w-5 h-5" />
                Print History
              </button>
              <button
                onClick={() => setShowHistory(null)}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-all font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Receipt Modal */}
      {showReceipt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-orange-600 to-orange-700 px-8 py-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  Payment Receipt
                </h2>
                <p className="text-orange-200 text-sm mt-1">Official Receipt</p>
              </div>
              <button
                onClick={() => setShowReceipt(null)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div id="receipt-content" className="p-8">
              <div className="text-center mb-8">
                <div className="text-3xl font-extrabold mb-2">
                  ELDER <span className="text-purple-700">EASE</span>
                </div>
                <div className="text-sm text-gray-600">
                  Official Payment Receipt
                </div>
              </div>

              <div className="bg-gradient-to-br from-gray-50 to-purple-50 rounded-xl p-6 space-y-4">
                <div className="flex justify-between py-3 border-b border-gray-200">
                  <span className="text-sm font-semibold text-gray-600">
                    Receipt No:
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {showReceipt.firebaseKey}
                  </span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-200">
                  <span className="text-sm font-semibold text-gray-600">
                    OSCA ID:
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {showReceipt.oscaID}
                  </span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-200">
                  <span className="text-sm font-semibold text-gray-600">
                    Name:
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {showReceipt.firstName} {showReceipt.lastName}
                  </span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-200">
                  <span className="text-sm font-semibold text-gray-600">
                    Amount Paid:
                  </span>
                  <span className="text-xl font-bold text-purple-700">
                    ₱{parseFloat(showReceipt.amount).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-200">
                  <span className="text-sm font-semibold text-gray-600">
                    Payment Method:
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {showReceipt.modePay}
                  </span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-200">
                  <span className="text-sm font-semibold text-gray-600">
                    Description:
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {showReceipt.payDesc || "Annual Dues"}
                  </span>
                </div>
                <div className="flex justify-between py-3">
                  <span className="text-sm font-semibold text-gray-600">
                    Date & Time:
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {new Date(showReceipt.payDate).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-300">
                <div className="text-center text-xs text-gray-500">
                  This is an official receipt. Thank you for your payment.
                </div>
              </div>
            </div>

            <div className="bg-gray-50 px-8 py-6 flex gap-4">
              <button
                onClick={() => {
                  const modalContent =
                    document.getElementById("receipt-content").innerHTML;
                  const printWindow = window.open(
                    "",
                    "",
                    "width=700,height=900"
                  );
                  printWindow.document.write(`
                    <html>
                      <head>
                        <title>Receipt</title>
                        <style>
                          @page { margin: 0; }
                          body {
                            font-family: Arial, sans-serif;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                            margin: 0;
                            padding: 40px;
                          }
                          .receipt-wrapper {
                            border: 2px solid #ddd;
                            border-radius: 12px;
                            padding: 40px;
                            max-width: 500px;
                            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                          }
                          .signature {
                            margin-top: 60px;
                            text-align: center;
                            padding-top: 20px;
                            border-top: 1px solid #ddd;
                          }
                          .signature-line {
                            border-top: 2px solid #333;
                            width: 200px;
                            margin: 40px auto 10px;
                          }
                        </style>
                      </head>
                      <body>
                        <div class="receipt-wrapper">
                          ${modalContent}
                          <div class="signature">
                            <div class="signature-line"></div>
                            <p style="font-size: 14px; color: #555; margin: 0;">Treasurer / Authorized Signature</p>
                          </div>
                        </div>
                      </body>
                    </html>
                  `);
                  printWindow.document.close();
                  printWindow.focus();
                  printWindow.print();
                  printWindow.close();
                }}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-xl hover:from-orange-700 hover:to-orange-800 transition-all shadow-lg hover:shadow-xl font-semibold"
              >
                <Printer className="w-5 h-5" />
                Print Receipt
              </button>
              <button
                onClick={() => setShowReceipt(null)}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-all font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Edit Payment Modal */}
      {editPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-white">Edit Payment</h2>
                <p className="text-blue-200 text-sm mt-1">
                  Update payment details
                </p>
              </div>
              <button
                onClick={() => setEditPayment(null)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                  Amount
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-semibold">
                    ₱
                  </span>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={editPayment.amount}
                    onChange={(e) =>
                      setEditPayment({ ...editPayment, amount: e.target.value })
                    }
                    className="w-full border-2 border-gray-200 rounded-xl pl-8 pr-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <CreditCard className="w-4 h-4 text-blue-600" />
                  Payment Method
                </label>
                <select
                  value={editPayment.modePay}
                  onChange={(e) =>
                    setEditPayment({ ...editPayment, modePay: e.target.value })
                  }
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors bg-white"
                >
                  <option>GCash</option>
                  <option>Over-the-counter</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={editPayment.payDate}
                  onChange={(e) =>
                    setEditPayment({ ...editPayment, payDate: e.target.value })
                  }
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div className="bg-gray-50 px-8 py-6 flex gap-4">
              <button
                onClick={saveEdit}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl font-semibold"
              >
                Save Changes
              </button>
              <button
                onClick={() => setEditPayment(null)}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-all font-semibold"
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

export default PaymentManagement;
