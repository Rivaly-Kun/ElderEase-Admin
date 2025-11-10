import React, { useState, useEffect, useRef } from "react";
import { X, Printer, Download, Filter } from "lucide-react";
import { ref as dbRef, get, onValue } from "firebase/database";
import { db } from "../services/firebase";

const PrintModule = ({ isOpen, onClose, members = [] }) => {
  const [filterType, setFilterType] = useState("all"); // all, active, inactive, new
  const [selectedPurok, setSelectedPurok] = useState("");
  const [selectedGender, setSelectedGender] = useState("");
  const [printContents, setPrintContents] = useState([]);
  const [idSettings, setIdSettings] = useState({
    organizationName: "Barangay Pinagbuhatan Senior Citizens",
    presidentName: "",
    presidentDesignation: "President",
    barangayName: "Barangay Pinagbuhatan",
  });
  const printRef = useRef();

  // Fetch ID Settings when modal opens
  useEffect(() => {
    if (isOpen) {
      const fetchIdSettings = async () => {
        try {
          const settingsRef = dbRef(db, "settings/idSettings");
          const snapshot = await get(settingsRef);
          if (snapshot.exists()) {
            setIdSettings((prev) => ({
              ...prev,
              ...snapshot.val(),
            }));
          }
        } catch (error) {
          console.error("Error fetching ID settings:", error);
        }
      };
      fetchIdSettings();
    }
  }, [isOpen]);

  // Get unique puroks
  const puroks = [...new Set(members.map((m) => m.purok || "N/A"))].filter(
    (p) => p !== "N/A"
  );

  // Filter members based on criteria
  useEffect(() => {
    let filtered = members;

    // Filter by type
    if (filterType === "active") {
      filtered = filtered.filter((m) => !m.archived && !m.deceased);
    } else if (filterType === "inactive") {
      filtered = filtered.filter((m) => m.archived && !m.deceased);
    } else if (filterType === "new") {
      // New members added in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      filtered = filtered.filter(
        (m) => new Date(m.date_created) > thirtyDaysAgo
      );
    }

    // Filter by purok
    if (selectedPurok) {
      filtered = filtered.filter((m) => (m.purok || "N/A") === selectedPurok);
    }

    // Filter by gender
    if (selectedGender) {
      filtered = filtered.filter((m) => m.gender === selectedGender);
    }

    // Sort by surname
    filtered.sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));

    setPrintContents(filtered);
  }, [filterType, selectedPurok, selectedGender, members]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    // For now, use browser print to PDF feature
    window.print();
  };

  const getFilterLabel = () => {
    const labels = {
      all: "All Members",
      active: "Active Members",
      inactive: "Inactive Members",
      new: "Newly Added Members (Last 30 Days)",
    };
    return labels[filterType];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full m-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Print Members</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition"
          >
            <X size={24} className="text-gray-600" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 p-6 border-b border-gray-200 bg-gray-50 flex-wrap">
          <Filter size={20} className="text-gray-600" />

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400"
          >
            <option value="all">All Members</option>
            <option value="active">Active Members</option>
            <option value="inactive">Inactive (Archived)</option>
            <option value="new">Newly Added (Last 30 Days)</option>
          </select>

          <select
            value={selectedPurok}
            onChange={(e) => setSelectedPurok(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400"
          >
            <option value="">All Puroks</option>
            {puroks.map((purok, idx) => (
              <option key={idx} value={purok}>
                {purok}
              </option>
            ))}
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
        </div>

        {/* Preview */}
        <div
          ref={printRef}
          className="flex-1 overflow-y-auto p-6 bg-gray-50"
          id="printable-content"
        >
          <div className="bg-white p-8 rounded-lg">
            {/* Report Header */}
            <div className="text-center mb-8 pb-4 border-b border-gray-300">
              <h1 className="text-3xl font-bold text-gray-900">
                {idSettings.barangayName || "BARANGAY PINAGBUHATAN"}
              </h1>
              <p className="text-lg font-semibold text-gray-700">
                Senior Citizens Report
              </p>
              <p className="text-sm text-gray-600 mt-2">{getFilterLabel()}</p>
              <p className="text-sm text-gray-600">
                Generated: {new Date().toLocaleDateString()} at{" "}
                {new Date().toLocaleTimeString()}
              </p>
            </div>

            {/* Table */}
            {printContents.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600">
                  No members found with current filters
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4 text-sm text-gray-600">
                  <strong>Total Records: {printContents.length}</strong>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-200">
                        <th className="border border-gray-400 px-3 py-2 text-left font-semibold">
                          #
                        </th>
                        <th className="border border-gray-400 px-3 py-2 text-left font-semibold">
                          Full Name
                        </th>
                        <th className="border border-gray-400 px-3 py-2 text-left font-semibold">
                          OSCA ID
                        </th>
                        <th className="border border-gray-400 px-3 py-2 text-left font-semibold">
                          Age
                        </th>
                        <th className="border border-gray-400 px-3 py-2 text-left font-semibold">
                          Gender
                        </th>
                        <th className="border border-gray-400 px-3 py-2 text-left font-semibold">
                          Contact
                        </th>
                        <th className="border border-gray-400 px-3 py-2 text-left font-semibold">
                          Purok
                        </th>
                        <th className="border border-gray-400 px-3 py-2 text-left font-semibold">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {printContents.map((member, idx) => (
                        <tr
                          key={member.firebaseKey || idx}
                          className="border-b"
                        >
                          <td className="border border-gray-400 px-3 py-2">
                            {idx + 1}
                          </td>
                          <td className="border border-gray-400 px-3 py-2">
                            {`${member.lastName || ""} ${member.suffix || ""} ${
                              member.firstName || ""
                            } ${member.middleName || ""}`.trim()}
                          </td>
                          <td className="border border-gray-400 px-3 py-2">
                            {member.oscaID}
                          </td>
                          <td className="border border-gray-400 px-3 py-2">
                            {member.age}
                          </td>
                          <td className="border border-gray-400 px-3 py-2">
                            {member.gender || "N/A"}
                          </td>
                          <td className="border border-gray-400 px-3 py-2">
                            {member.contactNum || "N/A"}
                          </td>
                          <td className="border border-gray-400 px-3 py-2">
                            {member.purok || "N/A"}
                          </td>
                          <td className="border border-gray-400 px-3 py-2">
                            {member.deceased
                              ? "Deceased"
                              : member.archived
                              ? "Inactive"
                              : "Active"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary */}
                <div className="mt-6 p-4 bg-gray-100 rounded-lg">
                  <p className="font-semibold text-gray-900">
                    Active:{" "}
                    {
                      printContents.filter((m) => !m.archived && !m.deceased)
                        .length
                    }{" "}
                    | Inactive:{" "}
                    {
                      printContents.filter((m) => m.archived && !m.deceased)
                        .length
                    }{" "}
                    | Deceased: {printContents.filter((m) => m.deceased).length}
                  </p>
                </div>

                {/* Officers Signature */}
                <div className="mt-8 pt-6 border-t border-gray-300">
                  <div className="grid grid-cols-3 gap-8 text-center">
                    <div>
                      <div className="h-12 border-b border-gray-400 mb-2"></div>
                      <p className="font-semibold text-sm text-gray-900">
                        {idSettings.presidentName || "Mr. Ricardo H. Tlazon"}
                      </p>
                      <p className="text-xs text-gray-600">
                        {idSettings.presidentDesignation || "President"}
                      </p>
                    </div>
                    <div>
                      <div className="h-12 border-b border-gray-400 mb-2"></div>
                      <p className="font-semibold text-sm text-gray-900">
                        {idSettings.secretaryName || ""}
                      </p>
                      <p className="text-xs text-gray-600">
                        {idSettings.secretaryDesignation || "Secretary"}
                      </p>
                    </div>
                    <div>
                      <div className="h-12 border-b border-gray-400 mb-2"></div>
                      <p className="font-semibold text-sm text-gray-900">
                        {idSettings.treasurerName || ""}
                      </p>
                      <p className="text-xs text-gray-600">
                        {idSettings.treasurerDesignation || "Treasurer"}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg transition"
          >
            Close
          </button>
          <button
            onClick={handleDownloadPDF}
            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition flex items-center gap-2"
          >
            <Download size={18} />
            Download PDF
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-purple-600 text-white hover:bg-purple-700 rounded-lg transition flex items-center gap-2"
          >
            <Printer size={18} />
            Print
          </button>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-content,
          #printable-content * {
            visibility: visible;
          }
          #printable-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default PrintModule;
