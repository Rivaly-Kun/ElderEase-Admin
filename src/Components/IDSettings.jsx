import React, { useState, useEffect } from "react";
import { X, Save, RefreshCw, Plus, Trash2 } from "lucide-react";
import { ref as dbRef, get, update } from "firebase/database";
import { db } from "../services/firebase";

const DEFAULT_PUROKS = [
  "Purok Catleya",
  "Purok Jasmin",
  "Purok Rosal",
  "Purok Velasco Ave / Urbano",
];

const IDSettings = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    organizationName: "Barangay Pinagbuhatan Senior Citizens",
    presidentName: "",
    presidentDesignation: "President",
    contactNumber: "0948-789-4396",
    barangayName: "Barangay Pinagbuhatan",
    puroks: DEFAULT_PUROKS,
  });
  const [newPurok, setNewPurok] = useState("");

  // Fetch current settings from Firebase
  useEffect(() => {
    if (isOpen) {
      fetchIDSettings();
    }
  }, [isOpen]);

  const fetchIDSettings = async () => {
    setLoading(true);
    try {
      const settingsRef = dbRef(db, "settings/idSettings");
      const snapshot = await get(settingsRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        setFormData((prev) => ({
          ...prev,
          ...data,
          puroks: Array.isArray(data.puroks)
            ? data.puroks.filter((p) => typeof p === "string" && p.trim())
            : prev.puroks,
        }));
      }
    } catch (error) {
      console.error("Error fetching ID settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const sanitizedPuroks = (formData.puroks || [])
        .map((purok) => (purok || "").toString().trim())
        .filter((purok, idx, arr) => purok && arr.indexOf(purok) === idx);

      const settingsRef = dbRef(db, "settings/idSettings");
      await update(settingsRef, {
        ...formData,
        puroks: sanitizedPuroks.length > 0 ? sanitizedPuroks : DEFAULT_PUROKS,
      });
      alert("ID Settings saved successfully!");
      onClose();
    } catch (error) {
      console.error("Error saving ID settings:", error);
      alert("Failed to save ID settings");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    fetchIDSettings();
  };

  const handleAddPurok = () => {
    const trimmed = newPurok.trim();
    if (!trimmed) return;
    setFormData((prev) => {
      const existing = prev.puroks || [];
      if (existing.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
        return prev;
      }
      return {
        ...prev,
        puroks: [...existing, trimmed],
      };
    });
    setNewPurok("");
  };

  const handleUpdatePurok = (index, value) => {
    setFormData((prev) => {
      const updated = [...(prev.puroks || [])];
      updated[index] = value;
      return {
        ...prev,
        puroks: updated,
      };
    });
  };

  const handleRemovePurok = (index) => {
    setFormData((prev) => ({
      ...prev,
      puroks: (prev.puroks || []).filter((_, idx) => idx !== index),
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">System Settings</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition"
          >
            <X size={24} className="text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-200px)]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="animate-spin text-purple-600" size={32} />
            </div>
          ) : (
            <>
              {/* Organization Info */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Organization Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Organization Name
                    </label>
                    <input
                      type="text"
                      name="organizationName"
                      value={formData.organizationName}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Barangay Name
                    </label>
                    <input
                      type="text"
                      name="barangayName"
                      value={formData.barangayName}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Number
                    </label>
                    <input
                      type="text"
                      name="contactNumber"
                      value={formData.contactNumber}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Officers */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Officers
                </h3>
                <div className="space-y-6">
                  {/* President */}
                  <div className="bg-purple-50 p-4 rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-purple-600 rounded-full"></div>
                      <h4 className="font-semibold text-gray-900">President</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Name
                        </label>
                        <input
                          type="text"
                          name="presidentName"
                          value={formData.presidentName}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none"
                          placeholder="Enter president name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Designation
                        </label>
                        <input
                          type="text"
                          name="presidentDesignation"
                          value={formData.presidentDesignation}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Purok Management */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Purok Management
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Customize the list of puroks that appear across the admin
                  tools. These values power member forms, filters, and reports.
                </p>
                <div className="space-y-3">
                  {(formData.puroks || []).length === 0 && (
                    <div className="text-sm text-gray-500 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2">
                      No puroks defined yet. Add at least one to get started.
                    </div>
                  )}
                  {(formData.puroks || []).map((purok, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2"
                    >
                      <input
                        type="text"
                        value={purok}
                        onChange={(e) =>
                          handleUpdatePurok(index, e.target.value)
                        }
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none text-sm"
                        placeholder={`Purok ${index + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePurok(index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="Remove purok"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={newPurok}
                      onChange={(e) => setNewPurok(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none text-sm"
                      placeholder="Add new purok"
                    />
                    <button
                      type="button"
                      onClick={handleAddPurok}
                      className="px-3 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 transition flex items-center gap-2"
                    >
                      <Plus size={16} />
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={handleReset}
            disabled={saving}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={18} />
            Reset
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-purple-600 text-white hover:bg-purple-700 rounded-lg transition flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={18} />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IDSettings;
