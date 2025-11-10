import React, { useState, useEffect } from "react";
import { X, Save, RefreshCw } from "lucide-react";
import { ref as dbRef, get, update } from "firebase/database";
import { db } from "../services/firebase";

const IDSettings = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    organizationName: "Barangay Pinagbuhatan Senior Citizens",
    presidentName: "",
    presidentDesignation: "President",
    contactNumber: "0948-789-4396",
    barangayName: "Barangay Pinagbuhatan",
  });

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
        setFormData((prev) => ({
          ...prev,
          ...snapshot.val(),
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
      const settingsRef = dbRef(db, "settings/idSettings");
      await update(settingsRef, formData);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">ID Card Settings</h2>
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
