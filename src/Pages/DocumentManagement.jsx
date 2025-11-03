import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  FileText,
  Download,
  Trash2,
  Upload,
  Search,
  RefreshCw,
  X,
  Edit2,
  Eye,
} from "lucide-react";
import { ref as dbRef, onValue } from "firebase/database";
import { db } from "../services/firebase";
import Sidebar from "../Components/Sidebar";
import Header from "../Components/Header";
import MemberDocumentManager from "../Components/MemberDocumentManager";
import useResolvedCurrentUser from "../hooks/useResolvedCurrentUser";
import DocumentCategoryManager from "../Components/DocumentCategoryManager";

const getMemberKey = (member = {}) =>
  member.firebaseKey ||
  member.key ||
  member.id ||
  member.memberId ||
  member.authUid ||
  member.oscaID ||
  "";

const getMemberStatus = (member = {}) => {
  if (member.archived) {
    return "Archived";
  }
  if (member.deceased) {
    return "Deceased";
  }
  if (member.status) {
    return member.status;
  }
  return "Active";
};

const getDocumentCount = (member = {}) => {
  if (!member || typeof member !== "object") return 0;
  if (typeof member.documentCount === "number") return member.documentCount;
  if (typeof member.docCount === "number") return member.docCount;
  if (typeof member.documentsUploaded === "number")
    return member.documentsUploaded;
  if (Array.isArray(member.documents)) return member.documents.length;
  if (member.documents && typeof member.documents === "object") {
    return Object.keys(member.documents).length;
  }
  return 0;
};

const getMemberInitials = (member = {}) => {
  const first = (member.firstName || "").trim();
  const last = (member.lastName || "").trim();

  if (!first && !last) return "SC";

  const firstInitial = first ? first[0].toUpperCase() : "";
  const lastInitial = last ? last[0].toUpperCase() : "";

  const combined = `${firstInitial}${lastInitial}`.trim();

  if (combined) return combined;

  return (first || last).slice(0, 2).toUpperCase();
};

const getMemberAvatar = (member = {}) =>
  member.profileImage ||
  member.photoUrl ||
  member.photoURL ||
  member.avatarUrl ||
  member.imageUrl ||
  null;

