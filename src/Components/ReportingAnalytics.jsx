import React, { useState, useEffect } from "react";
import { TrendingUp, Users, DollarSign, Package } from "lucide-react";
import { ref as dbRef, onValue } from "firebase/database";
import { db } from "../services/firebase";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const ReportingAnalytics = () => {
  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [availments, setAvailments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const membersRef = dbRef(db, "members");
    const unsubscribe = onValue(membersRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const membersList = Object.keys(data).map((key) => ({
          firebaseKey: key,
          ...data[key],
        }));
        setMembers(membersList);
        console.log("Members loaded:", membersList.length);
      } else {
        setMembers([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const paymentsRef = dbRef(db, "payments");
    const unsubscribe = onValue(paymentsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const paymentsList = Object.keys(data).map((key) => ({
          firebaseKey: key,
          ...data[key],
        }));
        setPayments(paymentsList);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const availmentsRef = dbRef(db, "availments");
    const unsubscribe = onValue(availmentsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const availmentsList = Object.keys(data).map((key) => ({
          firebaseKey: key,
          ...data[key],
        }));
        setAvailments(availmentsList);
      }
    });
    return () => unsubscribe();
  }, []);

  // Calculate Membership Trends (Monthly registration)
  const getMembershipTrends = () => {
    const monthData = {};
    members.forEach((member) => {
      const date = new Date(member.dateCreated || new Date());
      const monthKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;
      monthData[monthKey] = (monthData[monthKey] || 0) + 1;
    });

    return Object.keys(monthData)
      .sort()
      .slice(-12)
      .map((month) => ({
        month: new Date(month + "-01").toLocaleDateString("en-US", {
          month: "short",
        }),
        count: monthData[month],
      }));
  };

  // Calculate Age Demographics
  const getAgeDemographics = () => {
    const ageGroups = {
      "60-65": 0,
      "66-70": 0,
      "71-75": 0,
      "76-80": 0,
      "80+": 0,
    };

    members.forEach((member) => {
      try {
        if (member.age) {
          const age = parseInt(member.age);
          if (age >= 60 && age <= 65) ageGroups["60-65"]++;
          else if (age >= 66 && age <= 70) ageGroups["66-70"]++;
          else if (age >= 71 && age <= 75) ageGroups["71-75"]++;
          else if (age >= 76 && age <= 80) ageGroups["76-80"]++;
          else if (age > 80) ageGroups["80+"]++;
        }
      } catch (error) {
        console.error("Error calculating age for member:", member, error);
      }
    });

    console.log(
      "Age demographics calculated:",
      ageGroups,
      "Total members:",
      members.length
    );
    return Object.entries(ageGroups).map(([range, count]) => ({
      name: range,
      value: count,
    }));
  };

  // Calculate Purok Distribution
  const getPurokDistribution = () => {
    const purokData = {};
    members.forEach((member) => {
      // Try to extract purok from member data
      let purok = "Unknown";
      if (member.purok) {
        purok = member.purok;
      } else if (member.address) {
        // Try to extract from address if available
        const addressParts = member.address.split(",");
        if (addressParts.length > 0) {
          purok = addressParts[0].trim();
        }
      }
      purokData[purok] = (purokData[purok] || 0) + 1;
    });

    return Object.entries(purokData)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  };

  // Calculate Payment Collection Trends
  const getPaymentTrends = () => {
    const monthData = {};
    payments.forEach((payment) => {
      const date = new Date(payment.dateCreated || new Date());
      const monthKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;
      monthData[monthKey] =
        (monthData[monthKey] || 0) + (parseFloat(payment.amount) || 0);
    });

    return Object.keys(monthData)
      .sort()
      .slice(-12)
      .map((month) => ({
        month: new Date(month + "-01").toLocaleDateString("en-US", {
          month: "short",
        }),
        amount: monthData[month],
      }));
  };

  // Calculate Financial Summary
  const getFinancialSummary = () => {
    const totalCollected = payments.reduce(
      (sum, p) => sum + (parseFloat(p.amount) || 0),
      0
    );
    const approvedBenefits = availments
      .filter((a) => a.status === "Approved")
      .reduce((sum, a) => sum + (parseFloat(a.cashValue) || 0), 0);

    return {
      totalCollected,
      approvedBenefits,
    };
  };

  // Calculate Service Summary
  const getServiceSummary = () => {
    const approvedCount = availments.filter(
      (a) => a.status === "Approved"
    ).length;
    const uniqueMembers = new Set(availments.map((a) => a.oscaID)).size;
    const totalCash = availments
      .filter((a) => a.status === "Approved")
      .reduce((sum, a) => sum + (parseFloat(a.cashValue) || 0), 0);

    return {
      totalServices: availments.length,
      approvedServices: approvedCount,
      totalMembers: uniqueMembers,
      totalCash,
      avgPerMember: uniqueMembers > 0 ? totalCash / uniqueMembers : 0,
    };
  };

  const COLORS = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];
  const membershipTrends = getMembershipTrends();
  const ageDemographics = getAgeDemographics();
  const purokData = getPurokDistribution();
  const paymentTrends = getPaymentTrends();
  const financial = getFinancialSummary();
  const services = getServiceSummary();

  return (
    <div className="space-y-8">
      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="text-gray-500">Loading analytics data...</div>
        </div>
      )}

      {!loading && members.length === 0 && (
        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-6 text-center">
          <p className="text-yellow-700 font-semibold">
            No member data available yet
          </p>
          <p className="text-yellow-600 text-sm mt-1">
            Please add members first to see analytics
          </p>
        </div>
      )}

      {!loading && members.length > 0 && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl shadow-lg p-6 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-purple-200 text-sm font-medium">
                    Total Collected (6 months)
                  </p>
                  <h3 className="text-3xl font-bold">
                    ₱{financial.totalCollected.toLocaleString()}
                  </h3>
                  <p className="text-purple-200 text-xs mt-2">
                    From payment records
                  </p>
                </div>
                <DollarSign className="w-8 h-8 opacity-80" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl shadow-lg p-6 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-blue-200 text-sm font-medium">
                    Disbursed (Benefits)
                  </p>
                  <h3 className="text-3xl font-bold">
                    ₱{financial.approvedBenefits.toLocaleString()}
                  </h3>
                  <p className="text-blue-200 text-xs mt-2">
                    Approved disbursements
                  </p>
                </div>
                <Package className="w-8 h-8 opacity-80" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-500 to-green-700 rounded-2xl shadow-lg p-6 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-green-200 text-sm font-medium">
                    Members Registered
                  </p>
                  <h3 className="text-3xl font-bold">{members.length}</h3>
                  <p className="text-green-200 text-xs mt-2">Active seniors</p>
                </div>
                <Users className="w-8 h-8 opacity-80" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-orange-500 to-orange-700 rounded-2xl shadow-lg p-6 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-orange-200 text-sm font-medium">
                    Pending Requests
                  </p>
                  <h3 className="text-3xl font-bold">
                    {availments.filter((a) => a.status === "Pending").length}
                  </h3>
                  <p className="text-orange-200 text-xs mt-2">
                    Awaiting approval
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 opacity-80" />
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Membership Trends */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Membership Trends
              </h3>
              {membershipTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={membershipTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#8b5cf6"
                      dot={{ fill: "#8b5cf6" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500 text-center py-12">
                  No data available
                </p>
              )}
            </div>

            {/* Age Demographics */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Age Demographics
              </h3>
              {ageDemographics.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={ageDemographics} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={60} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#8b5cf6" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500 text-center py-12">
                  No data available
                </p>
              )}
            </div>

            {/* Members by Purok */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Members by Purok
              </h3>
              {purokData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={purokData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500 text-center py-12">
                  No data available
                </p>
              )}
            </div>

            {/* Payment Collection Trends */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Payment Collection Trends
              </h3>
              {paymentTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={paymentTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip
                      formatter={(value) => `₱${value.toLocaleString()}`}
                    />
                    <Bar
                      dataKey="amount"
                      fill="#10b981"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500 text-center py-12">
                  No data available
                </p>
              )}
            </div>
          </div>

          {/* Financial & Service Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-6">
                Financial Summary
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-lg">
                  <span className="text-gray-700 font-semibold">
                    Total Collected
                  </span>
                  <span className="text-2xl font-bold text-green-600">
                    ₱{financial.totalCollected.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg">
                  <span className="text-gray-700 font-semibold">
                    Disbursed Accounts
                  </span>
                  <span className="text-2xl font-bold text-blue-600">
                    ₱{financial.approvedBenefits.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-6">
                Service Summary
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
                  <p className="text-xs text-gray-600 font-semibold">
                    Total Services
                  </p>
                  <p className="text-3xl font-bold text-purple-600">
                    {services.totalServices}
                  </p>
                </div>
                <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg">
                  <p className="text-xs text-gray-600 font-semibold">
                    Beneficiaries
                  </p>
                  <p className="text-3xl font-bold text-green-600">
                    {services.totalMembers}
                  </p>
                </div>
                <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                  <p className="text-xs text-gray-600 font-semibold">
                    Total Cash
                  </p>
                  <p className="text-3xl font-bold text-blue-600">
                    ₱{services.totalCash.toLocaleString()}
                  </p>
                </div>
                <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg">
                  <p className="text-xs text-gray-600 font-semibold">
                    Avg per Member
                  </p>
                  <p className="text-3xl font-bold text-orange-600">
                    ₱
                    {services.avgPerMember.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ReportingAnalytics;
