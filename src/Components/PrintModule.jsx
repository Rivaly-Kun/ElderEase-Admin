import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { X, Printer, Filter } from "lucide-react";
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

  const derivePurok = useCallback((member = {}) => {
    const directPurok = member.purok?.toString().trim();
    if (directPurok) {
      return directPurok;
    }

    const rawAddress = member.address?.toString().trim();
    if (!rawAddress) {
      return "N/A";
    }

    const bracketMatch = rawAddress.match(/(Purok\s+[^\[,]+)/i);
    if (bracketMatch && bracketMatch[1]) {
      return bracketMatch[1].trim();
    }

    const parts = rawAddress
      .split(",")
      .map((segment) => segment.trim())
      .filter(Boolean);

    const partWithPurok = parts.find((segment) =>
      /(^|\s)Purok\s+/i.test(segment)
    );
    if (partWithPurok) {
      return partWithPurok;
    }

    const fallbackMatch = rawAddress.match(/Purok\s+[A-Za-z0-9\s\-/]+/i);
    if (fallbackMatch && fallbackMatch[0]) {
      return fallbackMatch[0].trim();
    }

    return "N/A";
  }, []);

  const sanitizeName = useCallback(
    (value, { allowSingleWord = false } = {}) => {
      if (!value) return "";

      const raw = value.toString().trim();
      if (!raw) return "";

      if (!/[A-Za-z]/.test(raw)) {
        return "";
      }

      const hasUppercase = /[A-Z]/.test(raw);
      const hasWhitespace = /\s/.test(raw);

      if (!allowSingleWord && !hasUppercase && !hasWhitespace) {
        return "";
      }

      return raw;
    },
    []
  );

  const sanitizeDesignation = useCallback((value) => {
    if (!value) return "";
    const raw = value.toString().trim();
    if (!raw) return "";
    if (!/[A-Za-z]/.test(raw)) return "";
    return raw;
  }, []);

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

  // Get unique puroks derived from member records
  const puroks = useMemo(() => {
    const unique = new Set();

    members.forEach((member) => {
      const label = derivePurok(member);
      if (label && label !== "N/A") {
        unique.add(label);
      }
    });

    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [members, derivePurok]);

  const presidentName = useMemo(
    () => sanitizeName(idSettings.presidentName, { allowSingleWord: true }),
    [idSettings.presidentName, sanitizeName]
  );
  const presidentDesignation = useMemo(
    () => sanitizeDesignation(idSettings.presidentDesignation) || "President",
    [idSettings.presidentDesignation, sanitizeDesignation]
  );
  const secretaryName = useMemo(
    () => sanitizeName(idSettings.secretaryName),
    [idSettings.secretaryName, sanitizeName]
  );
  const secretaryDesignation = useMemo(
    () => sanitizeDesignation(idSettings.secretaryDesignation),
    [idSettings.secretaryDesignation, sanitizeDesignation]
  );
  const treasurerName = useMemo(
    () => sanitizeName(idSettings.treasurerName),
    [idSettings.treasurerName, sanitizeName]
  );
  const treasurerDesignation = useMemo(
    () => sanitizeDesignation(idSettings.treasurerDesignation),
    [idSettings.treasurerDesignation, sanitizeDesignation]
  );

  const signatureBlocks = useMemo(() => {
    const blocks = [];

    if (presidentName || presidentDesignation) {
      blocks.push({
        key: "president",
        name: presidentName,
        designation: presidentDesignation,
      });
    }

    if (secretaryName && secretaryDesignation) {
      blocks.push({
        key: "secretary",
        name: secretaryName,
        designation: secretaryDesignation,
      });
    }

    if (treasurerName && treasurerDesignation) {
      blocks.push({
        key: "treasurer",
        name: treasurerName,
        designation: treasurerDesignation,
      });
    }

    return blocks;
  }, [
    presidentName,
    presidentDesignation,
    secretaryName,
    secretaryDesignation,
    treasurerName,
    treasurerDesignation,
  ]);

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
      filtered = filtered.filter((m) => derivePurok(m) === selectedPurok);
    }

    // Filter by gender
    if (selectedGender) {
      filtered = filtered.filter((m) => m.gender === selectedGender);
    }

    // Sort by surname
    filtered.sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));

    setPrintContents(filtered);
  }, [filterType, selectedPurok, selectedGender, members, derivePurok]);

  const handlePrint = () => {
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
                            {derivePurok(member)}
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
                {signatureBlocks.length > 0 && (
                  <div className="mt-10 pt-8 border-t-2 border-gray-400">
                    <div className="flex items-center justify-center">
                      <div
                        className="grid gap-12 text-center"
                        style={{
                          gridTemplateColumns: `repeat(${Math.min(
                            signatureBlocks.length,
                            3
                          )}, minmax(0, 1fr))`,
                          maxWidth:
                            signatureBlocks.length === 1
                              ? "280px"
                              : signatureBlocks.length === 2
                              ? "560px"
                              : "100%",
                        }}
                      >
                        {signatureBlocks.map(({ key, name, designation }) => (
                          <div key={key} className="flex flex-col items-center">
                            <div className="w-full h-16 border-b-2 border-gray-800 mb-3"></div>
                            {name && (
                              <p className="font-bold text-base text-gray-900 mb-1">
                                {name}
                              </p>
                            )}
                            {designation && (
                              <p className="text-sm text-gray-700 font-medium">
                                {designation}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
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
