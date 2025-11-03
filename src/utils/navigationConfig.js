import {
  Home,
  Users,
  CreditCard,
  Bell,
  Heart,
  TrendingUp,
  Lock,
  FileText,
} from "lucide-react";

export const NAVIGATION_MODULES = [
  {
    id: "dashboard",
    label: "Dashboard",
    path: "/dashboard",
    icon: Home,
  },
  {
    id: "senior_citizens",
    label: "Senior Citizen Management",
    path: "/citizens",
    icon: Users,
  },
  {
    id: "payments",
    label: "Payment Management",
    path: "/payments",
    icon: CreditCard,
  },
  {
    id: "notifications",
    label: "Notification Management",
    path: "/notifications",
    icon: Bell,
  },
  {
    id: "services",
    label: "Benefit Tracking",
    path: "/services",
    icon: Heart,
  },
  {
    id: "reports",
    label: "Dynamic Reporting",
    path: "/reports",
    icon: TrendingUp,
  },

  {
    id: "documents",
    label: "Document Manager",
    path: "/documents",
    icon: FileText,
  },
  {
    id: "access_control",
    label: "Role Based Access Control",
    path: "/roles",
    icon: Lock,
  },
];

export const MODULE_ID_BY_PATH = NAVIGATION_MODULES.reduce((acc, module) => {
  acc[module.path] = module.id;
  return acc;
}, {});
