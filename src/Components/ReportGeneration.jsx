import React, { useState, useEffect, useMemo } from "react";
import {
  Download,
  FileText,
  Calendar,
  Filter,
  X,
  Plus,
  Copy,
} from "lucide-react";
import { ref as dbRef, onValue, push, set } from "firebase/database";
import { db } from "../services/firebase";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { createAuditLogger } from "../utils/AuditLogger";

const ReportGeneration = ({ selectedTemplate, currentUser }) => {
  const [reportType, setReportType] = useState(
    selectedTemplate?.reportType || ""
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [surnameStart, setSurnameStart] = useState("A");
  const [surnameEnd, setSurnameEnd] = useState("Z");
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [selectedAgeGroup, setSelectedAgeGroup] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [barangays, setBarangays] = useState([]);
  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [availments, setAvailments] = useState([]);
  const [reportPreview, setReportPreview] = useState(null);
  const [includeSections, setIncludeSections] = useState({
    executiveSummary: true,
    demographic: true,
    financial: true,
    chartsGraphs: true,
  });
  const [lastGeneratedReportId, setLastGeneratedReportId] = useState(null);

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

  const reportTypeLabels = useMemo(
    () => ({
      membership: "Membership",
      financial: "Financial",
      benefits: "Services",
      demographic: "Demographic",
    }),
    []
  );

  const buildFilterSnapshot = () => ({
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    surnameRange: `${surnameStart || "A"}-${surnameEnd || "Z"}`,
    barangay: selectedBarangay || "All",
    ageGroup: selectedAgeGroup || "All",
    status: selectedStatus || "All",
    includeSections,
  });

  // Fetch data
  useEffect(() => {
    const membersRef = dbRef(db, "members");
    onValue(membersRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const membersList = Object.keys(data).map((key) => ({
          firebaseKey: key,
          ...data[key],
        }));
        setMembers(membersList);
        const uniqueBarangays = [
          ...new Set(membersList.map((m) => m.barangay)),
        ].sort();
        setBarangays(uniqueBarangays);
      }
    });
  }, []);

  useEffect(() => {
    const paymentsRef = dbRef(db, "payments");
    onValue(paymentsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const paymentsList = Object.keys(data).map((key) => ({
          firebaseKey: key,
          ...data[key],
        }));
        setPayments(paymentsList);
      }
    });
  }, []);

  useEffect(() => {
    const availmentsRef = dbRef(db, "availments");
    onValue(availmentsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const availmentsList = Object.keys(data).map((key) => ({
          firebaseKey: key,
          ...data[key],
        }));
        setAvailments(availmentsList);
      }
    });
  }, []);

  // Apply selected template
  useEffect(() => {
    if (selectedTemplate) {
      setReportType(selectedTemplate.reportType || "");
      setDateFrom(selectedTemplate.dateFrom || "");
      setDateTo(selectedTemplate.dateTo || "");
      setSurnameStart(selectedTemplate.surnameStart || "A");
      setSurnameEnd(selectedTemplate.surnameEnd || "Z");
      setSelectedBarangay(selectedTemplate.selectedBarangay || "");
      setSelectedAgeGroup(selectedTemplate.selectedAgeGroup || "");
      setSelectedStatus(selectedTemplate.selectedStatus || "");
      // Show confirmation message
      if (selectedTemplate.templateName) {
        console.log(
          `Template "${selectedTemplate.templateName}" loaded with pre-filled filters`
        );
      }
    }
  }, [selectedTemplate]);

  const filterData = () => {
    let filteredMembers = members;
    let filteredPayments = payments;
    let filteredAvailments = availments;

    // Filter members by barangay and age group
    if (selectedBarangay) {
      filteredMembers = filteredMembers.filter(
        (m) => m.barangay === selectedBarangay
      );
    }

    if (selectedAgeGroup) {
      const [ageMin, ageMax] =
        selectedAgeGroup === "80+"
          ? [80, 150]
          : selectedAgeGroup.split("-").map(Number);
      filteredMembers = filteredMembers.filter((m) => {
        const age = m.age || 0; // Use age field directly from database
        return age >= ageMin && age <= ageMax;
      });
    }

    // Filter by surname range
    if (surnameStart && surnameEnd) {
      const start = surnameStart.toUpperCase();
      const end = surnameEnd.toUpperCase();
      // Handle reverse order (e.g., B-A becomes A-B)
      const [sortedStart, sortedEnd] =
        start <= end ? [start, end] : [end, start];

      filteredMembers = filteredMembers.filter((m) => {
        const surname = (m.lastName || "").toUpperCase();
        if (!surname) return false;
        const firstLetter = surname.charAt(0);
        return firstLetter >= sortedStart && firstLetter <= sortedEnd;
      });
    }

    // Filter by date range
    if (dateFrom) {
      filteredPayments = filteredPayments.filter(
        (p) => new Date(p.dateCreated) >= new Date(dateFrom)
      );
    }
    if (dateTo) {
      filteredPayments = filteredPayments.filter(
        (p) => new Date(p.dateCreated) <= new Date(dateTo)
      );
    }

    // Filter availments by status
    if (selectedStatus) {
      filteredAvailments = filteredAvailments.filter(
        (a) => a.status === selectedStatus
      );
    }

    return { filteredMembers, filteredPayments, filteredAvailments };
  };

  const generatePreview = async () => {
    const { filteredMembers, filteredPayments, filteredAvailments } =
      filterData();

    if (filteredMembers.length === 0 && filteredPayments.length === 0) {
      alert("No data available to generate report.");
      return;
    }

    const summary = {
      totalMembers: filteredMembers.length,
      totalPayments: filteredPayments.reduce(
        (sum, p) => sum + (parseFloat(p.amount) || 0),
        0
      ),
      totalBenefits: filteredAvailments
        .filter((a) => a.status === "Approved")
        .reduce((sum, a) => sum + (parseFloat(a.cashValue) || 0), 0),
      newRegistrations: filteredMembers.filter(
        (m) => new Date(m.dateCreated) >= new Date(dateFrom || "2024-01-01")
      ).length,
      demographics: {
        maleCount: filteredMembers.filter((m) => m.gender === "Male").length,
        femaleCount: filteredMembers.filter((m) => m.gender === "Female")
          .length,
      },
    };

    setReportPreview(summary);

    // Save report to Firebase
    try {
      const reportsRef = dbRef(db, "reports");
      const resolvedType =
        reportTypeLabels[reportType] || reportType || "Custom";
      const newReportRef = push(reportsRef);
      const reportPayload = {
        name: `${resolvedType} Report - ${new Date().toLocaleDateString()}`,
        type: resolvedType,
        dateRange: dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : "All Time",
        barangay: selectedBarangay || "All",
        ageGroup: selectedAgeGroup || "All",
        status: selectedStatus || "All",
        generatedBy: actorLabel,
        generatedById: actorId,
        generatedDate: new Date().toISOString(),
        reportStatus: "Complete",
        totalMembers: filteredMembers.length,
        totalRevenue: filteredPayments.reduce(
          (sum, p) => sum + (parseFloat(p.amount) || 0),
          0
        ),
        totalBenefits: filteredAvailments
          .filter((a) => a.status === "Approved")
          .reduce((sum, a) => sum + (parseFloat(a.cashValue) || 0), 0),
      };
      await set(newReportRef, reportPayload);

      setLastGeneratedReportId(newReportRef.key || null);

      if (auditLogger?.logReportGenerated && newReportRef.key) {
        await auditLogger.logReportGenerated(
          newReportRef.key,
          resolvedType,
          buildFilterSnapshot()
        );
      }

      alert("✅ Report generated and saved to database!");
    } catch (error) {
      console.error("Error saving report to Firebase:", error);
      alert(
        "⚠️ Report preview generated but failed to save to database. You can still export."
      );
    }
  };

  const saveReportToFirebase = async (reportName, reportType) => {
    try {
      const reportsRef = dbRef(db, "reports");
      const newReportRef = push(reportsRef);
      const payload = {
        name: reportName,
        type: reportType,
        dateRange: `${dateFrom} to ${dateTo}`,
        barangay: selectedBarangay || "All",
        ageGroup: selectedAgeGroup || "All",
        status: selectedStatus || "All",
        generatedBy: actorLabel,
        generatedById: actorId,
        generatedDate: new Date().toISOString(),
        reportStatus: "Complete",
      };
      await set(newReportRef, payload);
      setLastGeneratedReportId(newReportRef.key || null);

      if (auditLogger?.logReportGenerated && newReportRef.key) {
        await auditLogger.logReportGenerated(
          newReportRef.key,
          reportType || "Custom",
          buildFilterSnapshot()
        );
      }
      console.log("✅ Report saved to Firebase successfully!");
    } catch (error) {
      console.error("Error saving report to Firebase:", error);
      throw error;
    }
  };

  const generatePDF = async () => {
    try {
      const { filteredMembers, filteredPayments, filteredAvailments } =
        filterData();

      if (filteredMembers.length === 0 && filteredPayments.length === 0) {
        alert(
          "No data available to generate report. Please adjust your filters."
        );
        return;
      }

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      let yPos = margin;
      const resolvedType =
        reportTypeLabels[reportType] || reportType || "Custom";

      // Initialize autoTable (ensure it's available)
      if (!doc.autoTable) {
        console.error("jsPDF-autotable not loaded properly");
        alert("PDF library error. Generating simple report instead.");
      }

      // Header
      doc.setFontSize(18);
      doc.setTextColor(75, 0, 130); // Purple color
      doc.text("ELDER EASE - COMPREHENSIVE REPORT", pageWidth / 2, yPos, {
        align: "center",
      });
      yPos += 10;

      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Report Generated: ${new Date().toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}`,
        pageWidth / 2,
        yPos,
        { align: "center" }
      );

      if (dateFrom && dateTo) {
        yPos += 7;
        doc.text(`Period: ${dateFrom} to ${dateTo}`, pageWidth / 2, yPos, {
          align: "center",
        });
      }
      yPos += 15;

      // Executive Summary
      if (includeSections.executiveSummary) {
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.setFont(undefined, "bold");
        doc.text("EXECUTIVE SUMMARY", margin, yPos);
        yPos += 10;

        const totalRevenue = filteredPayments.reduce(
          (sum, p) => sum + (parseFloat(p.amount) || 0),
          0
        );
        const totalBenefits = filteredAvailments
          .filter((a) => a.status === "Approved")
          .reduce((sum, a) => sum + (parseFloat(a.cashValue) || 0), 0);

        doc.setFont(undefined, "normal");
        doc.setFontSize(10);
        doc.text(`Total Members: ${filteredMembers.length}`, margin, yPos);
        yPos += 7;
        doc.text(
          `Total Payments Collected: ₱${totalRevenue.toLocaleString()}`,
          margin,
          yPos
        );
        yPos += 7;
        doc.text(
          `Total Benefits Disbursed: ₱${totalBenefits.toLocaleString()}`,
          margin,
          yPos
        );
        yPos += 15;

        // Add page break if needed
        if (yPos > pageHeight - 40) {
          doc.addPage();
          yPos = margin;
        }
      }

      // Demographic Section
      if (includeSections.demographic) {
        doc.setFont(undefined, "bold");
        doc.setFontSize(12);
        doc.text("DEMOGRAPHIC INFORMATION", margin, yPos);
        yPos += 10;

        const demographicData = [
          ["Total Members", filteredMembers.length.toString()],
          [
            "Male",
            filteredMembers
              .filter((m) => m.gender === "Male")
              .length.toString(),
          ],
          [
            "Female",
            filteredMembers
              .filter((m) => m.gender === "Female")
              .length.toString(),
          ],
        ];

        doc.autoTable({
          startY: yPos,
          head: [["Category", "Count"]],
          body: demographicData,
          theme: "grid",
          headStyles: { fillColor: [75, 0, 130], textColor: 255 },
          bodyStyles: { textColor: 0 },
          margin: { left: margin, right: margin },
        });

        yPos = doc.lastAutoTable.finalY + 10;

        // Age Group Breakdown
        doc.setFont(undefined, "bold");
        doc.setFontSize(10);
        doc.text("Age Group Breakdown", margin, yPos);
        yPos += 6;

        const ageGroups = {
          "60-65": 0,
          "66-70": 0,
          "71-75": 0,
          "76-80": 0,
          "80+": 0,
        };

        filteredMembers.forEach((m) => {
          const age = m.age || 0; // Use age field directly from database
          if (age >= 60 && age <= 65) ageGroups["60-65"]++;
          else if (age >= 66 && age <= 70) ageGroups["66-70"]++;
          else if (age >= 71 && age <= 75) ageGroups["71-75"]++;
          else if (age >= 76 && age <= 80) ageGroups["76-80"]++;
          else if (age > 80) ageGroups["80+"]++;
        });

        const ageGroupData = Object.entries(ageGroups).map(([range, count]) => [
          range,
          count.toString(),
        ]);

        doc.autoTable({
          startY: yPos,
          head: [["Age Range", "Count"]],
          body: ageGroupData,
          theme: "grid",
          headStyles: { fillColor: [75, 0, 130], textColor: 255 },
          bodyStyles: { textColor: 0 },
          margin: { left: margin, right: margin },
        });

        yPos = doc.lastAutoTable.finalY + 10;

        // Barangay Breakdown
        doc.setFont(undefined, "bold");
        doc.setFontSize(10);
        doc.text("Barangay Distribution", margin, yPos);
        yPos += 6;

        const barangayCount = {};
        filteredMembers.forEach((m) => {
          barangayCount[m.barangay] = (barangayCount[m.barangay] || 0) + 1;
        });

        const barangayData = Object.entries(barangayCount).map(
          ([barangay, count]) => [barangay, count.toString()]
        );

        doc.autoTable({
          startY: yPos,
          head: [["Barangay", "Count"]],
          body: barangayData,
          theme: "grid",
          headStyles: { fillColor: [75, 0, 130], textColor: 255 },
          bodyStyles: { textColor: 0 },
          margin: { left: margin, right: margin },
        });

        yPos = doc.lastAutoTable.finalY + 15;

        // Add page break if needed
        if (yPos > pageHeight - 40) {
          doc.addPage();
          yPos = margin;
        }
      }

      // Financial Section
      if (includeSections.financial) {
        doc.setFont(undefined, "bold");
        doc.setFontSize(12);
        doc.text("FINANCIAL ANALYSIS", margin, yPos);
        yPos += 10;

        const totalCollected = filteredPayments.reduce(
          (sum, p) => sum + (parseFloat(p.amount) || 0),
          0
        );
        const totalDisbursed = filteredAvailments
          .filter((a) => a.status === "Approved")
          .reduce((sum, a) => sum + (parseFloat(a.cashValue) || 0), 0);

        const financialData = [
          ["Total Collected", `₱${totalCollected.toLocaleString()}`],
          ["Total Disbursed", `₱${totalDisbursed.toLocaleString()}`],
          [
            "Net Balance",
            `₱${(totalCollected - totalDisbursed).toLocaleString()}`,
          ],
        ];

        doc.autoTable({
          startY: yPos,
          head: [["Financial Metric", "Amount"]],
          body: financialData,
          theme: "grid",
          headStyles: { fillColor: [75, 0, 130], textColor: 255 },
          bodyStyles: { textColor: 0 },
          margin: { left: margin, right: margin },
        });

        yPos = doc.lastAutoTable.finalY + 10;

        // Payment Methods Breakdown
        if (filteredPayments.length > 0) {
          doc.setFont(undefined, "bold");
          doc.setFontSize(10);
          doc.text("Payments by Mode", margin, yPos);
          yPos += 6;

          const paymentMethods = {};
          filteredPayments.forEach((p) => {
            const method = p.modePay || "Unknown";
            if (!paymentMethods[method]) {
              paymentMethods[method] = { count: 0, total: 0 };
            }
            paymentMethods[method].count++;
            paymentMethods[method].total += parseFloat(p.amount) || 0;
          });

          const paymentMethodData = Object.entries(paymentMethods).map(
            ([method, data]) => [
              method,
              data.count.toString(),
              `₱${data.total.toLocaleString()}`,
            ]
          );

          doc.autoTable({
            startY: yPos,
            head: [["Payment Mode", "Count", "Total Amount"]],
            body: paymentMethodData,
            theme: "grid",
            headStyles: { fillColor: [75, 0, 130], textColor: 255 },
            bodyStyles: { textColor: 0 },
            margin: { left: margin, right: margin },
          });

          yPos = doc.lastAutoTable.finalY + 10;
        }

        // Add page break if needed
        if (yPos > pageHeight - 40) {
          doc.addPage();
          yPos = margin;
        }
      }

      // Charts & Graphs Section
      if (includeSections.chartsGraphs) {
        // Add new page for charts
        doc.addPage();
        yPos = margin;

        doc.setFont(undefined, "bold");
        doc.setFontSize(12);
        doc.text("CHARTS & GRAPHS", margin, yPos);
        yPos += 15;

        // Key Metrics Summary
        doc.setFont(undefined, "bold");
        doc.setFontSize(10);
        doc.text("Key Performance Indicators", margin, yPos);
        yPos += 8;

        const totalMembers = filteredMembers.length;
        const maleCount = filteredMembers.filter(
          (m) => m.gender === "Male"
        ).length;
        const femaleCount = filteredMembers.filter(
          (m) => m.gender === "Female"
        ).length;
        const totalRevenue = filteredPayments.reduce(
          (sum, p) => sum + (parseFloat(p.amount) || 0),
          0
        );
        const totalBenefits = filteredAvailments
          .filter((a) => a.status === "Approved")
          .reduce((sum, a) => sum + (parseFloat(a.cashValue) || 0), 0);

        const kpiData = [
          ["Total Members", totalMembers.toString()],
          ["Male Members", maleCount.toString()],
          ["Female Members", femaleCount.toString()],
          ["Total Revenue", `₱${totalRevenue.toLocaleString()}`],
          ["Total Benefits", `₱${totalBenefits.toLocaleString()}`],
        ];

        doc.autoTable({
          startY: yPos,
          head: [["Metric", "Value"]],
          body: kpiData,
          theme: "grid",
          headStyles: { fillColor: [75, 0, 130], textColor: 255 },
          bodyStyles: { textColor: 0 },
          margin: { left: margin, right: margin },
        });

        yPos = doc.lastAutoTable.finalY + 15;

        // Top Services
        if (filteredAvailments.length > 0) {
          doc.setFont(undefined, "bold");
          doc.setFontSize(10);
          doc.text("Top Services Availed", margin, yPos);
          yPos += 8;

          const serviceCount = {};
          filteredAvailments.forEach((a) => {
            if (a.status === "Approved") {
              serviceCount[a.serviceType] =
                (serviceCount[a.serviceType] || 0) + 1;
            }
          });

          const topServices = Object.entries(serviceCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([service, count]) => [service, count.toString()]);

          doc.autoTable({
            startY: yPos,
            head: [["Service Type", "Count"]],
            body: topServices,
            theme: "grid",
            headStyles: { fillColor: [75, 0, 130], textColor: 255 },
            bodyStyles: { textColor: 0 },
            margin: { left: margin, right: margin },
          });

          yPos = doc.lastAutoTable.finalY + 10;
        }

        // Membership Status Summary
        doc.setFont(undefined, "bold");
        doc.setFontSize(10);
        doc.text("Membership Status Breakdown", margin, yPos);
        yPos += 8;

        const statusCount = {};
        filteredMembers.forEach((m) => {
          statusCount[m.status || "Active"] =
            (statusCount[m.status || "Active"] || 0) + 1;
        });

        const statusData = Object.entries(statusCount).map(
          ([status, count]) => [status, count.toString()]
        );

        doc.autoTable({
          startY: yPos,
          head: [["Status", "Count"]],
          body: statusData,
          theme: "grid",
          headStyles: { fillColor: [75, 0, 130], textColor: 255 },
          bodyStyles: { textColor: 0 },
          margin: { left: margin, right: margin },
        });
      }

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Page ${doc.internal.pages.length - 1} of ${
          doc.internal.pages.length - 1
        }`,
        pageWidth / 2,
        pageHeight - 10,
        { align: "center" }
      );

      // Save PDF locally
      const fileName = `ElderEase_Report_${
        new Date().toISOString().split("T")[0]
      }.pdf`;

      if (auditLogger?.logReportExported) {
        const exportId = lastGeneratedReportId || `ad-hoc-${Date.now()}`;
        const resolvedType =
          reportTypeLabels[reportType] || reportType || "Custom";
        await auditLogger.logReportExported(exportId, resolvedType, "PDF");
      }

      doc.save(fileName);

      // Save report metadata to Firebase
      await saveReportToFirebase(
        fileName,
        reportTypeLabels[reportType] || reportType
      );

      alert("✅ PDF exported successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("❌ Error generating PDF. Please try again.");
    }
  };

  const generateExcel = async () => {
    try {
      const { filteredMembers, filteredPayments, filteredAvailments } =
        filterData();

      if (filteredMembers.length === 0) {
        alert("No data available to export");
        return;
      }

      let csvContent = "";

      // Add report metadata header
      csvContent += `ELDER EASE - COMPREHENSIVE REPORT\n`;
      csvContent += `Generated: ${new Date().toLocaleString()}\n`;
      if (dateFrom && dateTo) {
        csvContent += `Period: ${dateFrom} to ${dateTo}\n`;
      }
      csvContent += `Report Type: ${reportType || "General"}\n`;
      csvContent += `Filter: Surname Range (${surnameStart}-${surnameEnd}), Barangay (${
        selectedBarangay || "All"
      }), Age Group (${selectedAgeGroup || "All"}), Status (${
        selectedStatus || "All"
      })\n\n`;

      // EXECUTIVE SUMMARY SECTION
      if (includeSections.executiveSummary) {
        csvContent += `EXECUTIVE SUMMARY\n`;
        const totalRevenue = filteredPayments.reduce(
          (sum, p) => sum + (parseFloat(p.amount) || 0),
          0
        );
        const totalBenefits = filteredAvailments
          .filter((a) => a.status === "Approved")
          .reduce((sum, a) => sum + (parseFloat(a.cashValue) || 0), 0);

        csvContent += `Total Members,${filteredMembers.length}\n`;
        csvContent += `Total Payments Collected,₱${totalRevenue.toLocaleString()}\n`;
        csvContent += `Total Benefits Disbursed,₱${totalBenefits.toLocaleString()}\n\n`;
      }

      // DEMOGRAPHIC SECTION
      if (includeSections.demographic) {
        csvContent += `DEMOGRAPHIC INFORMATION\n`;
        const maleCount = filteredMembers.filter(
          (m) => m.gender === "Male"
        ).length;
        const femaleCount = filteredMembers.filter(
          (m) => m.gender === "Female"
        ).length;

        csvContent += `Category,Count\n`;
        csvContent += `Total Members,${filteredMembers.length}\n`;
        csvContent += `Male,${maleCount}\n`;
        csvContent += `Female,${femaleCount}\n\n`;

        // Age Group Breakdown
        csvContent += `Age Group Breakdown\n`;
        csvContent += `Age Range,Count\n`;
        const ageGroups = {
          "60-65": 0,
          "66-70": 0,
          "71-75": 0,
          "76-80": 0,
          "80+": 0,
        };

        filteredMembers.forEach((m) => {
          const age = m.age || 0; // Use age field directly from database
          if (age >= 60 && age <= 65) ageGroups["60-65"]++;
          else if (age >= 66 && age <= 70) ageGroups["66-70"]++;
          else if (age >= 71 && age <= 75) ageGroups["71-75"]++;
          else if (age >= 76 && age <= 80) ageGroups["76-80"]++;
          else if (age > 80) ageGroups["80+"]++;
        });

        Object.entries(ageGroups).forEach(([range, count]) => {
          csvContent += `${range},${count}\n`;
        });

        // Purok Breakdown
        csvContent += `\nPurok Distribution\n`;
        csvContent += `Purok,Count\n`;
        const purokCount = {};
        filteredMembers.forEach((m) => {
          let purok = "Unknown";
          if (m.purok) {
            purok = m.purok;
          } else if (m.address) {
            const addressParts = m.address.split(",");
            if (addressParts.length > 0) {
              purok = addressParts[0].trim();
            }
          }
          purokCount[purok] = (purokCount[purok] || 0) + 1;
        });
        Object.entries(purokCount).forEach(([purok, count]) => {
          csvContent += `${purok},${count}\n`;
        });
        csvContent += `\n`;
      }

      // FINANCIAL SECTION
      if (includeSections.financial) {
        csvContent += `FINANCIAL ANALYSIS\n`;
        const totalCollected = filteredPayments.reduce(
          (sum, p) => sum + (parseFloat(p.amount) || 0),
          0
        );
        const totalDisbursed = filteredAvailments
          .filter((a) => a.status === "Approved")
          .reduce((sum, a) => sum + (parseFloat(a.cashValue) || 0), 0);

        csvContent += `Financial Metric,Amount\n`;
        csvContent += `Total Collected,₱${totalCollected.toLocaleString()}\n`;
        csvContent += `Total Disbursed,₱${totalDisbursed.toLocaleString()}\n`;
        csvContent += `Net Balance,₱${(
          totalCollected - totalDisbursed
        ).toLocaleString()}\n\n`;

        // Payment Methods Breakdown
        if (filteredPayments.length > 0) {
          csvContent += `Payments by Mode\n`;
          csvContent += `Payment Mode,Count,Total Amount\n`;
          const paymentMethods = {};
          filteredPayments.forEach((p) => {
            const method = p.modePay || "Unknown";
            if (!paymentMethods[method]) {
              paymentMethods[method] = { count: 0, total: 0 };
            }
            paymentMethods[method].count++;
            paymentMethods[method].total += parseFloat(p.amount) || 0;
          });
          Object.entries(paymentMethods).forEach(([method, data]) => {
            csvContent += `${method},${
              data.count
            },₱${data.total.toLocaleString()}\n`;
          });
          csvContent += `\n`;
        }
      }

      // MEMBERS DATA SECTION (Always include for reference)
      csvContent += `MEMBERS DATA\n`;
      csvContent +=
        "OSCA ID,First Name,Last Name,Gender,Age,Barangay,Contact,Status,Date Created\n";

      filteredMembers.forEach((member) => {
        const age = member.age || "N/A"; // Use age field directly from database
        const dateCreated = member.date_created
          ? new Date(member.date_created).toLocaleDateString()
          : new Date(member.dateCreated).toLocaleDateString();
        csvContent += `"${member.oscaID || ""}","${member.firstName || ""}","${
          member.lastName || ""
        }","${member.gender || ""}","${age}","${member.barangay || ""}","${
          member.contactNum || member.contactNumber || ""
        }","${member.status || "Active"}","${dateCreated || ""}"\n`;
      });

      csvContent += `\n`;

      // PAYMENTS DATA SECTION
      if (filteredPayments.length > 0) {
        csvContent += `PAYMENTS DATA\n`;
        csvContent += `Member ID,Name,Amount,Date,Payment Mode,Description,Status\n`;
        filteredPayments.forEach((payment) => {
          const paymentDate = payment.payDate
            ? payment.payDate.substring(0, 10) // Format: "2025-11-07T03:48" -> "2025-11-07"
            : payment.date_created
            ? new Date(payment.date_created).toLocaleDateString()
            : "";
          const memberName = `${payment.firstName || ""} ${
            payment.lastName || ""
          }`.trim();
          csvContent += `"${payment.oscaID || ""}","${memberName}","₱${
            payment.amount || "0"
          }","${paymentDate || ""}","${payment.modePay || ""}","${
            payment.payDesc || ""
          }","${payment.payment_status || ""}"\n`;
        });
        csvContent += `\n`;
      }

      // BENEFITS DATA SECTION
      if (filteredAvailments.length > 0) {
        csvContent += `BENEFITS AVAILED DATA\n`;
        csvContent += `Member ID,Service Type,Cash Value,Status,Date\n`;
        filteredAvailments.forEach((availment) => {
          const benefitDate = availment.approvalDate
            ? new Date(availment.approvalDate).toLocaleDateString()
            : availment.createdAt
            ? new Date(availment.createdAt).toLocaleDateString()
            : "";
          csvContent += `"${availment.memberId || ""}","${
            availment.serviceType || ""
          }","₱${availment.cashValue || "0"}","${
            availment.status || ""
          }","${benefitDate}"\n`;
        });
      }

      // Add UTF-8 BOM for proper character encoding
      const BOM = "\uFEFF";
      const csvWithBOM = BOM + csvContent;

      // Create Blob with proper UTF-8 encoding
      const blob = new Blob([csvWithBOM], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `ElderEase_Report_${new Date().toISOString().split("T")[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      if (auditLogger?.logReportExported) {
        const exportId = lastGeneratedReportId || `ad-hoc-${Date.now()}`;
        const resolvedType =
          reportTypeLabels[reportType] || reportType || "Custom";
        await auditLogger.logReportExported(exportId, resolvedType, "CSV");
      }

      alert("✅ Excel file exported successfully!");
    } catch (error) {
      console.error("Error exporting Excel:", error);
      alert("❌ Error exporting Excel. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Report Configuration */}
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <Filter className="w-6 h-6 text-purple-600" />
          Report Configuration
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">
              Report Type
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 bg-white"
            >
              <option value="">-- Select report type</option>
              <option value="membership">Membership Report</option>
              <option value="financial">Financial Report</option>
              <option value="benefits">Services Utilization Report</option>
              <option value="demographic">Demographic Analysis</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Date From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Date To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">
              Filter by Surname Range
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={surnameStart}
                onChange={(e) => setSurnameStart(e.target.value)}
                className="border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 bg-white"
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
              <select
                value={surnameEnd}
                onChange={(e) => setSurnameEnd(e.target.value)}
                className="border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 bg-white"
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
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">
              Filter by Barangay
            </label>
            <select
              value={selectedBarangay}
              onChange={(e) => setSelectedBarangay(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 bg-white"
            >
              <option value="">-- All Barangays</option>
              {barangays.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">
              Age Group
            </label>
            <select
              value={selectedAgeGroup}
              onChange={(e) => setSelectedAgeGroup(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 bg-white"
            >
              <option value="">-- All Ages</option>
              <option value="60-65">60-65 years old</option>
              <option value="66-70">66-70 years old</option>
              <option value="71-75">71-75 years old</option>
              <option value="76-80">76-80 years old</option>
              <option value="80+">80+ years old</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">
              Membership Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 bg-white"
            >
              <option value="">-- All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* Include Sections Checkboxes */}
        <div className="mt-6 pt-6 border-t">
          <label className="text-sm font-semibold text-gray-700 block mb-4">
            Include Sections:
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(includeSections).map(([key, value]) => (
              <label
                key={key}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) =>
                    setIncludeSections({
                      ...includeSections,
                      [key]: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-gray-700 capitalize">
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Report Preview */}
        {reportPreview && (
          <div className="mt-8 p-8 bg-white rounded-2xl border-2 border-gray-200 shadow-lg">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                <FileText className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">
                {reportType === "membership"
                  ? "Membership Report"
                  : reportType === "financial"
                  ? "Financial Report"
                  : reportType === "benefits"
                  ? "Services Utilization Report"
                  : "Demographic Analysis"}
              </h3>
              <p className="text-gray-600 mt-1">
                {dateFrom && dateTo
                  ? `${dateFrom} - ${dateTo}`
                  : "Report Period"}
              </p>
            </div>

            {/* Executive Summary Cards */}
            <div className="mb-8">
              <h4 className="text-lg font-bold text-gray-900 mb-4">
                Executive Summary
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-2 gap-6">
                <div className="border-l-4 border-purple-600 pl-4">
                  <p className="text-sm text-gray-600 mb-1">Total Members</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {reportPreview.totalMembers.toLocaleString()}
                  </p>
                </div>
                <div className="border-l-4 border-blue-600 pl-4">
                  <p className="text-sm text-gray-600 mb-1">Active Members</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {reportPreview.newRegistrations.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Demographics Section */}
            {reportPreview.demographics && (
              <div className="mb-8">
                <h4 className="text-lg font-bold text-gray-900 mb-4">
                  Demographics
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                    <span className="text-gray-700">Male</span>
                    <span className="text-gray-900 font-semibold">
                      {reportPreview.demographics.maleCount}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                    <span className="text-gray-700">Female</span>
                    <span className="text-gray-900 font-semibold">
                      {reportPreview.demographics.femaleCount}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Financial Summary Section */}
            <div className="mb-8">
              <h4 className="text-lg font-bold text-gray-900 mb-4">
                Financial Summary
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                  <span className="text-gray-700">Total Revenue</span>
                  <span className="text-2xl font-bold text-green-600">
                    ₱{reportPreview.totalPayments.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                  <span className="text-gray-700">Total Disbursed</span>
                  <span className="text-2xl font-bold text-orange-600">
                    ₱{reportPreview.totalBenefits.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-8 flex gap-4 flex-wrap">
          <button
            onClick={generatePreview}
            className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-semibold"
          >
            <FileText className="w-5 h-5" />
            Generate Report
          </button>
          <button
            onClick={generatePDF}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold"
          >
            <Download className="w-5 h-5" />
            Export PDF
          </button>
          <button
            onClick={generateExcel}
            className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold"
          >
            <Download className="w-5 h-5" />
            Export Excel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportGeneration;
