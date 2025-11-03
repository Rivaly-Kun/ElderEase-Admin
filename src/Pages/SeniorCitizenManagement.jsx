import React, { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import { ref as dbRef, onValue, remove, update } from "firebase/database";
import { db } from "../services/firebase";
import Sidebar from "../Components/Sidebar";
import Header from "../Components/Header";
import AddMemberModal from "../Components/AddMemberModal";
import MemberProfileModal from "../Components/MemberProfileModal";
import AIPoweredScanner from "../Components/QrScanner";
import { useMemberSearch } from "../Context/MemberSearchContext";
import useResolvedCurrentUser from "../hooks/useResolvedCurrentUser";
import { createAuditLogger } from "../utils/AuditLogger";

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
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [selectedAgeRange, setSelectedAgeRange] = useState("");
  const [selectedGender, setSelectedGender] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

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

  const handleUnarchiveMember = async (member) => {
    if (window.confirm(`Unarchive ${member.firstName} ${member.lastName}?`)) {
      try {
        const memberRef = dbRef(db, `members/${member.firebaseKey}`);
        await update(memberRef, {
          archived: false,
          date_updated: new Date().toISOString(),
          updatedBy: actorLabel,
          updatedById: actorId,
          lastActionByRole: actorRole,
        });
        const memberName = `${member.firstName || ""} ${
          member.lastName || ""
        }`.trim();
        await auditLogger.logAction("UNARCHIVE", "Senior Citizens", {
          recordId: member.firebaseKey,
          recordName: memberName || member.oscaID || member.firebaseKey,
        });
        alert("Member unarchived successfully.");
      } catch (error) {
        console.error("Error unarchiving member:", error);
        alert("Failed to unarchive member.");
      }
    }
  };

  // ✅ Auto-archive/unarchive based on payment/facial record activity
  useEffect(() => {
    if (members.length === 0 || paymentsData.length === 0) return;

    const now = new Date();
    const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
    const TWO_YEARS_MS = ONE_YEAR_MS * 2;

    members.forEach((member) => {
      // Skip deceased members - they should never be modified
      if (member.deceased) return;

      // Find this member's payment history
      const memberPayments = paymentsData.filter(
        (p) => p.oscaID === member.oscaID
      );

      // Get most recent payment date (if any)
      const lastPaymentDate = memberPayments.length
        ? new Date(
            Math.max(
              ...memberPayments.map((p) =>
                new Date(p.date_created || p.payDate || 0).getTime()
              )
            )
          )
        : null;

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
  }, [members, paymentsData]);

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

  // Helpers
  const extractBarangay = (address) => {
    if (!address) return "N/A";
    const parts = address.split(",");
    return parts.length >= 2 ? parts[parts.length - 2].trim() : "N/A";
  };

  const isDeceased = (member) => member.deceased === true;

  // Filter logic
  const filteredMembers = members.filter((member) => {
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
      !selectedBarangay || extractBarangay(member.address) === selectedBarangay;

    const matchesAgeRange =
      !selectedAgeRange ||
      (selectedAgeRange === "60-69" && member.age >= 60 && member.age <= 69) ||
      (selectedAgeRange === "70-79" && member.age >= 70 && member.age <= 79) ||
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

    return (
      matchesTab &&
      matchesSearch &&
      matchesBarangay &&
      matchesAgeRange &&
      matchesGender &&
      matchesStatus
    );
  });

  // Actions
  const handleViewProfile = (member) => {
    memberSearch.openMemberProfile(member);
  };

  const handleArchiveMember = async (member) => {
    if (window.confirm(`Archive ${member.firstName} ${member.lastName}?`)) {
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
        const memberName = `${member.firstName || ""} ${
          member.lastName || ""
        }`.trim();
        await auditLogger.logMemberArchived(
          member.firebaseKey,
          memberName || member.oscaID || member.firebaseKey,
          "Manual archive"
        );
        alert("Member archived successfully");
      } catch (error) {
        console.error("Error archiving member:", error);
        alert("Failed to archive member");
      }
    }
  };

  const handleDeleteMember = async (member) => {
    if (
      window.confirm(
        `Delete ${member.firstName} ${member.lastName}? This cannot be undone.`
      )
    ) {
      try {
        const memberRef = dbRef(db, `members/${member.firebaseKey}`);
        await remove(memberRef);
        const memberName = `${member.firstName || ""} ${
          member.lastName || ""
        }`.trim();
        await auditLogger.logMemberDeleted(
          member.firebaseKey,
          memberName || member.oscaID || member.firebaseKey,
          member
        );
        alert("Member deleted successfully");
      } catch (error) {
        console.error("Error deleting member:", error);
        alert("Failed to delete member");
      }
    }
  };

  // ✅ Mark member as deceased manually
  const handleMarkAsDeceased = async (member) => {
    if (
      window.confirm(`Mark ${member.firstName} ${member.lastName} as deceased?`)
    ) {
      try {
        const memberRef = dbRef(db, `members/${member.firebaseKey}`);
        await update(memberRef, {
          deceased: true,
          date_updated: new Date().toISOString(),
          updatedBy: actorLabel,
          updatedById: actorId,
          lastActionByRole: actorRole,
        });
        const memberName = `${member.firstName || ""} ${
          member.lastName || ""
        }`.trim();
        await auditLogger.logAction("MARK_DECEASED", "Senior Citizens", {
          recordId: member.firebaseKey,
          recordName: memberName || member.oscaID || member.firebaseKey,
        });
        alert("Member marked as deceased.");
      } catch (err) {
        console.error("Error marking as deceased:", err);
        alert("Failed to update member.");
      }
    }
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
              <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition flex items-center gap-2">
                <Printer className="w-4 h-4" />
                Print
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-4 mb-4">
            {[
              { key: "active", label: "Active Members" },
              { key: "archived", label: "Archived" },
              { key: "deceased", label: "Deceased" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-6 py-2 rounded-lg font-medium transition ${
                  activeTab === tab.key
                    ? "bg-purple-600 text-white"
                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                {tab.label} (
                {
                  members.filter((m) =>
                    tab.key === "active"
                      ? !m.archived && !isDeceased(m)
                      : tab.key === "archived"
                      ? m.archived === true && !isDeceased(m)
                      : isDeceased(m)
                  ).length
                }
                )
              </button>
            ))}
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
              value={selectedBarangay}
              onChange={(e) => setSelectedBarangay(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400"
            >
              <option value="">All Barangays</option>
              {[...new Set(members.map((m) => extractBarangay(m.address)))].map(
                (bgy, i) => (
                  <option key={i} value={bgy}>
                    {bgy}
                  </option>
                )
              )}
            </select>

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

            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedBarangay("");
                setSelectedGender("");
                setSelectedAgeRange("");
                setSelectedStatus("");
              }}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition"
            >
              Reset
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
                              {`${member.firstName || ""} ${
                                member.middleName || ""
                              } ${member.lastName || ""} ${
                                member.suffix || ""
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
            console.log("📱 Opening profile modal for:", member);
            memberSearch.openMemberProfile(member);
          }}
        />
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <AddMemberModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onMemberAdded={() => console.log("New member added successfully")}
        />
      )}
    </div>
  );
};

export default SeniorCitizenManagement;
