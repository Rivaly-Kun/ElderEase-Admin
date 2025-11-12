import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Package,
  CheckCircle,
  Clock,
  DollarSign,
  Upload,
  X,
  FileText,
  AlertCircle,
  RefreshCw,
  Calendar,
  MapPin,
  Eye,
  Download,
  ExternalLink,
} from "lucide-react";
import { ref as dbRef, get, push, set, remove } from "firebase/database";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { db, storage } from "../services/firebase";
import useResolvedCurrentUser from "../hooks/useResolvedCurrentUser";

const ClientBenefitsPortal = () => {
  const [activeTab, setActiveTab] = useState("available"); // available, history, requests
  const [loading, setLoading] = useState(true);

  // Data states
  const [benefits, setBenefits] = useState([]);
  const [userAvailments, setUserAvailments] = useState([]);
  const [userMember, setUserMember] = useState(null);

  // Modal states
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedBenefit, setSelectedBenefit] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [requestNotes, setRequestNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);

  const { currentUser } = useResolvedCurrentUser();

  // Fetch user's member profile
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!currentUser?.email) return;

      try {
        const membersRef = dbRef(db, "members");
        const snapshot = await get(membersRef);

        if (snapshot.exists()) {
          const data = snapshot.val();
          const member = Object.entries(data).find(
            ([, m]) => m.email === currentUser.email
          );

          if (member) {
            setUserMember({
              firebaseKey: member[0],
              ...member[1],
            });
          }
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      }
    };

    fetchUserProfile();
  }, [currentUser]);

  // Fetch benefits registry
  useEffect(() => {
    const fetchBenefits = async () => {
      try {
        const benefitsRef = dbRef(db, "benefits");
        const snapshot = await get(benefitsRef);

        if (snapshot.exists()) {
          const data = snapshot.val();
          const benefitsList = Object.entries(data)
            .map(([key, value]) => ({
              firebaseKey: key,
              ...value,
            }))
            .filter((b) => b.isActive); // Only show active benefits

          setBenefits(benefitsList);
        }
      } catch (error) {
        console.error("Error fetching benefits:", error);
      }
    };

    fetchBenefits();
  }, []);

  // Fetch user's availments
  useEffect(() => {
    const fetchUserAvailments = async () => {
      if (!userMember?.oscaID) return;

      try {
        const availmentsRef = dbRef(db, "availments");
        const snapshot = await get(availmentsRef);

        if (snapshot.exists()) {
          const data = snapshot.val();
          const userAvailmentsList = Object.entries(data)
            .map(([key, value]) => ({
              firebaseKey: key,
              ...value,
            }))
            .filter((a) => a.oscaID === userMember.oscaID);

          // Clean up duplicate rejected requests (keep only the most recent)
          await cleanupDuplicateRejections(userAvailmentsList);

          setUserAvailments(userAvailmentsList);
        } else {
          setUserAvailments([]);
        }
      } catch (error) {
        console.error("Error fetching availments:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserAvailments();
  }, [userMember]);

  // Cleanup duplicate rejected requests for same benefit
  const cleanupDuplicateRejections = async (availmentsList) => {
    try {
      // Group rejected requests by benefitID
      const rejectedByBenefit = {};

      availmentsList.forEach((a) => {
        if (a.status === "Rejected") {
          if (!rejectedByBenefit[a.benefitID]) {
            rejectedByBenefit[a.benefitID] = [];
          }
          rejectedByBenefit[a.benefitID].push(a);
        }
      });

      // For each benefit with multiple rejections, keep only the most recent
      for (const benefitID in rejectedByBenefit) {
        const rejections = rejectedByBenefit[benefitID];

        if (rejections.length > 1) {
          // Sort by date (newest first)
          rejections.sort((a, b) => new Date(b.date) - new Date(a.date));

          // Keep the first (most recent), delete the rest
          const toDelete = rejections.slice(1);

          for (const rejection of toDelete) {
            const deleteRef = dbRef(db, `availments/${rejection.firebaseKey}`);
            await remove(deleteRef);
            console.log(
              `Cleaned up old rejected request: ${rejection.firebaseKey}`
            );
          }
        }
      }
    } catch (error) {
      console.error("Error cleaning up duplicates:", error);
    }
  };

  // Calculate statistics
  const stats = useMemo(() => {
    const currentYear = new Date().getFullYear();

    const approved = userAvailments.filter((a) => a.status === "Approved");
    const pending = userAvailments.filter((a) => a.status === "Pending");

    const thisYearTotal = approved
      .filter((a) => new Date(a.date).getFullYear() === currentYear)
      .reduce((sum, a) => sum + (parseFloat(a.cashValue) || 0), 0);

    const allTimeTotal = approved.reduce(
      (sum, a) => sum + (parseFloat(a.cashValue) || 0),
      0
    );

    return {
      thisYearTotal,
      approvedCount: approved.length,
      pendingCount: pending.length,
      allTimeTotal,
    };
  }, [userAvailments]);

  // Check if user can apply for a benefit (Smart Exemption Logic)
  const checkCanApply = useCallback(
    (benefit) => {
      // Check if already approved
      const hasApproved = userAvailments.some(
        (a) => a.benefitID === benefit.firebaseKey && a.status === "Approved"
      );

      if (hasApproved) {
        return { canApply: false, reason: "Already Applied", type: "approved" };
      }

      // Check if has pending request
      const hasPending = userAvailments.some(
        (a) => a.benefitID === benefit.firebaseKey && a.status === "Pending"
      );

      if (hasPending) {
        return { canApply: false, reason: "Pending", type: "pending" };
      }

      // Check if previously rejected (CAN reapply)
      const lastRejected = userAvailments
        .filter(
          (a) => a.benefitID === benefit.firebaseKey && a.status === "Rejected"
        )
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

      if (lastRejected) {
        return {
          canApply: true,
          reason: "Reapply",
          type: "rejected",
          rejectionData: lastRejected,
        };
      }

      return { canApply: true, reason: "Available", type: "available" };
    },
    [userAvailments]
  );

  // Handle file upload
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setUploadedFiles((prev) => [...prev, ...files]);
  };

  // Remove file from upload list
  const removeFile = (index) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit benefit request
  const submitBenefitRequest = async () => {
    if (!selectedBenefit || uploadedFiles.length === 0) {
      alert("Please select a benefit and upload at least one document.");
      return;
    }

    setSubmitting(true);

    try {
      // Check for existing pending request (shouldn't happen, but double-check)
      const existingPending = userAvailments.find(
        (a) =>
          a.benefitID === selectedBenefit.firebaseKey && a.status === "Pending"
      );

      if (existingPending) {
        alert(
          "⚠️ You already have a pending request for this benefit. Please wait for admin approval."
        );
        setSubmitting(false);
        setShowRequestModal(false);
        return;
      }

      const timestamp = Date.now();
      const referenceNumber = `BR-${timestamp}`;

      // Upload files to Firebase Storage
      const uploadPromises = uploadedFiles.map(async (file, index) => {
        const fileRef = storageRef(
          storage,
          `benefitRequests/${userMember.oscaID}/${timestamp}_${index}_${file.name}`
        );
        await uploadBytes(fileRef, file);
        return await getDownloadURL(fileRef);
      });

      const documentURLs = await Promise.all(uploadPromises);

      // Check if this is a reapplication (updating rejected request)
      const existingRejected = userAvailments
        .filter(
          (a) =>
            a.benefitID === selectedBenefit.firebaseKey &&
            a.status === "Rejected"
        )
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

      // Create availment request payload
      const availmentPayload = {
        oscaID: userMember.oscaID,
        benefitID: selectedBenefit.firebaseKey,
        firstName: userMember.firstName,
        lastName: userMember.lastName,
        memberFirebaseKey: userMember.firebaseKey,
        benefitName: selectedBenefit.benefitName,
        cashValue: selectedBenefit.cashValue,
        date: new Date().toISOString(),
        status: "Pending",
        notes: requestNotes,
        referenceNumber: existingRejected?.referenceNumber || referenceNumber,
        documents: documentURLs,
        dateCreated: new Date().toISOString(),
        submittedBy: userMember.email,
        isReapplication: !!existingRejected,
        previousRejectionDate: existingRejected?.date || null,
        reapplicationCount: (existingRejected?.reapplicationCount || 0) + 1,
      };

      const availmentsRef = dbRef(db, "availments");

      // If reapplying, update the existing rejected request
      // Otherwise, create a new request
      if (existingRejected) {
        const updateRef = dbRef(
          db,
          `availments/${existingRejected.firebaseKey}`
        );
        await set(updateRef, availmentPayload);
        alert(
          `✅ Reapplication submitted successfully!\n\nReference Number: ${availmentPayload.referenceNumber}\n\nYour updated request is now pending admin approval.\n\n💡 Your previous rejected request has been updated with new documents.`
        );
      } else {
        await push(availmentsRef, availmentPayload);
        alert(
          `✅ Request submitted successfully!\n\nReference Number: ${referenceNumber}\n\nYour request is now pending admin approval.`
        );
      }

      // Reset form
      setShowRequestModal(false);
      setSelectedBenefit(null);
      setUploadedFiles([]);
      setRequestNotes("");

      // Refresh availments
      const snapshot = await get(availmentsRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const userAvailmentsList = Object.entries(data)
          .map(([key, value]) => ({
            firebaseKey: key,
            ...value,
          }))
          .filter((a) => a.oscaID === userMember.oscaID);
        setUserAvailments(userAvailmentsList);
      }
    } catch (error) {
      console.error("Error submitting request:", error);
      alert("Failed to submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle reapply from rejection
  const handleReapply = (benefit) => {
    setSelectedBenefit(benefit);
    setShowRequestModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-purple-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin mb-4">
            <div className="w-16 h-16 border-4 border-purple-200 border-t-purple-600 rounded-full mx-auto"></div>
          </div>
          <p className="text-gray-600 font-medium">Loading your benefits...</p>
        </div>
      </div>
    );
  }

  if (!userMember) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-purple-50 to-indigo-100">
        <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Profile Not Found
          </h2>
          <p className="text-gray-600">
            Unable to load your member profile. Please contact the
            administrator.
          </p>
        </div>
      </div>
    );
  }

  const approvedAvailments = userAvailments.filter(
    (a) => a.status === "Approved"
  );
  const pendingOrRejectedAvailments = userAvailments.filter(
    (a) => a.status !== "Approved"
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg">
              <Package className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900">
                My Benefits Portal
              </h1>
              <p className="text-gray-600 mt-1">
                Welcome, {userMember.firstName} {userMember.lastName}
              </p>
            </div>
          </div>

          {/* Statistics Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <div className="bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl p-6 text-white shadow-lg">
              <DollarSign className="w-8 h-8 mb-2 opacity-80" />
              <p className="text-sm opacity-90">This Year Total</p>
              <p className="text-3xl font-bold mt-1">
                ₱{stats.thisYearTotal.toLocaleString()}
              </p>
            </div>

            <div className="bg-gradient-to-br from-green-500 to-green-700 rounded-2xl p-6 text-white shadow-lg">
              <CheckCircle className="w-8 h-8 mb-2 opacity-80" />
              <p className="text-sm opacity-90">Approved</p>
              <p className="text-3xl font-bold mt-1">{stats.approvedCount}</p>
            </div>

            <div className="bg-gradient-to-br from-yellow-500 to-yellow-700 rounded-2xl p-6 text-white shadow-lg">
              <Clock className="w-8 h-8 mb-2 opacity-80" />
              <p className="text-sm opacity-90">Pending</p>
              <p className="text-3xl font-bold mt-1">{stats.pendingCount}</p>
            </div>

            <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
              <DollarSign className="w-8 h-8 mb-2 opacity-80" />
              <p className="text-sm opacity-90">All-Time Total</p>
              <p className="text-3xl font-bold mt-1">
                ₱{stats.allTimeTotal.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveTab("available")}
            className={`px-6 py-3 rounded-xl font-semibold whitespace-nowrap transition-all ${
              activeTab === "available"
                ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg"
                : "bg-white text-gray-700 hover:bg-gray-50 shadow"
            }`}
          >
            <Package className="w-5 h-5 inline mr-2" />
            Available Benefits
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`px-6 py-3 rounded-xl font-semibold whitespace-nowrap transition-all ${
              activeTab === "history"
                ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg"
                : "bg-white text-gray-700 hover:bg-gray-50 shadow"
            }`}
          >
            <CheckCircle className="w-5 h-5 inline mr-2" />
            My Benefits
          </button>

          <button
            onClick={() => setActiveTab("requests")}
            className={`px-6 py-3 rounded-xl font-semibold whitespace-nowrap transition-all ${
              activeTab === "requests"
                ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg"
                : "bg-white text-gray-700 hover:bg-gray-50 shadow"
            }`}
          >
            <Clock className="w-5 h-5 inline mr-2" />
            My Requests
            {stats.pendingCount > 0 && (
              <span className="ml-2 bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full text-xs font-bold">
                {stats.pendingCount}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "available" && (
          <div>
            {benefits.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">
                  No benefits available at this time.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {benefits.map((benefit) => {
                  const applicationStatus = checkCanApply(benefit);

                  return (
                    <div
                      key={benefit.firebaseKey}
                      className={`bg-white rounded-2xl shadow-lg overflow-hidden transition-all ${
                        applicationStatus.canApply
                          ? "hover:shadow-2xl hover:-translate-y-1"
                          : "opacity-75"
                      }`}
                    >
                      <div
                        className={`h-2 ${
                          applicationStatus.type === "approved"
                            ? "bg-orange-500"
                            : applicationStatus.type === "pending"
                            ? "bg-yellow-500"
                            : applicationStatus.type === "rejected"
                            ? "bg-red-500"
                            : "bg-gradient-to-r from-purple-600 to-indigo-600"
                        }`}
                      />

                      <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-xl font-bold text-gray-900 mb-1">
                              {benefit.benefitName}
                            </h3>
                            <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full">
                              {benefit.benefitID}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-3xl font-bold text-purple-600">
                              ₱{benefit.cashValue?.toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                          {benefit.description}
                        </p>

                        <div className="mb-4">
                          <p className="text-xs font-semibold text-gray-700 mb-1">
                            Requirements:
                          </p>
                          <p className="text-xs text-gray-500">
                            {benefit.requirements}
                          </p>
                        </div>

                        {/* Status Badge */}
                        {!applicationStatus.canApply && (
                          <div className="mb-4">
                            {applicationStatus.type === "approved" && (
                              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                                <p className="text-orange-700 font-semibold text-sm">
                                  ✅ Already Applied
                                </p>
                              </div>
                            )}
                            {applicationStatus.type === "pending" && (
                              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                                <p className="text-yellow-700 font-semibold text-sm">
                                  ⏰ Request Pending
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Rejection Warning */}
                        {applicationStatus.type === "rejected" && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                            <p className="text-red-700 font-semibold text-xs mb-1">
                              ⚠️ Previous Request Rejected
                            </p>
                            <p className="text-red-600 text-xs mb-2">
                              {applicationStatus.rejectionData?.notes ||
                                "Please review requirements"}
                            </p>
                            <p className="text-red-500 text-xs">
                              You can reapply with updated documents
                            </p>
                          </div>
                        )}

                        {/* Apply Button */}
                        <button
                          onClick={() => {
                            if (applicationStatus.canApply) {
                              setSelectedBenefit(benefit);
                              setShowRequestModal(true);
                            }
                          }}
                          disabled={!applicationStatus.canApply}
                          className={`w-full py-3 rounded-xl font-semibold transition-all ${
                            applicationStatus.canApply
                              ? applicationStatus.type === "rejected"
                                ? "bg-orange-500 hover:bg-orange-600 text-white"
                                : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
                              : "bg-gray-200 text-gray-500 cursor-not-allowed"
                          }`}
                        >
                          {applicationStatus.type === "rejected"
                            ? "🔄 Reapply"
                            : applicationStatus.canApply
                            ? "Apply Now"
                            : applicationStatus.reason}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div>
            {approvedAvailments.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
                <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg mb-4">
                  You haven't received any benefits yet.
                </p>
                <button
                  onClick={() => setActiveTab("available")}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-indigo-700"
                >
                  Browse Available Benefits
                </button>
              </div>
            ) : (
              <div>
                {/* Summary Card */}
                <div className="bg-gradient-to-br from-green-500 to-green-700 rounded-2xl p-8 text-white mb-6 shadow-xl">
                  <h2 className="text-2xl font-bold mb-4">Benefits Summary</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm opacity-90">Total Benefits</p>
                      <p className="text-3xl font-bold">
                        {approvedAvailments.length}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm opacity-90">This Year</p>
                      <p className="text-3xl font-bold">
                        ₱{stats.thisYearTotal.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm opacity-90">All-Time Total</p>
                      <p className="text-3xl font-bold">
                        ₱{stats.allTimeTotal.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Timeline */}
                <div className="space-y-4">
                  {approvedAvailments
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map((availment, index) => (
                      <div
                        key={availment.firebaseKey}
                        className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-shadow"
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-green-500 to-green-700 rounded-full flex items-center justify-center text-white font-bold shadow-lg">
                            {index + 1}
                          </div>

                          <div className="flex-1">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h3 className="text-xl font-bold text-gray-900">
                                  {availment.benefitName}
                                </h3>
                                <p className="text-sm text-gray-500">
                                  <Calendar className="w-4 h-4 inline mr-1" />
                                  {new Date(availment.date).toLocaleDateString(
                                    "en-US",
                                    {
                                      year: "numeric",
                                      month: "long",
                                      day: "numeric",
                                    }
                                  )}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-bold text-green-600">
                                  ₱{availment.cashValue?.toLocaleString()}
                                </p>
                                <span className="inline-block px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full mt-1">
                                  ✓ Approved
                                </span>
                              </div>
                            </div>

                            {availment.notes && (
                              <div className="bg-gray-50 rounded-lg p-3 mt-3">
                                <p className="text-xs font-semibold text-gray-700 mb-1">
                                  Admin Notes:
                                </p>
                                <p className="text-sm text-gray-600">
                                  {availment.notes}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "requests" && (
          <div>
            {pendingOrRejectedAvailments.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
                <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg mb-4">
                  You have no pending or rejected requests.
                </p>
                <button
                  onClick={() => setActiveTab("available")}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-indigo-700"
                >
                  Apply for Benefits
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingOrRejectedAvailments
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map((request) => (
                    <div
                      key={request.firebaseKey}
                      className="bg-white rounded-2xl shadow-lg overflow-hidden"
                    >
                      <div
                        className={`h-2 ${
                          request.status === "Pending"
                            ? "bg-yellow-500"
                            : "bg-red-500"
                        }`}
                      />

                      <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-xl font-bold text-gray-900 mb-1">
                              {request.benefitName}
                            </h3>
                            <p className="text-sm text-gray-500 mb-2">
                              Ref: {request.referenceNumber}
                            </p>
                            <p className="text-sm text-gray-500">
                              <Calendar className="w-4 h-4 inline mr-1" />
                              Submitted:{" "}
                              {new Date(request.date).toLocaleDateString()}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-2xl font-bold text-purple-600 mb-2">
                              ₱{request.cashValue?.toLocaleString()}
                            </p>
                            <span
                              className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${
                                request.status === "Pending"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {request.status === "Pending"
                                ? "⏰ Pending"
                                : "❌ Rejected"}
                            </span>
                          </div>
                        </div>

                        {request.status === "Rejected" && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                            <p className="text-red-700 font-semibold text-sm mb-2">
                              ❌ Request Rejected
                            </p>
                            {request.notes && (
                              <p className="text-red-600 text-sm mb-3">
                                <strong>Reason:</strong> {request.notes}
                              </p>
                            )}
                            <button
                              onClick={() => {
                                const benefit = benefits.find(
                                  (b) => b.firebaseKey === request.benefitID
                                );
                                if (benefit) handleReapply(benefit);
                              }}
                              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold transition-colors"
                            >
                              🔄 Reapply for This Benefit
                            </button>
                          </div>
                        )}

                        {request.status === "Pending" && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                            <div className="flex justify-between items-center">
                              <p className="text-yellow-700 text-sm">
                                ⏰ Your request is being reviewed by the admin.
                                You'll be notified once it's processed.
                              </p>
                              <button
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setShowDocumentModal(true);
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-semibold transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                                View Details
                              </button>
                            </div>
                          </div>
                        )}

                        {request.status === "Rejected" && request.documents && request.documents.length > 0 && (
                          <div className="mt-4">
                            <p className="text-xs font-semibold text-gray-700 mb-2">
                              Previously Uploaded Documents:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {request.documents.map((doc, idx) => {
                                const docName = typeof doc === 'string' ? `Document ${idx + 1}` : doc.name || `Document ${idx + 1}`;
                                const docUrl = typeof doc === 'string' ? doc : doc.url;
                                
                                return (
                                  <a
                                    key={idx}
                                    href={docUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs text-gray-700 transition-colors"
                                  >
                                    <FileText className="w-4 h-4" />
                                    {docName}
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 rounded-t-2xl flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Apply for Benefit</h2>
                <p className="text-sm opacity-90 mt-1">
                  Submit your application with required documents
                </p>
              </div>
              <button
                onClick={() => {
                  setShowRequestModal(false);
                  setSelectedBenefit(null);
                  setUploadedFiles([]);
                  setRequestNotes("");
                }}
                className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Selected Benefit Display */}
              {selectedBenefit && (
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 border-2 border-purple-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-1">
                        {selectedBenefit.benefitName}
                      </h3>
                      <span className="inline-block px-3 py-1 bg-purple-200 text-purple-800 text-xs font-semibold rounded-full">
                        {selectedBenefit.benefitID}
                      </span>
                    </div>
                    <p className="text-3xl font-bold text-purple-600">
                      ₱{selectedBenefit.cashValue?.toLocaleString()}
                    </p>
                  </div>
                  <p className="text-gray-700 text-sm mt-3">
                    {selectedBenefit.description}
                  </p>
                  <div className="mt-3 bg-white rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-700 mb-1">
                      Requirements:
                    </p>
                    <p className="text-xs text-gray-600">
                      {selectedBenefit.requirements}
                    </p>
                  </div>
                </div>
              )}

              {/* File Upload */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Upload Required Documents *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-purple-500 transition-colors">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 text-sm mb-3">
                    Drag & drop files here, or click to browse
                  </p>
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                    accept="image/*,.pdf,.doc,.docx"
                  />
                  <label
                    htmlFor="file-upload"
                    className="inline-block px-6 py-2 bg-purple-600 text-white rounded-lg cursor-pointer hover:bg-purple-700 transition-colors"
                  >
                    Choose Files
                  </label>
                </div>

                {/* Uploaded Files List */}
                {uploadedFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-purple-600" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {file.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {(file.size / 1024).toFixed(2)} KB
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => removeFile(index)}
                          className="p-1 hover:bg-red-100 rounded-lg text-red-600 transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Additional Notes (Optional)
                </label>
                <textarea
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  rows={4}
                  className="w-full border-2 border-gray-300 rounded-xl p-3 focus:outline-none focus:border-purple-500"
                  placeholder="Add any additional information about your request..."
                />
              </div>

              {/* Submit Button */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowRequestModal(false);
                    setSelectedBenefit(null);
                    setUploadedFiles([]);
                    setRequestNotes("");
                  }}
                  className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitBenefitRequest}
                  disabled={
                    !selectedBenefit || uploadedFiles.length === 0 || submitting
                  }
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Submitting...
                    </span>
                  ) : (
                    "Submit Request"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {showDocumentModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white p-6 rounded-t-2xl flex justify-between items-center z-10">
              <div>
                <h2 className="text-2xl font-bold">Request Details</h2>
                <p className="text-sm opacity-90 mt-1">
                  Reference: {selectedRequest.referenceNumber}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowDocumentModal(false);
                  setSelectedRequest(null);
                }}
                className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Request Information */}
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-6 border-2 border-yellow-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Benefit Type</p>
                    <p className="text-lg font-bold text-gray-900">
                      {selectedRequest.benefitName}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Cash Value</p>
                    <p className="text-lg font-bold text-yellow-600">
                      ₱{selectedRequest.cashValue?.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Status</p>
                    <span className="inline-block px-3 py-1 bg-yellow-200 text-yellow-800 text-sm font-semibold rounded-full">
                      ⏰ Pending Review
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Submitted</p>
                    <p className="text-sm text-gray-700">
                      {selectedRequest.dateSubmitted
                        ? new Date(
                            selectedRequest.dateSubmitted
                          ).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : new Date(selectedRequest.date).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            }
                          )}
                    </p>
                  </div>
                </div>

                {selectedRequest.notes && (
                  <div className="mt-4 bg-white rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-700 mb-1">
                      Your Notes:
                    </p>
                    <p className="text-sm text-gray-600">
                      {selectedRequest.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Uploaded Documents */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  Uploaded Documents ({selectedRequest.documents?.length || 0})
                </h3>

                {selectedRequest.documents &&
                selectedRequest.documents.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedRequest.documents.map((doc, idx) => {
                      // Handle both string URLs and object format
                      const docUrl = typeof doc === "string" ? doc : doc.url;
                      const docName =
                        typeof doc === "string"
                          ? `Document ${idx + 1}`
                          : doc.name || `Document ${idx + 1}`;
                      const docType =
                        typeof doc === "string"
                          ? docUrl.toLowerCase().includes(".pdf")
                            ? "application/pdf"
                            : "image"
                          : doc.type || "unknown";

                      const isImage =
                        docType.includes("image") ||
                        docUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i);
                      const isPDF =
                        docType.includes("pdf") ||
                        docUrl.match(/\.pdf(\?|$)/i);
                      const isDoc =
                        docType.includes("word") ||
                        docType.includes("document") ||
                        docUrl.match(/\.(doc|docx)(\?|$)/i);

                      return (
                        <div
                          key={idx}
                          className="bg-gray-50 rounded-xl overflow-hidden border-2 border-gray-200 hover:border-yellow-400 transition-all"
                        >
                          {/* Document Preview */}
                          <div className="aspect-video bg-gray-100 flex items-center justify-center relative overflow-hidden">
                            {isImage ? (
                              <img
                                src={docUrl}
                                alt={docName}
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                  e.target.style.display = "none";
                                  e.target.nextElementSibling.style.display =
                                    "flex";
                                }}
                              />
                            ) : isPDF ? (
                              <div className="text-center">
                                <FileText className="w-16 h-16 text-red-500 mx-auto mb-2" />
                                <p className="text-sm text-gray-600">
                                  PDF Document
                                </p>
                              </div>
                            ) : isDoc ? (
                              <div className="text-center">
                                <FileText className="w-16 h-16 text-blue-500 mx-auto mb-2" />
                                <p className="text-sm text-gray-600">
                                  Word Document
                                </p>
                              </div>
                            ) : (
                              <div className="text-center">
                                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-2" />
                                <p className="text-sm text-gray-600">
                                  Document File
                                </p>
                              </div>
                            )}
                            <div
                              className="absolute inset-0 bg-gradient-to-br from-gray-400 to-gray-600 items-center justify-center hidden"
                              style={{ display: "none" }}
                            >
                              <FileText className="w-16 h-16 text-white" />
                            </div>
                          </div>

                          {/* Document Info */}
                          <div className="p-4">
                            <p className="text-sm font-semibold text-gray-900 mb-2 truncate">
                              {docName}
                            </p>
                            {typeof doc !== "string" && doc.uploadedAt && (
                              <p className="text-xs text-gray-500 mb-3">
                                Uploaded:{" "}
                                {new Date(doc.uploadedAt).toLocaleDateString()}
                              </p>
                            )}
                            <div className="flex gap-2">
                              <a
                                href={docUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-sm font-semibold transition-colors"
                              >
                                <ExternalLink className="w-4 h-4" />
                                View
                              </a>
                              <a
                                href={docUrl}
                                download
                                className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-semibold transition-colors"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-8 text-center">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No documents uploaded</p>
                  </div>
                )}
              </div>

              {/* Close Button */}
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setShowDocumentModal(false);
                    setSelectedRequest(null);
                  }}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientBenefitsPortal;
