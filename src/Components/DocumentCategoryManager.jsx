import React, { useMemo, useState } from "react";
import { ref, push, set, update, remove } from "firebase/database";
import {
  Loader2,
  PlusCircle,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from "lucide-react";
import { db } from "../services/firebase";
import { createAuditLogger } from "../utils/AuditLogger";

const DEFAULT_NOTE = "Document type configured by admin";

const DocumentCategoryManager = ({ categories, loading, currentUser }) => {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [processingCategoryId, setProcessingCategoryId] = useState("");
  const actorDetails = useMemo(() => {
    if (!currentUser) {
      return {
        actorId: "system",
        actorName: "System",
        actorRole: "System",
      };
    }
    return {
      actorId: currentUser?.uid || "unknown",
      actorName:
        `${currentUser?.firstName || ""} ${
          currentUser?.lastName || ""
        }`.trim() ||
        currentUser?.displayName ||
        "Unknown User",
      actorRole: currentUser?.role || "Administrator",
    };
  }, [currentUser]);

  const auditLogger = useMemo(
    () =>
      createAuditLogger(
        actorDetails.actorId,
        actorDetails.actorName,
        actorDetails.actorRole
      ),
    [actorDetails]
  );

  const handleAddCategory = async (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedNote = note.trim();
    if (!trimmedName) {
      return;
    }
    setSubmitting(true);
    try {
      const categoriesRef = ref(db, "documentCategories");
      const newRef = push(categoriesRef);
      const payload = {
        name: trimmedName,
        note: trimmedNote || DEFAULT_NOTE,
        isActive: true,
        createdAt: new Date().toISOString(),
        createdById: actorDetails.actorId,
        createdBy: actorDetails.actorName,
      };
      await set(newRef, payload);
      await auditLogger.logAction("CREATE", "Document Categories", {
        categoryId: newRef.key,
        name: trimmedName,
      });
      setName("");
      setNote("");
    } catch (error) {
      console.error("Failed to add document category", error);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCategory = async (category) => {
    setProcessingCategoryId(category.id);
    try {
      const categoryRef = ref(db, `documentCategories/${category.id}`);
      const nextState = !category.isActive;
      await update(categoryRef, {
        isActive: nextState,
        updatedAt: new Date().toISOString(),
        updatedById: actorDetails.actorId,
        updatedBy: actorDetails.actorName,
      });
      await auditLogger.logAction("UPDATE", "Document Categories", {
        categoryId: category.id,
        name: category.name,
        isActive: nextState,
      });
    } catch (error) {
      console.error("Failed to update document category", error);
    } finally {
      setProcessingCategoryId("");
    }
  };

  const deleteCategory = async (category) => {
    const confirmed = window.confirm(
      `Remove the document type "${category.name}"? Documents already assigned will keep their existing label.`
    );
    if (!confirmed) {
      return;
    }
    setProcessingCategoryId(category.id);
    try {
      const categoryRef = ref(db, `documentCategories/${category.id}`);
      await remove(categoryRef);
      await auditLogger.logAction("DELETE", "Document Categories", {
        categoryId: category.id,
        name: category.name,
      });
    } catch (error) {
      console.error("Failed to delete document category", error);
    } finally {
      setProcessingCategoryId("");
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <div className="p-5 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              Document Types
            </h2>
            <p className="text-xs text-slate-500">
              Configure which document categories are available when uploading
              files.
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        <form onSubmit={handleAddCategory} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Add a document type (e.g. National ID)"
              className="md:col-span-2 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional note"
              className="md:col-span-2 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="md:col-span-1 inline-flex items-center justify-center px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed transition"
            >
              {submitting ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  <PlusCircle className="mr-2" size={18} />
                  Add
                </>
              )}
            </button>
          </div>
        </form>

        <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="py-10 flex items-center justify-center text-slate-500 text-sm">
              <Loader2 className="animate-spin mr-2" size={18} />
              Loading document types...
            </div>
          ) : categories.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No document types configured yet.
            </div>
          ) : (
            categories.map((category) => {
              const isProcessing = processingCategoryId === category.id;
              return (
                <div
                  key={category.id}
                  className="px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {category.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {category.note || DEFAULT_NOTE}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCategory(category)}
                      disabled={isProcessing}
                      className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-full text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {category.isActive ? (
                        <>
                          <ToggleRight size={18} className="text-emerald-500" />
                          Active
                        </>
                      ) : (
                        <>
                          <ToggleLeft size={18} className="text-slate-400" />
                          Hidden
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCategory(category)}
                      disabled={isProcessing}
                      className="inline-flex items-center gap-1 px-3 py-1.5 border border-rose-200 text-rose-600 rounded-full text-xs font-medium hover:bg-rose-50 disabled:opacity-60"
                    >
                      <Trash2 size={16} />
                      Remove
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentCategoryManager;
