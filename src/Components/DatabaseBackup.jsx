import React, { useState } from "react";
import { Download, Loader, Check, X, Database } from "lucide-react";
import { ref as dbRef, get, child } from "firebase/database";
import { db } from "../services/firebase";

const DatabaseBackup = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleBackupDatabase = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Get entire database
      const dbSnapshot = await get(child(dbRef(db), "/"));

      if (!dbSnapshot.exists()) {
        setError("No data found in database");
        setLoading(false);
        return;
      }

      const backupData = dbSnapshot.val();

      // Create JSON blob
      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });

      // Generate filename with timestamp
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, -5);
      const filename = `ElderEase-DB-Backup-${timestamp}.json`;

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccess(true);
      console.log("✅ Database backup created:", filename);

      // Auto-close after 2 seconds
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (err) {
      console.error("Backup error:", err);
      setError(err.message || "Failed to backup database");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-blue-100 rounded-lg">
            <Database className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Database Backup
            </h2>
            <p className="text-sm text-gray-600">Super Admin Only</p>
          </div>
        </div>

        {/* Content */}
        {success ? (
          <div className="space-y-4">
            <div className="p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg flex items-center gap-3">
              <Check className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Backup Created!</p>
                <p className="text-sm">
                  Your database backup has been downloaded successfully.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-700 text-sm">
              This will download your entire Firebase Realtime Database as a
              JSON file. Use this for:
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold mt-0.5">•</span>
                <span>Disaster recovery</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold mt-0.5">•</span>
                <span>Data migration</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold mt-0.5">•</span>
                <span>Backup and archival</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold mt-0.5">•</span>
                <span>Development/testing</span>
              </li>
            </ul>

            {error && (
              <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg flex items-center gap-2 text-sm">
                <X className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="pt-4 space-y-3">
              <button
                onClick={handleBackupDatabase}
                disabled={loading}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-semibold transition flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Creating Backup...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download Backup
                  </>
                )}
              </button>
              <button
                onClick={onClose}
                disabled={loading}
                className="w-full px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold transition disabled:opacity-50"
              >
                Cancel
              </button>
            </div>

            <div className="p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg text-xs">
              <p className="font-semibold mb-1">⚠️ File Size</p>
              <p>
                Backup file size depends on your data volume. Large databases
                may take a few seconds to download.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatabaseBackup;
