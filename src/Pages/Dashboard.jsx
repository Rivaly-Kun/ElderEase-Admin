import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  UserPlus,
  Bell,
  Mail,
  FileBarChart,
  DollarSign,
  TrendingUp,
  Home,
  Heart,
  CreditCard,
  Lock,
  MessageSquare,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Sidebar from "../Components/Sidebar";
import Header from "../Components/Header";
import { db } from "../services/firebase";
import { ref, get } from "firebase/database";
import {
  ensureMemberCollection,
  isMemberActive,
  isMemberDeceased,
} from "../utils/memberStatus";
import useResolvedCurrentUser from "../hooks/useResolvedCurrentUser";
import { canAccessModule } from "../utils/permissionUtils";

const Dashboard = () => {
  const [activeMenu, setActiveMenu] = useState("Dashboard");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState([
    { label: "Total Members", value: "0", icon: Users },
    { label: "Active", value: "0", subtitle: "Out of 0", icon: UserPlus },
    { label: "Pending Verification", value: "0", icon: Bell },
    { label: "Payments Collected", value: "₱0", icon: DollarSign },
  ]);
  const [ageData, setAgeData] = useState([
    {
      range: "60 - 65 years",
      percentage: 0,
      displayPercentage: 0,
      color: "#4F46E5",
    },
    {
      range: "66 - 70 years",
      percentage: 0,
      displayPercentage: 0,
      color: "#06B6D4",
    },
    {
      range: "71 - 75 years",
      percentage: 0,
      displayPercentage: 0,
      color: "#F59E0B",
    },
    {
      range: "76+ years",
      percentage: 0,
      displayPercentage: 0,
      color: "#EF4444",
    },
  ]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [membershipTrends, setMembershipTrends] = useState([]);
  const [purokData, setPurokData] = useState([]);
  const navigate = useNavigate();
  const { currentUser, loading: currentUserLoading } = useResolvedCurrentUser();
  const userRole = currentUser?.role || currentUser?.roleName || "Unknown";

  // Quick Actions with navigation
  const quickActions = useMemo(() => {
    const actions = [
      {
        label: "Add New Member",
        icon: UserPlus,
        color: "bg-blue-500",
        action: () =>
          navigate("/citizens", {
            state: { openAddMemberModal: true },
          }),
        module: "Senior Citizens",
        actionType: "create",
      },
      {
        label: "Send Notifications",
        icon: Mail,
        color: "bg-green-500",
        action: () => navigate("/notifications"),
        module: "Notifications",
        actionType: "view",
      },
      {
        label: "Generate Reports",
        icon: FileBarChart,
        color: "bg-red-500",
        action: () =>
          navigate("/reports", {
            state: { initialTab: "generate" },
          }),
        module: "Reports",
        actionType: "view",
      },
      {
        label: "View Analytics",
        icon: TrendingUp,
        color: "bg-purple-500",
        action: () =>
          navigate("/reports", {
            state: { initialTab: "analytics" },
          }),
        module: "Reports",
        actionType: "view",
      },
      {
        label: "Process Payments",
        icon: DollarSign,
        color: "bg-yellow-500",
        action: () =>
          navigate("/payments", {
            state: { openNewPaymentModal: true },
          }),
        module: "Payments",
        actionType: "create",
      },
    ];

    // Super Admin sees all actions
    if (userRole === "Super Admin") {
      return actions;
    }

    return actions.filter(({ module, actionType }) =>
      module ? canAccessModule(userRole, module, actionType) : true
    );
  }, [navigate, userRole]);
  useEffect(() => {
    const formatCurrency = (amount) =>
      `₱${Number(amount || 0).toLocaleString("en-PH", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })}`;

    const inferAge = (member) => {
      if (member?.age) {
        const parsed = parseInt(member.age, 10);
        if (!Number.isNaN(parsed)) return parsed;
      }

      const now = new Date();

      if (member?.birthday_year) {
        const parsedYear = parseInt(member.birthday_year, 10);
        if (!Number.isNaN(parsedYear)) {
          return now.getFullYear() - parsedYear;
        }
      }

      if (member?.birthday) {
        const birthDate = new Date(member.birthday);
        if (!Number.isNaN(birthDate.getTime())) {
          let age = now.getFullYear() - birthDate.getFullYear();
          const hasHadBirthdayThisYear =
            now.getMonth() > birthDate.getMonth() ||
            (now.getMonth() === birthDate.getMonth() &&
              now.getDate() >= birthDate.getDate());
          if (!hasHadBirthdayThisYear) age -= 1;
          return age;
        }
      }

      return null;
    };

    const getRelativeTime = (dateString) => {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return "Unknown";

      const diffMs = Date.now() - date.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes < 1) return "Just now";
      if (diffMinutes < 60) return `${diffMinutes} minute(s) ago`;

      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours} hour(s) ago`;

      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays} day(s) ago`;

      const diffWeeks = Math.floor(diffDays / 7);
      if (diffWeeks < 4) return `${diffWeeks} week(s) ago`;

      const diffMonths = Math.floor(diffDays / 30);
      if (diffMonths < 12) return `${diffMonths} month(s) ago`;

      const diffYears = Math.floor(diffDays / 365);
      return `${diffYears} year(s) ago`;
    };

    const fetchDashboardData = async () => {
      try {
        const [membersSnapshot, paymentsSnapshot] = await Promise.all([
          get(ref(db, "members")),
          get(ref(db, "payments")),
        ]);

        const rawMembers = membersSnapshot.exists()
          ? Object.entries(membersSnapshot.val()).map(([id, value]) => ({
              id,
              ...value,
            }))
          : [];

        const members = ensureMemberCollection(rawMembers);

        const payments = paymentsSnapshot.exists()
          ? Object.entries(paymentsSnapshot.val()).map(([id, value]) => ({
              id,
              ...value,
            }))
          : [];

        // === Stats ===
        const totalMembers = members.filter(
          (member) => !isMemberDeceased(member)
        ).length;
        const activeMembers = members.filter((member) =>
          isMemberActive(member)
        ).length;

        const pendingVerification = members.filter(
          (member) =>
            !member.lastVerificationPassed && !isMemberDeceased(member)
        ).length;

        const totalPayments = payments.reduce((sum, payment) => {
          const numericAmount = parseFloat(
            `${payment.amount || 0}`.replace(/[^0-9.]/g, "")
          );
          if (Number.isNaN(numericAmount)) {
            return sum;
          }
          return sum + numericAmount;
        }, 0);

        setStats([
          {
            label: "Total Members",
            value: totalMembers.toLocaleString(),
            icon: Users,
          },
          {
            label: "Active",
            value: activeMembers.toLocaleString(),
            subtitle: `Out of ${totalMembers.toLocaleString()}`,
            icon: UserPlus,
          },
          {
            label: "Pending Verification",
            value: pendingVerification.toLocaleString(),
            icon: Bell,
          },
          {
            label: "Payments Collected",
            value: formatCurrency(totalPayments),
            icon: DollarSign,
          },
        ]);

        // === Age Demographics ===
        const ageRanges = [
          { key: "60_65", label: "60 - 65 years", color: "#4F46E5" },
          { key: "66_70", label: "66 - 70 years", color: "#06B6D4" },
          { key: "71_75", label: "71 - 75 years", color: "#F59E0B" },
          { key: "76_plus", label: "76+ years", color: "#EF4444" },
        ];

        const ageBuckets = {
          "60_65": 0,
          "66_70": 0,
          "71_75": 0,
          "76_plus": 0,
        };

        members.forEach((member) => {
          if (isMemberDeceased(member)) return;
          const age = inferAge(member);
          if (!age || age < 60) return;

          if (age <= 65) {
            ageBuckets["60_65"] += 1;
          } else if (age <= 70) {
            ageBuckets["66_70"] += 1;
          } else if (age <= 75) {
            ageBuckets["71_75"] += 1;
          } else {
            ageBuckets["76_plus"] += 1;
          }
        });

        const totalBucketCount = Object.values(ageBuckets).reduce(
          (sum, count) => sum + count,
          0
        );

        setAgeData(
          ageRanges.map((range) => {
            const rawPercentage =
              totalBucketCount > 0
                ? (ageBuckets[range.key] / totalBucketCount) * 100
                : 0;

            return {
              range: range.label,
              color: range.color,
              percentage: rawPercentage,
              displayPercentage: Math.round(rawPercentage),
            };
          })
        );

        // === Recent Activities ===
        const memberActivities = members
          .filter((member) => member.date_created && !isMemberDeceased(member))
          .map((member) => {
            const identifier =
              member.id ||
              member.firebaseKey ||
              member.oscaID ||
              member.authUid ||
              member.memberOscaId ||
              Math.random().toString(36).slice(2, 10);
            return {
              id: `member-${identifier}`,
              title: "New member registered",
              subtitle:
                `${member.firstName || ""} ${member.lastName || ""}`.trim() ||
                "Member",
              time: getRelativeTime(member.date_created),
              color: "bg-blue-500",
              timestamp: new Date(member.date_created).getTime(),
            };
          });

        const paymentActivities = payments
          .filter((payment) => payment.date_created)
          .map((payment) => {
            const identifier =
              payment.id ||
              payment.firebaseKey ||
              payment.receiptNo ||
              Math.random().toString(36).slice(2, 10);
            return {
              id: `payment-${identifier}`,
              title: "Payment received",
              subtitle: `${formatCurrency(payment.amount)} - ${
                payment.authorAgent || "Unknown"
              }`,
              time: getRelativeTime(payment.date_created),
              color: "bg-green-500",
              timestamp: new Date(payment.date_created).getTime(),
            };
          });

        const combinedActivities = [...memberActivities, ...paymentActivities]
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 5)
          .map(({ timestamp, ...rest }) => rest);

        setRecentActivities(combinedActivities);

        // === Membership Trends (Monthly registration) ===
        const monthData = {};
        members.forEach((member) => {
          if (isMemberDeceased(member)) return;
          const date = new Date(member.date_created || new Date());
          const monthKey = `${date.getFullYear()}-${String(
            date.getMonth() + 1
          ).padStart(2, "0")}`;
          monthData[monthKey] = (monthData[monthKey] || 0) + 1;
        });

        const trendsData = Object.keys(monthData)
          .sort()
          .slice(-12)
          .map((month) => ({
            month: new Date(month + "-01").toLocaleDateString("en-US", {
              month: "short",
              year: "numeric",
            }),
            count: monthData[month],
          }));

        setMembershipTrends(trendsData);

        // === Members by Purok ===
        // Dynamically collect all unique puroks from members
        const purokSet = new Set();
        const purokCounts = {};

        members.forEach((member) => {
          if (isMemberDeceased(member)) return;

          // Extract purok from address field (same logic as MemberProfileModal)
          let purok = member.purok?.trim();

          // If no direct purok field, extract from address
          if (!purok && member.address) {
            const parts = member.address.split(",").map((p) => p.trim());
            purok = parts[0]; // Extract Purok from position [0] in "Purok X, Pinagbuhatan, City..."
          }

          if (purok) {
            purokSet.add(purok);
            purokCounts[purok] = (purokCounts[purok] || 0) + 1;
          }
        });

        // Convert Set to sorted array
        const purokList = Array.from(purokSet).sort();

        // If no puroks found, use empty array
        if (purokList.length === 0) {
          setPurokData([]);
        } else {
          const purokChartData = purokList.map((purok) => ({
            name: purok.replace("Purok ", "").slice(0, 20),
            value: purokCounts[purok] || 0,
          }));

          setPurokData(purokChartData);
        }
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Sidebar */}
      <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} />
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header notificationCount={3} />
        <main className="flex-1 overflow-y-auto p-8">
          {loading || currentUserLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600 font-medium">
                  Loading dashboard data...
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* === Stats === */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                {stats.map((stat, idx) => (
                  <div
                    key={stat.label}
                    className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`p-3 rounded-lg ${
                          idx === 0
                            ? "bg-blue-100 text-blue-600"
                            : idx === 1
                            ? "bg-green-100 text-green-600"
                            : idx === 2
                            ? "bg-yellow-100 text-yellow-600"
                            : "bg-purple-100 text-purple-600"
                        }`}
                      >
                        <stat.icon className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">{stat.label}</p>
                        <h3 className="text-xl font-semibold text-gray-800">
                          {stat.value}
                        </h3>
                        {stat.subtitle && (
                          <p className="text-xs text-gray-400">
                            {stat.subtitle}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* === Quick Actions === */}
              <div className="mb-10">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">
                  Quick Actions
                </h2>
                {quickActions.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {quickActions.map((action) => (
                      <button
                        key={action.label}
                        onClick={action.action}
                        className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-gray-200 hover:shadow-md transition"
                      >
                        <div
                          className={`p-3 rounded-lg ${action.color} text-white`}
                        >
                          <action.icon className="w-6 h-6" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">
                          {action.label}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    No quick actions available for your role. Please contact an
                    administrator if you need additional access.
                  </p>
                )}
              </div>

              {/* === Charts Section === */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
                {/* Membership Trends */}
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">
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
                          strokeWidth={2}
                          dot={{ fill: "#8b5cf6", r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-gray-500 text-center py-12">
                      No data available
                    </p>
                  )}
                </div>

                {/* Members by Purok */}
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">
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
                        <Bar
                          dataKey="value"
                          fill="#8b5cf6"
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

              {/* === Age Demographics & Recent Activities === */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Age Demographics */}
                <div className="col-span-2 bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <TrendingUp className="w-5 h-5 text-gray-700" />
                    <h2 className="text-lg font-bold text-gray-800">
                      Age Demographics
                    </h2>
                  </div>

                  <div className="flex items-center gap-8">
                    <div className="relative w-64 h-64">
                      <svg
                        viewBox="0 0 100 100"
                        className="transform -rotate-90 w-full h-full"
                      >
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke="#E5E7EB"
                          strokeWidth="20"
                        />
                        {(() => {
                          const radius = 40;
                          const circumference = 2 * Math.PI * radius;
                          let cumulativePercentage = 0;

                          return ageData
                            .filter((segment) => segment.percentage > 0)
                            .map((segment, idx) => {
                              const dashLength =
                                (segment.percentage / 100) * circumference;
                              if (dashLength <= 0) {
                                return null;
                              }

                              cumulativePercentage += segment.percentage;
                              const normalizedCumulative = Math.min(
                                cumulativePercentage,
                                100
                              );
                              const strokeDashoffset =
                                circumference -
                                (normalizedCumulative / 100) * circumference;

                              return (
                                <circle
                                  key={`${segment.range}-${idx}`}
                                  cx="50"
                                  cy="50"
                                  r={radius}
                                  fill="none"
                                  stroke={segment.color}
                                  strokeWidth="20"
                                  strokeDasharray={`${dashLength} ${circumference}`}
                                  strokeDashoffset={strokeDashoffset}
                                  strokeLinecap="round"
                                />
                              );
                            })
                            .filter(Boolean);
                        })()}
                      </svg>
                    </div>

                    <div className="flex-1">
                      {ageData.map((item) => (
                        <div
                          key={item.range}
                          className="flex items-center gap-3 mb-3"
                        >
                          <div
                            className="w-12 h-3 rounded-full"
                            style={{ backgroundColor: item.color }}
                          ></div>
                          <span className="text-sm text-gray-700 font-medium">
                            {item.range}
                          </span>
                          <span className="text-xs text-gray-500">
                            {item.displayPercentage ??
                              Math.round(item.percentage)}
                            %
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Recent Activities */}
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-800 mb-4">
                    Recent Activities
                  </h2>

                  <div className="space-y-4">
                    {recentActivities.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No recent activity recorded yet.
                      </p>
                    ) : (
                      recentActivities.map((activity) => (
                        <div
                          key={activity.id}
                          className="flex items-start gap-3"
                        >
                          <div
                            className={`w-2 h-2 rounded-full ${activity.color} mt-2`}
                          ></div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-800">
                              {activity.title}
                            </p>
                            <p className="text-xs text-gray-500">
                              {activity.subtitle}
                            </p>
                          </div>
                          <span className="text-xs text-gray-400">
                            {activity.time}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
