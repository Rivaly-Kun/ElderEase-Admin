import React, { useEffect, useMemo, useState } from "react";
import {
  Upload,
  Download,
  Trash2,
  Loader2,
  X,
  Folder,
  FolderOpen,
  FileText,
  Image,
  File,
} from "lucide-react";
import { storage, db } from "../services/firebase";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { ref as dbRef, onValue, push, set, remove } from "firebase/database";
import { createAuditLogger } from "../utils/AuditLogger";

const MAX_FILES_PER_CATEGORY = 5;
const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return "";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = 2;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1
  );
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const formatDate = (timestamp) => {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  } catch (error) {
    return "";
  }
};

const getFileIcon = (contentType) => {
  if (contentType?.includes("image"))
    return <Image className="w-5 h-5 text-blue-600" />;
  if (contentType?.includes("pdf"))
    return <FileText className="w-5 h-5 text-red-600" />;
  return <File className="w-5 h-5 text-gray-600" />;
};

const MemberDocumentManager = ({
  member,
  currentUser,
  categories = [],
  categoriesLoading = false,
}) => {
  const memberKey = useMemo(() => {
    if (!member) return "";
    return (
      member.firebaseKey ||
      member.key ||
      member.id ||
      member.memberId ||
      member.authUid ||
      member.oscaID ||
      ""
    );
  }, [member]);

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const actorId = currentUser?.uid || currentUser?.id || "unknown";
  const actorLabel =
    currentUser?.actorLabel ||
    currentUser?.displayName ||
    currentUser?.email ||
    "Unknown";
  const auditLogger = useMemo(
    () =>
      createAuditLogger(actorId, actorLabel, currentUser?.role || "Unknown"),
    [actorId, actorLabel, currentUser?.role]
  );

  // Load documents from Firebase
  useEffect(() => {
    if (!memberKey) {
      setDocuments([]);
      setLoading(false);
      return;
    }

    const documentsRef = dbRef(db, `memberDocuments/${memberKey}`);
    setLoading(true);

    const unsubscribe = onValue(
      documentsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const parsed = Object.entries(data).map(([key, value]) => ({
            id: key,
            ...value,
          }));
          parsed.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
          setDocuments(parsed);
        } else {
          setDocuments([]);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error loading documents", err);
        setError("Failed to load documents");
        setDocuments([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [memberKey]);

  // Group documents by category
  const documentsByCategory = useMemo(() => {
    const grouped = {};
    categories.forEach((cat) => {
      grouped[cat.id] = {
        category: cat,
        documents: documents.filter((doc) => doc.categoryId === cat.id),
      };
    });
    return grouped;
  }, [documents, categories]);

  const handleFileSelect = (e) => {
    const filesArray = Array.from(e.target.files || []);
    const currentCount =
      documentsByCategory[selectedCategory?.id]?.documents?.length || 0;
    const availableSlots = MAX_FILES_PER_CATEGORY - currentCount;

    if (filesArray.length > availableSlots) {
      setError(
        `You can only add ${availableSlots} more file(s). Maximum ${MAX_FILES_PER_CATEGORY} per category.`
      );
      const limitedFiles = filesArray.slice(0, availableSlots);
      setSelectedFiles(limitedFiles);
    } else {
      setSelectedFiles(filesArray);
      setError("");
    }
  };

  const handleUpload = async () => {
    if (!selectedCategory || selectedFiles.length === 0 || !memberKey) {
      setError("Please select a category and choose files");
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");

    try {
      for (const file of selectedFiles) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          throw new Error(`${file.name} exceeds ${MAX_FILE_SIZE_MB}MB limit`);
        }
      }

      const docListRef = dbRef(db, `memberDocuments/${memberKey}`);

      for (const file of selectedFiles) {
        const newDocRef = push(docListRef);

        if (!newDocRef.key) {
          throw new Error("Unable to allocate storage for document");
        }

        const storagePath = `memberDocuments/${memberKey}/${newDocRef.key}_${file.name}`;
        const fileRef = storageRef(storage, storagePath);

        await uploadBytes(fileRef, file);
        const downloadURL = await getDownloadURL(fileRef);

        const payload = {
          name: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
          category: selectedCategory.name,
          categoryId: selectedCategory.id,
          categoryName: selectedCategory.name,
          notes: "",
          storagePath,
          downloadURL,
          uploadedAt: Date.now(),
          uploadedBy:
            currentUser?.displayName || currentUser?.email || "System",
          uploadedById: currentUser?.uid || currentUser?.id || null,
          memberKey,
          memberOscaID: member?.oscaID || null,
        };

        await set(newDocRef, payload);

        if (auditLogger?.logAction) {
          await auditLogger.logAction("UPLOAD", "Document Management", {
            recordId: newDocRef.key,
            recordName: file.name,
            memberKey,
            memberName: `${member?.firstName || ""} ${
              member?.lastName || ""
            }`.trim(),
            category: selectedCategory.name,
            categoryId: selectedCategory.id,
            size: file.size,
          });
        }
      }

      setSuccess(`Successfully uploaded ${selectedFiles.length} file(s)`);
      setSelectedFiles([]);
      setSelectedCategory(null);
      setShowUploadModal(false);
    } catch (err) {
      console.error("Upload error:", err);
      setError(err.message || "Failed to upload files");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc) => {
    if (!memberKey || !doc?.id) return;
    if (!window.confirm(`Delete ${doc.name}?`)) return;

    setDeletingId(doc.id);
    setError("");

    try {
      if (doc.storagePath) {
        const fileRef = storageRef(storage, doc.storagePath);
        await deleteObject(fileRef);
      }
      await remove(dbRef(db, `memberDocuments/${memberKey}/${doc.id}`));

      if (auditLogger?.logAction) {
        await auditLogger.logAction("DELETE", "Document Management", {
          recordId: doc.id,
          recordName: doc.name,
          memberKey,
          memberName: `${member?.firstName || ""} ${
            member?.lastName || ""
          }`.trim(),
          category: doc.categoryName,
          categoryId: doc.categoryId,
        });
      }

      setSuccess("File deleted successfully");
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete file");
    } finally {
      setDeletingId("");
    }
  };

  const handleDownload = (doc) => {
    if (!doc?.downloadURL) return;
    const link = document.createElement("a");
    link.href = doc.downloadURL;
    link.download = doc.name || "document";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading documents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-2xl shadow-lg p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">📁 My Documents</h2>
            <p className="text-blue-100">
              Organize documents by category. Each folder holds up to{" "}
              {MAX_FILES_PER_CATEGORY} files.
            </p>
          </div>
          <button
            onClick={() => {
              setShowUploadModal(true);
              setSelectedCategory(null);
              setSelectedFiles([]);
              setError("");
            }}
            className="px-6 py-3 bg-white text-purple-600 rounded-lg hover:bg-gray-100 transition font-bold flex items-center gap-2 whitespace-nowrap shadow-lg"
          >
            <Upload className="w-5 h-5" />
            Upload Files
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3">
          <span>❌</span>
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-start gap-3">
          <span>✅</span>
          <span>{success}</span>
        </div>
      )}

      {!memberKey && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg">
          Select a valid member record to manage documents.
        </div>
      )}

      {/* Search */}
      {categories.length > 0 && documents.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-300 p-4">
          <label className="block text-sm font-bold text-gray-700 mb-2">
            🔍 Search Files
          </label>
          <input
            type="text"
            placeholder="Search by file name or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      )}

      {/* Categories/Folders */}
      {categories.length > 0 ? (
        <div className="space-y-4">
          {categories.map((category) => {
            const categoryData = documentsByCategory[category.id];
            const docCount = categoryData.documents.length;
            const isExpanded = expandedCategory === category.id;
            const isFull = docCount >= MAX_FILES_PER_CATEGORY;

            return (
              <div
                key={category.id}
                className="bg-white rounded-xl border-2 border-gray-200 hover:border-purple-400 transition overflow-hidden"
              >
                {/* Folder Header */}
                <div
                  onClick={() =>
                    setExpandedCategory(isExpanded ? null : category.id)
                  }
                  className="p-6 flex items-center justify-between hover:bg-gray-50 cursor-pointer group"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <span className="text-4xl">{isExpanded ? "📂" : "📁"}</span>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 group-hover:text-purple-600 transition">
                        {category.name}
                      </h3>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-sm font-semibold text-purple-600">
                          📄 {docCount}/{MAX_FILES_PER_CATEGORY} files
                        </span>
                        {isFull && (
                          <span className="inline-block px-2 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">
                            ⚠️ FULL
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isFull) {
                        setError(
                          `This folder is full! Maximum ${MAX_FILES_PER_CATEGORY} files per category.`
                        );
                        return;
                      }
                      setSelectedCategory(category);
                      setShowUploadModal(true);
                      setSelectedFiles([]);
                      setError("");
                    }}
                    disabled={isFull}
                    className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 text-sm transition ${
                      isFull
                        ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                        : "bg-purple-600 text-white hover:bg-purple-700"
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    Add
                  </button>
                </div>

                {/* Folder Contents */}
                {isExpanded && (
                  <div className="border-t-2 border-gray-200 bg-gray-50 p-6">
                    {docCount > 0 ? (
                      <div className="space-y-3">
                        {categoryData.documents
                          .filter(
                            (doc) =>
                              searchQuery === "" ||
                              doc.name
                                .toLowerCase()
                                .includes(searchQuery.toLowerCase()) ||
                              category.name
                                .toLowerCase()
                                .includes(searchQuery.toLowerCase())
                          )
                          .map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 hover:border-purple-300 group"
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="p-3 bg-gray-100 rounded-lg flex-shrink-0">
                                  {getFileIcon(doc.contentType)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-gray-900 truncate text-sm">
                                    {doc.name}
                                  </p>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                                    <span>{formatBytes(doc.size)}</span>
                                    <span>📅 {formatDate(doc.uploadedAt)}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                                {doc.downloadURL && (
                                  <button
                                    onClick={() => handleDownload(doc)}
                                    className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition"
                                    title="Download"
                                  >
                                    <Download className="w-5 h-5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDelete(doc)}
                                  disabled={deletingId === doc.id}
                                  className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition disabled:opacity-50"
                                  title="Delete"
                                >
                                  {deletingId === doc.id ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-5 h-5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-gray-500 font-medium mb-3">
                          No files in this folder
                        </p>
                        <button
                          onClick={() => {
                            setSelectedCategory(category);
                            setShowUploadModal(true);
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-semibold text-sm"
                        >
                          <Upload className="w-4 h-4" />
                          Upload First File
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center p-12 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-gray-700 font-medium">
            No document categories available yet.
          </p>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b bg-gradient-to-r from-purple-600 to-blue-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">📤 Upload Files</h2>
                  {selectedCategory && (
                    <p className="text-purple-100 text-sm mt-1">
                      To: {selectedCategory.name} ({" "}
                      {documentsByCategory[selectedCategory.id]?.documents
                        ?.length || 0}
                      /{MAX_FILES_PER_CATEGORY} )
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFiles([]);
                    setSelectedCategory(null);
                  }}
                  className="p-2 hover:bg-white/20 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {!selectedCategory ? (
                <div className="space-y-3">
                  <p className="text-sm font-bold text-gray-700 uppercase">
                    📂 Select a Folder
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {categories.map((cat) => {
                      const docCount =
                        documentsByCategory[cat.id]?.documents?.length || 0;
                      const isFull = docCount >= MAX_FILES_PER_CATEGORY;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setSelectedCategory(cat)}
                          disabled={isFull}
                          className={`p-4 border-2 rounded-lg text-left transition ${
                            isFull
                              ? "opacity-50 cursor-not-allowed border-gray-300"
                              : "border-gray-300 hover:border-purple-500 hover:bg-purple-50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">📁</span>
                              <div>
                                <p className="font-bold text-gray-900">
                                  {cat.name}
                                </p>
                                <p className="text-xs text-gray-600 mt-1">
                                  {docCount}/{MAX_FILES_PER_CATEGORY} files
                                </p>
                              </div>
                            </div>
                            {isFull && (
                              <span className="text-xs font-bold text-orange-600">
                                FULL
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <>
                  {/* File Drop Zone */}
                  <div className="relative border-3 border-dashed border-purple-400 rounded-xl p-8 text-center hover:border-purple-600 hover:bg-purple-50 transition bg-purple-50/30">
                    <input
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      disabled={uploading}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Upload className="w-12 h-12 mx-auto mb-3 text-purple-500" />
                    <p className="text-base font-bold text-gray-900 mb-1">
                      Click to upload or drag files
                    </p>
                    <p className="text-sm text-gray-600">
                      PDF, images, documents up to {MAX_FILE_SIZE_MB}MB
                    </p>
                  </div>

                  {/* Selected Files */}
                  {selectedFiles.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-gray-700">
                        ✓ Selected ({selectedFiles.length})
                      </p>
                      <div className="space-y-2 bg-green-50 rounded-lg border border-green-300 p-4 max-h-40 overflow-y-auto">
                        {selectedFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 bg-white rounded border border-green-200 text-sm"
                          >
                            <span className="truncate text-gray-900 font-medium">
                              {file.name}
                            </span>
                            <button
                              onClick={() =>
                                setSelectedFiles(
                                  selectedFiles.filter((_, i) => i !== idx)
                                )
                              }
                              className="p-1 text-red-600 hover:bg-red-100 rounded transition flex-shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t bg-gray-50 flex gap-3">
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setSelectedFiles([]);
                  setSelectedCategory(null);
                }}
                disabled={uploading}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 disabled:opacity-50 transition font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={
                  !selectedCategory || selectedFiles.length === 0 || uploading
                }
                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transition font-semibold flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload {selectedFiles.length} File(s)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemberDocumentManager;