const DocumentManagement = () => {
  const [activeMenu, setActiveMenu] = useState("Document Manager");
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [documentCounts, setDocumentCounts] = useState({});
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [barangayFilter, setBarangayFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { currentUser, loading: currentUserLoading } = useResolvedCurrentUser();

  // Fetch members
  useEffect(() => {
    const membersRef = dbRef(db, "members");
    setMembersLoading(true);

    const unsubscribe = onValue(
      membersRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const mapped = Object.entries(data).map(([key, value]) => ({
            firebaseKey: key,
            ...value,
          }));
          setMembers(mapped);
        } else {
          setMembers([]);
        }
        setMembersLoading(false);
      },
      (error) => {
        console.error("Failed to load members", error);
        setMembers([]);
        setMembersLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Fetch categories
  useEffect(() => {
    const categoriesRef = dbRef(db, "documentCategories");
    setCategoriesLoading(true);

    const unsubscribe = onValue(
      categoriesRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const mapped = Object.entries(data).map(([key, value]) => ({
            id: key,
            name: value?.name || "Unnamed",
            note: value?.note || "",
            isActive: value?.isActive !== false,
            createdAt: value?.createdAt,
          }));
          mapped.sort((a, b) => a.name.localeCompare(b.name));
          setCategories(mapped);
        } else {
          setCategories([]);
        }
        setCategoriesLoading(false);
      },
      (error) => {
        console.error("Failed to load document categories", error);
        setCategories([]);
        setCategoriesLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Fetch document counts per member
  useEffect(() => {
    const memberDocumentsRef = dbRef(db, "memberDocuments");

    const unsubscribe = onValue(
      memberDocumentsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const counts = {};

          Object.entries(data).forEach(([memberKey, documents]) => {
            if (documents && typeof documents === "object") {
              counts[memberKey] = Object.keys(documents).length;
            } else {
              counts[memberKey] = 0;
            }
          });

          setDocumentCounts(counts);
        } else {
          setDocumentCounts({});
        }
      },
      (error) => {
        console.error("Failed to load member document counts", error);
        setDocumentCounts({});
      }
    );

    return () => unsubscribe();
  }, []);

  // Get unique barangays
  const barangayOptions = useMemo(() => {
    const unique = new Set();
    members.forEach((member) => {
      if (member.barangay) {
        unique.add(member.barangay);
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [members]);

  // Get unique statuses
  const statusOptions = useMemo(() => {
    const unique = new Set();
    members.forEach((member) => {
      const status = getMemberStatus(member);
      if (status) {
        unique.add(status);
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [members]);

  // Filter members
  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      const matchesSearch =
        `${member.firstName} ${member.lastName} ${member.oscaID} ${member.contactNum}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase());

      const matchesBarangay =
        !barangayFilter || member.barangay === barangayFilter;

      const matchesStatus =
        !statusFilter || getMemberStatus(member) === statusFilter;

      return matchesSearch && matchesBarangay && matchesStatus;
    });
  }, [members, searchQuery, barangayFilter, statusFilter]);

  const handleOpenDocumentManager = (member) => {
    setSelectedMember(member);
    setShowDocumentModal(true);
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setBarangayFilter("");
    setStatusFilter("");
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
        <Header userInfo={currentUser} />

        <main className="flex-1 overflow-y-auto p-8">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <FileText className="w-8 h-8 text-purple-600" />
                <h1 className="text-3xl font-bold text-gray-800">
                  Member Document Library
                </h1>
              </div>
              <p className="text-sm text-gray-500 pl-11">
                Manage and upload documents for senior citizens
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowCategoryModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Manage Categories
              </button>
              <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
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

            {/* Barangay Filter */}
            <select
              value={barangayFilter}
              onChange={(e) => setBarangayFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400"
            >
              <option value="">All Barangays</option>
              {barangayOptions.map((barangay) => (
                <option key={barangay} value={barangay}>
                  {barangay}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400"
            >
              <option value="">All Statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            {/* Reset Button */}
            <button
              onClick={handleResetFilters}
              className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition"
            >
              Reset Filters
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {membersLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin">
                  <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full"></div>
                </div>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <FileText className="w-12 h-12 mb-4 text-gray-300" />
                <p className="text-lg font-medium">
                  No members match your search criteria
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">
                        Member Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">
                        OSCA ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">
                        Barangay
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">
                        Contact
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wide">
                        Documents
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredMembers.map((member) => {
                      const key = getMemberKey(member);
                      const status = getMemberStatus(member);
                      const statusClass =
                        status === "Active"
                          ? "bg-emerald-100 text-emerald-700"
                          : status === "Archived"
                          ? "bg-slate-100 text-slate-700"
                          : status === "Deceased"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-blue-100 text-blue-700";
                      const profileImage = getMemberAvatar(member);
                      const documentTotal =
                        typeof documentCounts[key] === "number"
                          ? documentCounts[key]
                          : getDocumentCount(member);

                      return (
                        <tr key={key} className="hover:bg-gray-50 transition">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {profileImage ? (
                                <img
                                  src={profileImage}
                                  alt={`${member.firstName || ""} ${
                                    member.lastName || ""
                                  }`}
                                  className="h-10 w-10 rounded-full object-cover"
                                />
                              ) : (
                                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-sm font-semibold text-purple-600">
                                  {getMemberInitials(member)}
                                </span>
                              )}
                              <div>
                                <p className="text-sm font-semibold text-gray-900">
                                  {member.firstName || ""}{" "}
                                  {member.lastName || ""}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {member.address || "N/A"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {member.oscaID || ""}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {member.barangay || ""}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {member.contactNum || ""}
                          </td>
                          <td className="px-6 py-4 text-center text-sm font-semibold text-purple-600">
                            {documentTotal}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}
                            >
                              {status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleOpenDocumentManager(member)}
                              className="inline-flex items-center justify-center rounded-full bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-700 transition"
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              Manage Documents
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Document Manager Modal */}
      {showDocumentModal && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {selectedMember.firstName} {selectedMember.lastName}
                </h2>
                <p className="text-purple-100 text-sm">
                  OSCA ID: {selectedMember.oscaID || ""}{" "}
                  {selectedMember.barangay || ""}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowDocumentModal(false);
                  setSelectedMember(null);
                }}
                className="text-white hover:bg-purple-800 p-2 rounded-lg transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <MemberDocumentManager
                member={selectedMember}
                currentUser={currentUser}
                categories={categories}
                categoriesLoading={categoriesLoading}
              />
            </div>
          </div>
        </div>
      )}

      {/* Category Manager Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
              <h2 className="text-2xl font-bold text-white">
                Manage Document Categories
              </h2>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="text-white hover:bg-blue-800 p-2 rounded-lg transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <DocumentCategoryManager
                categories={categories}
                loading={categoriesLoading}
                currentUser={currentUser}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentManagement;
