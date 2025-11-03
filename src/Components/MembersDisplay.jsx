// Members Display Component
// Display all members from database with their roles and information

import React, { useState, useEffect } from "react";
import { db } from "../services/firebase";
import { ref, get } from "firebase/database";
import {
  User,
  Phone,
  MapPin,
  Calendar,
  Badge,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const MembersDisplay = ({ currentUser }) => {
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState("all");
  const [expandedMemberId, setExpandedMemberId] = useState(null);

  // Fetch members from database
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch members
        const membersRef = ref(db, "members");
        const membersSnapshot = await get(membersRef);
        if (membersSnapshot.exists()) {
          const membersData = Object.entries(membersSnapshot.val()).map(
            ([key, value]) => ({
              id: key,
              ...value,
            })
          );
          setMembers(membersData);
        }

        // Fetch roles
        const rolesRef = ref(db, "roles");
        const rolesSnapshot = await get(rolesRef);
        if (rolesSnapshot.exists()) {
          setRoles(rolesSnapshot.val());
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter members based on search and role
  const filteredMembers = members.filter((member) => {
    const searchLower = searchQuery.toLowerCase();
    const firstName = member.firstName || "";
    const lastName = member.lastName || "";
    const fullName = `${firstName} ${lastName}`.toLowerCase();
    const contactNum = (member.contactNum || "").toLowerCase();
    const oscaID = (member.oscaID || "").toString().toLowerCase();

    const matchesSearch =
      fullName.includes(searchLower) ||
      contactNum.includes(searchLower) ||
      oscaID.includes(searchLower);

    return matchesSearch;
  });

  // Get role badge color
  const getRoleColor = (role) => {
    const roleColors = {
      admin: "bg-red-100 text-red-800",
      officer: "bg-blue-100 text-blue-800",
      encoder: "bg-yellow-100 text-yellow-800",
      viewer: "bg-gray-100 text-gray-800",
      default: "bg-purple-100 text-purple-800",
    };
    return roleColors[role?.toLowerCase()] || roleColors.default;
  };

  // Calculate age from birthday
  const calculateAge = (birthday) => {
    if (!birthday) return "N/A";
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return age;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin mb-4">
            <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full mx-auto"></div>
          </div>
          <p className="text-gray-600">Loading members...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          System Members
        </h2>
        <p className="text-gray-600">
          View all members with their roles and information
        </p>
      </div>

      {/* Search and Filter */}
      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search by name, contact, or OSCA ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      {/* Results Count */}
      <div className="mb-4 text-sm text-gray-600">
        Showing {filteredMembers.length} of {members.length} members
      </div>

      {/* Members List */}
      <div className="space-y-3">
        {filteredMembers.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <User className="mx-auto text-gray-400 mb-2" size={48} />
            <p className="text-gray-600">No members found</p>
          </div>
        ) : (
          filteredMembers.map((member) => (
            <div
              key={member.id}
              className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition"
            >
              {/* Member Card Header */}
              <button
                onClick={() =>
                  setExpandedMemberId(
                    expandedMemberId === member.id ? null : member.id
                  )
                }
                className="w-full px-4 py-4 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition"
              >
                <div className="flex items-center gap-4 flex-1 text-left">
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                    {(member.firstName?.[0] || "M").toUpperCase()}
                  </div>

                  {/* Basic Info */}
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">
                      {member.firstName} {member.lastName}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {member.contactNum || "No contact"}
                    </p>
                  </div>

                  {/* Age and Status Badge */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded">
                      Age: {calculateAge(member.birthday)}
                    </span>

                    {/* Archived Status */}
                    {member.archived && (
                      <span className="text-sm bg-red-50 text-red-700 px-3 py-1 rounded font-medium">
                        Archived
                      </span>
                    )}

                    {/* Expand Icon */}
                    {expandedMemberId === member.id ? (
                      <ChevronUp className="text-gray-600" />
                    ) : (
                      <ChevronDown className="text-gray-600" />
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded Details */}
              {expandedMemberId === member.id && (
                <div className="px-4 py-4 bg-white border-t border-gray-200 space-y-4">
                  {/* Personal Information */}
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <User size={18} /> Personal Information
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
                      <div>
                        <p className="text-xs text-gray-600 uppercase tracking-wide">
                          Birthday
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {member.birthday || "N/A"} (
                          {calculateAge(member.birthday)} years old)
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 uppercase tracking-wide">
                          Blood Type
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {member.bloodType || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 uppercase tracking-wide">
                          Citizenship
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {member.citizenship || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 uppercase tracking-wide">
                          Civil Status
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {member.civilStat || "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Contact Information */}
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Phone size={18} /> Contact Information
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
                      <div>
                        <p className="text-xs text-gray-600 uppercase tracking-wide">
                          Phone
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {member.contactNum || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 uppercase tracking-wide">
                          OSCA ID / Control #
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {member.oscaID || member.contrNum || "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <MapPin size={18} /> Address
                    </h4>
                    <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded">
                      {member.address || "N/A"}
                    </p>
                    <p className="text-sm text-gray-600 mt-2">
                      Barangay: {member.barangay || "N/A"}
                    </p>
                  </div>

                  {/* Health Information */}
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3">
                      Health Information
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
                      <div>
                        <p className="text-xs text-gray-600 uppercase tracking-wide">
                          Bedridden
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {member.bedridden || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 uppercase tracking-wide">
                          Disabilities
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {member.disabilities || "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ID Information */}
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Badge size={18} /> ID Information
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
                      <div>
                        <p className="text-xs text-gray-600 uppercase tracking-wide">
                          Date Issued
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {member.dateIssue || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 uppercase tracking-wide">
                          Date Expiration
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {member.dateExpiration || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 uppercase tracking-wide">
                          DSWD Pensioner
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {member.dswdPensioner || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 uppercase tracking-wide">
                          DSWD with ATM
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {member.dswdWithATM || "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Timestamps */}
                  <div className="border-t pt-4">
                    <div className="flex flex-col md:flex-row gap-4 text-xs text-gray-600">
                      <div>
                        <p className="uppercase tracking-wide font-medium">
                          Created
                        </p>
                        <p>{member.date_created || "N/A"}</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-wide font-medium">
                          Updated
                        </p>
                        <p>{member.date_updated || "N/A"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Summary */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          <strong>Total Members:</strong> {members.length} |{" "}
          <strong>Archived:</strong> {members.filter((m) => m.archived).length}{" "}
          | <strong>Active:</strong> {members.filter((m) => !m.archived).length}
        </p>
      </div>
    </div>
  );
};

export default MembersDisplay;
