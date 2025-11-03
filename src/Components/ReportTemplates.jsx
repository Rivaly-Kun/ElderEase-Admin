import React, { useState, useEffect, useMemo } from "react";
import { Plus, Copy, Trash2, Edit, Download } from "lucide-react";
import { db } from "../services/firebase";
import { ref as dbRef, onValue, push, remove, update } from "firebase/database";
import { createAuditLogger } from "../utils/AuditLogger";

const ReportTemplates = ({ onTemplateSelect, currentUser }) => {
  const [templates, setTemplates] = useState([]);
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    description: "",
    reportType: "",
    sections: "",
    icon: "📋",
    color: "blue",
    // Filter fields
    dateFrom: "",
    dateTo: "",
    surnameStart: "A",
    surnameEnd: "Z",
    selectedBarangay: "",
    selectedAgeGroup: "",
    selectedStatus: "",
    includeAgeDemographics: false,
    includeAlphabetical: false,
    includeGender: false,
    includeBarangay: false,
    includePayments: false,
    includeServices: false,
    config: {},
  });

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

  // Load templates from Firebase
  useEffect(() => {
    const templatesRef = dbRef(db, "reportTemplates");
    const unsubscribe = onValue(
      templatesRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const templatesData = snapshot.val();
          const templatesList = Object.entries(templatesData).map(
            ([key, value]) => ({
              id: key,
              ...value,
            })
          );
          setTemplates(templatesList);
        } else {
          setTemplates([]);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching templates:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleAddTemplate = async () => {
    if (!newTemplate.name || !newTemplate.reportType) {
      alert("Please fill in template name and report type");
      return;
    }

    const sections = newTemplate.sections
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s);

    // Prepare template data, filtering out undefined values
    const templateData = {
      name: newTemplate.name,
      description: newTemplate.description || "",
      reportType: newTemplate.reportType,
      sections,
      icon: newTemplate.icon || "📋",
      color: newTemplate.color || "blue",
      dateFrom: newTemplate.dateFrom || "",
      dateTo: newTemplate.dateTo || "",
      surnameStart: newTemplate.surnameStart || "A",
      surnameEnd: newTemplate.surnameEnd || "Z",
      selectedBarangay: newTemplate.selectedBarangay || "",
      selectedAgeGroup: newTemplate.selectedAgeGroup || "",
      selectedStatus: newTemplate.selectedStatus || "",
      includeAgeDemographics: newTemplate.includeAgeDemographics || false,
      includeAlphabetical: newTemplate.includeAlphabetical || false,
      includeGender: newTemplate.includeGender || false,
      includeBarangay: newTemplate.includeBarangay || false,
      includePayments: newTemplate.includePayments || false,
      includeServices: newTemplate.includeServices || false,
    };

    try {
      const timestamp = new Date().toISOString();

      if (editingId) {
        const templateRef = dbRef(db, `reportTemplates/${editingId}`);
        const updatePayload = {
          ...templateData,
          lastModified: timestamp,
          lastModifiedBy: actorLabel,
          lastModifiedById: actorId,
        };
        await update(templateRef, updatePayload);

        if (auditLogger?.logTemplateUpdated) {
          await auditLogger.logTemplateUpdated(
            editingId,
            newTemplate.name,
            updatePayload
          );
        }

        alert("✅ Template updated successfully!");
        setEditingId(null);
      } else {
        const templatesRef = dbRef(db, "reportTemplates");
        const createPayload = {
          ...templateData,
          createdDate: timestamp,
          createdBy: actorLabel,
          createdById: actorId,
        };
        const newTemplateRef = await push(templatesRef, createPayload);

        if (auditLogger?.logTemplateCreated && newTemplateRef?.key) {
          await auditLogger.logTemplateCreated(
            newTemplateRef.key,
            newTemplate.name
          );
        }

        alert("✅ Template created successfully!");
      }
      setNewTemplate({
        name: "",
        description: "",
        reportType: "",
        sections: "",
        icon: "📋",
        color: "blue",
        dateFrom: "",
        dateTo: "",
        surnameStart: "A",
        surnameEnd: "Z",
        selectedBarangay: "",
        selectedAgeGroup: "",
        selectedStatus: "",
        includeAgeDemographics: false,
        includeAlphabetical: false,
        includeGender: false,
        includeBarangay: false,
        includePayments: false,
        includeServices: false,
        config: {},
      });
      setShowNewTemplateModal(false);
    } catch (error) {
      console.error("Error saving template:", error);
      alert("❌ Error saving template");
    }
  };

  const duplicateTemplate = async (id) => {
    const template = templates.find((t) => t.id === id);
    if (template) {
      try {
        const templatesRef = dbRef(db, "reportTemplates");
        const timestamp = new Date().toISOString();
        const { id: _omit, ...rest } = template;
        const newTemplateRef = await push(templatesRef, {
          ...rest,
          name: `${template.name} (Copy)`,
          createdDate: timestamp,
          createdBy: actorLabel,
          createdById: actorId,
        });

        if (auditLogger?.logTemplateCreated && newTemplateRef?.key) {
          await auditLogger.logTemplateCreated(
            newTemplateRef.key,
            `${template.name} (Copy)`
          );
        }

        alert("✅ Template duplicated successfully!");
      } catch (error) {
        console.error("Error duplicating template:", error);
        alert("❌ Error duplicating template");
      }
    }
  };

  const editTemplate = (template) => {
    setNewTemplate({
      name: template.name,
      description: template.description,
      reportType: template.reportType,
      sections: (template.sections || []).join(", "),
      icon: template.icon || "📋",
      color: template.color || "blue",
      dateFrom: template.dateFrom || "",
      dateTo: template.dateTo || "",
      surnameStart: template.surnameStart || "A",
      surnameEnd: template.surnameEnd || "Z",
      selectedBarangay: template.selectedBarangay || "",
      selectedAgeGroup: template.selectedAgeGroup || "",
      selectedStatus: template.selectedStatus || "",
      includeAgeDemographics: template.includeAgeDemographics || false,
      includeAlphabetical: template.includeAlphabetical || false,
      includeGender: template.includeGender || false,
      includeBarangay: template.includeBarangay || false,
      includePayments: template.includePayments || false,
      includeServices: template.includeServices || false,
      config: template.config || {},
    });
    setEditingId(template.id);
    setShowNewTemplateModal(true);
  };

  const deleteTemplate = async (id) => {
    if (window.confirm("Are you sure you want to delete this template?")) {
      try {
        const templateRef = dbRef(db, `reportTemplates/${id}`);
        const targetTemplate = templates.find((t) => t.id === id);
        await remove(templateRef);

        if (auditLogger?.logAction) {
          await auditLogger.logAction("DELETE", "Reports", {
            recordId: id,
            recordName: targetTemplate?.name,
            category: "Template",
          });
        }
        alert("✅ Template deleted successfully!");
      } catch (error) {
        console.error("Error deleting template:", error);
        alert("❌ Error deleting template");
      }
    }
  };

  const handleUseTemplate = (template) => {
    if (onTemplateSelect) {
      onTemplateSelect({
        reportType: template.reportType,
        sections: template.sections,
        templateName: template.name,
        description: template.description,
        dateFrom: template.dateFrom,
        dateTo: template.dateTo,
        surnameStart: template.surnameStart,
        surnameEnd: template.surnameEnd,
        selectedBarangay: template.selectedBarangay,
        selectedAgeGroup: template.selectedAgeGroup,
        selectedStatus: template.selectedStatus,
      });
      alert(`✅ "${template.name}" template loaded! All filters pre-filled.`);
    } else {
      alert("Report generation component not connected");
    }
  };

  const getColorStyles = (color) => {
    const styles = {
      blue: "bg-blue-100 text-blue-700 border-blue-300",
      green: "bg-green-100 text-green-700 border-green-300",
      purple: "bg-purple-100 text-purple-700 border-purple-300",
      orange: "bg-orange-100 text-orange-700 border-orange-300",
      indigo: "bg-indigo-100 text-indigo-700 border-indigo-300",
    };
    return styles[color] || styles.blue;
  };

  const getButtonColor = (color) => {
    const styles = {
      blue: "bg-blue-600 hover:bg-blue-700",
      green: "bg-green-600 hover:bg-green-700",
      purple: "bg-purple-600 hover:bg-purple-700",
      orange: "bg-orange-600 hover:bg-orange-700",
      indigo: "bg-indigo-600 hover:bg-indigo-700",
    };
    return styles[color] || styles.blue;
  };

  return (
    <div className="space-y-8">
      {/* Header with Create Button */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Report Templates</h2>
          <p className="text-gray-600 mt-1">
            Create and manage report templates for quick reporting
          </p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setNewTemplate({ name: "", description: "", sections: "" });
            setShowNewTemplateModal(true);
          }}
          className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-semibold transition-all"
        >
          <Plus className="w-5 h-5" />
          Create Template
        </button>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="text-gray-500">
            Loading templates from database...
          </div>
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
          <p className="text-gray-500 text-lg mb-4">
            No templates yet. Create one to get started!
          </p>
          <button
            onClick={() => {
              setEditingId(null);
              setNewTemplate({
                name: "",
                description: "",
                reportType: "",
                sections: "",
              });
              setShowNewTemplateModal(true);
            }}
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-semibold transition-all"
          >
            <Plus className="w-5 h-5" />
            Create First Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {templates.map((template) => (
            <div
              key={template.id}
              className={`rounded-2xl shadow-lg border-2 p-6 hover:shadow-xl transition-all ${getColorStyles(
                template.color
              )}`}
            >
              <div className="text-5xl mb-4">{template.icon}</div>
              <h3 className="text-lg font-bold mb-2">{template.name}</h3>
              <p className="text-sm opacity-80 mb-4 line-clamp-2">
                {template.description}
              </p>

              {template.sections && template.sections.length > 0 && (
                <div className="mb-4 text-xs space-y-1">
                  <p className="font-semibold opacity-70">Includes:</p>
                  {template.sections.slice(0, 2).map((section, idx) => (
                    <p key={idx} className="opacity-70">
                      • {section}
                    </p>
                  ))}
                  {template.sections.length > 2 && (
                    <p className="opacity-70">
                      +{template.sections.length - 2} more
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => handleUseTemplate(template)}
                  title="Use Template"
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-white rounded-lg font-semibold transition-all ${getButtonColor(
                    template.color
                  )}`}
                >
                  <Download className="w-4 h-4" />
                  Use
                </button>
                <button
                  onClick={() => editTemplate(template)}
                  title="Edit Template"
                  className="p-2 bg-white opacity-70 hover:opacity-100 rounded-lg transition-all"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => duplicateTemplate(template.id)}
                  title="Duplicate Template"
                  className="p-2 bg-white opacity-70 hover:opacity-100 rounded-lg transition-all"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteTemplate(template.id)}
                  title="Delete Template"
                  className="p-2 bg-white opacity-70 hover:opacity-100 rounded-lg transition-all hover:bg-red-100"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Template Modal */}
      {showNewTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-8 py-6">
              <h2 className="text-2xl font-bold text-white">
                {editingId ? "Edit Template" : "Create New Template"}
              </h2>
              <p className="text-purple-200 text-sm mt-1">
                {editingId
                  ? "Update template settings"
                  : "Define a custom report template"}
              </p>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Q4 Financial Report"
                    value={newTemplate.name}
                    onChange={(e) =>
                      setNewTemplate({ ...newTemplate, name: e.target.value })
                    }
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">
                    Report Type *
                  </label>
                  <select
                    value={newTemplate.reportType}
                    onChange={(e) =>
                      setNewTemplate({
                        ...newTemplate,
                        reportType: e.target.value,
                      })
                    }
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 bg-white"
                  >
                    <option value="">-- Select report type --</option>
                    <option value="membership">Membership Report</option>
                    <option value="financial">Financial Report</option>
                    <option value="benefits">
                      Services Utilization Report
                    </option>
                    <option value="demographic">Demographic Analysis</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Description
                </label>
                <textarea
                  placeholder="Describe what this template is for..."
                  value={newTemplate.description}
                  onChange={(e) =>
                    setNewTemplate({
                      ...newTemplate,
                      description: e.target.value,
                    })
                  }
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500"
                  rows="3"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Report Sections
                </label>
                <textarea
                  placeholder="e.g., Summary, Members List, Financial Analysis, Demographics (comma-separated)"
                  value={newTemplate.sections}
                  onChange={(e) =>
                    setNewTemplate({
                      ...newTemplate,
                      sections: e.target.value,
                    })
                  }
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500"
                  rows="2"
                />
              </div>

              {/* Report Filters Section */}
              <div className="pt-4 border-t-2 border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-4">
                  Pre-fill Report Filters
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">
                      Date From
                    </label>
                    <input
                      type="date"
                      value={newTemplate.dateFrom}
                      onChange={(e) =>
                        setNewTemplate({
                          ...newTemplate,
                          dateFrom: e.target.value,
                        })
                      }
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">
                      Date To
                    </label>
                    <input
                      type="date"
                      value={newTemplate.dateTo}
                      onChange={(e) =>
                        setNewTemplate({
                          ...newTemplate,
                          dateTo: e.target.value,
                        })
                      }
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">
                      Status
                    </label>
                    <select
                      value={newTemplate.selectedStatus}
                      onChange={(e) =>
                        setNewTemplate({
                          ...newTemplate,
                          selectedStatus: e.target.value,
                        })
                      }
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 bg-white"
                    >
                      <option value="">-- All Status --</option>
                      <option value="Active">Active</option>
                      <option value="Archived">Archived</option>
                      <option value="Pending">Pending Verification</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">
                      Surname Start
                    </label>
                    <select
                      value={newTemplate.surnameStart}
                      onChange={(e) =>
                        setNewTemplate({
                          ...newTemplate,
                          surnameStart: e.target.value,
                        })
                      }
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 bg-white"
                    >
                      {[
                        "A",
                        "B",
                        "C",
                        "D",
                        "E",
                        "F",
                        "G",
                        "H",
                        "I",
                        "J",
                        "K",
                        "L",
                        "M",
                        "N",
                        "O",
                        "P",
                        "Q",
                        "R",
                        "S",
                        "T",
                        "U",
                        "V",
                        "W",
                        "X",
                        "Y",
                        "Z",
                      ].map((letter) => (
                        <option key={letter} value={letter}>
                          {letter}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">
                      Surname End
                    </label>
                    <select
                      value={newTemplate.surnameEnd}
                      onChange={(e) =>
                        setNewTemplate({
                          ...newTemplate,
                          surnameEnd: e.target.value,
                        })
                      }
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 bg-white"
                    >
                      {[
                        "A",
                        "B",
                        "C",
                        "D",
                        "E",
                        "F",
                        "G",
                        "H",
                        "I",
                        "J",
                        "K",
                        "L",
                        "M",
                        "N",
                        "O",
                        "P",
                        "Q",
                        "R",
                        "S",
                        "T",
                        "U",
                        "V",
                        "W",
                        "X",
                        "Y",
                        "Z",
                      ].map((letter) => (
                        <option key={letter} value={letter}>
                          {letter}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">
                      Age Group
                    </label>
                    <select
                      value={newTemplate.selectedAgeGroup}
                      onChange={(e) =>
                        setNewTemplate({
                          ...newTemplate,
                          selectedAgeGroup: e.target.value,
                        })
                      }
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 bg-white"
                    >
                      <option value="">-- All Ages --</option>
                      <option value="60-65">60-65 years</option>
                      <option value="66-70">66-70 years</option>
                      <option value="71-75">71-75 years</option>
                      <option value="76+">76+ years</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t-2 border-gray-100">
                <label className="text-sm font-semibold text-gray-700">
                  Template Icon *
                </label>
                <div className="flex gap-2 flex-wrap">
                  {["📋", "📊", "💰", "👥", "📈", "🎯", "📦", "🏥"].map(
                    (emoji) => (
                      <button
                        key={emoji}
                        onClick={() =>
                          setNewTemplate({ ...newTemplate, icon: emoji })
                        }
                        className={`text-3xl p-3 rounded-xl border-2 transition-all ${
                          newTemplate.icon === emoji
                            ? "border-purple-600 bg-purple-50"
                            : "border-gray-200 hover:border-purple-300"
                        }`}
                      >
                        {emoji}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Template Color *
                </label>
                <div className="flex gap-2 flex-wrap">
                  {["blue", "green", "purple", "orange", "indigo"].map(
                    (color) => (
                      <button
                        key={color}
                        onClick={() =>
                          setNewTemplate({ ...newTemplate, color })
                        }
                        className={`px-4 py-2 rounded-lg font-semibold transition-all ${getButtonColor(
                          color
                        )} ${
                          newTemplate.color === color
                            ? "ring-2 ring-offset-2 ring-gray-400"
                            : "opacity-75"
                        }`}
                      >
                        {color.charAt(0).toUpperCase() + color.slice(1)}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="bg-gray-50 px-8 py-6 flex gap-4">
              <button
                onClick={handleAddTemplate}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 font-semibold"
              >
                {editingId ? "Update Template" : "Create Template"}
              </button>
              <button
                onClick={() => {
                  setShowNewTemplateModal(false);
                  setEditingId(null);
                  setNewTemplate({
                    name: "",
                    description: "",
                    sections: "",
                    reportType: "",
                    icon: "📋",
                    color: "blue",
                    config: {},
                  });
                }}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportTemplates;
