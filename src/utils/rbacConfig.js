// Role-Based Access Control Configuration
// Modular RBAC system with SSL encryption support

export const ROLES = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  OFFICER: "Officer",
  ENCODER: "Encoder",
  VIEWER: "Viewer",
};

export const PERMISSIONS = {
  // Dashboard
  VIEW_DASHBOARD: "view_dashboard",

  // Senior Citizen Management
  VIEW_MEMBERS: "view_members",
  CREATE_MEMBER: "create_member",
  EDIT_MEMBER: "edit_member",
  DELETE_MEMBER: "delete_member",
  ARCHIVE_MEMBER: "archive_member",

  // Payment Management
  VIEW_PAYMENTS: "view_payments",
  CREATE_PAYMENT: "create_payment",
  EDIT_PAYMENT: "edit_payment",
  DELETE_PAYMENT: "delete_payment",
  EXPORT_PAYMENT: "export_payment",

  // Service Availed
  VIEW_SERVICES: "view_services",
  APPROVE_SERVICE: "approve_service",
  REJECT_SERVICE: "reject_service",
  DELETE_SERVICE: "delete_service",

  // Dynamic Reporting
  VIEW_REPORTS: "view_reports",
  GENERATE_REPORT: "generate_report",
  EXPORT_REPORT: "export_report",
  DELETE_REPORT: "delete_report",
  MANAGE_TEMPLATES: "manage_templates",

  // Notifications
  VIEW_NOTIFICATIONS: "view_notifications",
  SEND_NOTIFICATIONS: "send_notifications",

  // Admin/RBAC
  MANAGE_USERS: "manage_users",
  MANAGE_ROLES: "manage_roles",
  VIEW_AUDIT_LOG: "view_audit_log",
  MANAGE_PERMISSIONS: "manage_permissions",

  // Document Manager
  VIEW_DOCUMENTS: "view_documents",
  MANAGE_DOCUMENTS: "manage_documents",
  DELETE_DOCUMENTS: "delete_documents",
};

// Role-Permission Matrix
export const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),

  [ROLES.ADMIN]: [
    // Dashboard
    PERMISSIONS.VIEW_DASHBOARD,

    // Members
    PERMISSIONS.VIEW_MEMBERS,
    PERMISSIONS.CREATE_MEMBER,
    PERMISSIONS.EDIT_MEMBER,
    PERMISSIONS.DELETE_MEMBER,
    PERMISSIONS.ARCHIVE_MEMBER,

    // Payments
    PERMISSIONS.VIEW_PAYMENTS,
    PERMISSIONS.CREATE_PAYMENT,
    PERMISSIONS.EDIT_PAYMENT,
    PERMISSIONS.DELETE_PAYMENT,
    PERMISSIONS.EXPORT_PAYMENT,

    // Services
    PERMISSIONS.VIEW_SERVICES,
    PERMISSIONS.APPROVE_SERVICE,
    PERMISSIONS.REJECT_SERVICE,
    PERMISSIONS.DELETE_SERVICE,

    // Reports
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.GENERATE_REPORT,
    PERMISSIONS.EXPORT_REPORT,
    PERMISSIONS.DELETE_REPORT,
    PERMISSIONS.MANAGE_TEMPLATES,

    // Notifications
    PERMISSIONS.VIEW_NOTIFICATIONS,
    PERMISSIONS.SEND_NOTIFICATIONS,

    // Documents
    PERMISSIONS.VIEW_DOCUMENTS,
    PERMISSIONS.MANAGE_DOCUMENTS,
    PERMISSIONS.DELETE_DOCUMENTS,

    // RBAC
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_AUDIT_LOG,
  ],

  [ROLES.OFFICER]: [
    // Dashboard
    PERMISSIONS.VIEW_DASHBOARD,

    // Members (read & limited edit)
    PERMISSIONS.VIEW_MEMBERS,
    PERMISSIONS.CREATE_MEMBER,
    PERMISSIONS.EDIT_MEMBER,
    PERMISSIONS.ARCHIVE_MEMBER,

    // Payments
    PERMISSIONS.VIEW_PAYMENTS,
    PERMISSIONS.CREATE_PAYMENT,
    PERMISSIONS.EDIT_PAYMENT,
    PERMISSIONS.EXPORT_PAYMENT,

    // Services
    PERMISSIONS.VIEW_SERVICES,
    PERMISSIONS.APPROVE_SERVICE,
    PERMISSIONS.REJECT_SERVICE,

    // Reports
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.GENERATE_REPORT,
    PERMISSIONS.EXPORT_REPORT,
    PERMISSIONS.MANAGE_TEMPLATES,

    // Notifications
    PERMISSIONS.VIEW_NOTIFICATIONS,
    PERMISSIONS.SEND_NOTIFICATIONS,

    // Documents
    PERMISSIONS.VIEW_DOCUMENTS,
    PERMISSIONS.MANAGE_DOCUMENTS,
  ],

  [ROLES.ENCODER]: [
    // Dashboard
    PERMISSIONS.VIEW_DASHBOARD,

    // Members (create & edit only)
    PERMISSIONS.VIEW_MEMBERS,
    PERMISSIONS.CREATE_MEMBER,
    PERMISSIONS.EDIT_MEMBER,

    // Payments (create & view)
    PERMISSIONS.VIEW_PAYMENTS,
    PERMISSIONS.CREATE_PAYMENT,
    PERMISSIONS.EDIT_PAYMENT,

    // Services (view only)
    PERMISSIONS.VIEW_SERVICES,

    // Reports (view only)
    PERMISSIONS.VIEW_REPORTS,

    // Notifications
    PERMISSIONS.VIEW_NOTIFICATIONS,

    // Documents
    PERMISSIONS.VIEW_DOCUMENTS,
    PERMISSIONS.MANAGE_DOCUMENTS,
  ],

  [ROLES.VIEWER]: [
    // Dashboard
    PERMISSIONS.VIEW_DASHBOARD,

    // Members (read only)
    PERMISSIONS.VIEW_MEMBERS,

    // Payments (read only)
    PERMISSIONS.VIEW_PAYMENTS,

    // Services (read only)
    PERMISSIONS.VIEW_SERVICES,

    // Reports (read only)
    PERMISSIONS.VIEW_REPORTS,

    // Notifications
    PERMISSIONS.VIEW_NOTIFICATIONS,

    // Documents
    PERMISSIONS.VIEW_DOCUMENTS,
  ],
};

// Module-based access control
export const MODULE_PERMISSIONS = {
  Dashboard: [PERMISSIONS.VIEW_DASHBOARD],
  "Senior Citizens": [
    PERMISSIONS.VIEW_MEMBERS,
    PERMISSIONS.CREATE_MEMBER,
    PERMISSIONS.EDIT_MEMBER,
    PERMISSIONS.DELETE_MEMBER,
    PERMISSIONS.ARCHIVE_MEMBER,
  ],
  Payments: [
    PERMISSIONS.VIEW_PAYMENTS,
    PERMISSIONS.CREATE_PAYMENT,
    PERMISSIONS.EDIT_PAYMENT,
    PERMISSIONS.DELETE_PAYMENT,
    PERMISSIONS.EXPORT_PAYMENT,
  ],
  Services: [
    PERMISSIONS.VIEW_SERVICES,
    PERMISSIONS.APPROVE_SERVICE,
    PERMISSIONS.REJECT_SERVICE,
    PERMISSIONS.DELETE_SERVICE,
  ],
  Reports: [
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.GENERATE_REPORT,
    PERMISSIONS.EXPORT_REPORT,
    PERMISSIONS.DELETE_REPORT,
    PERMISSIONS.MANAGE_TEMPLATES,
  ],
  Notifications: [
    PERMISSIONS.VIEW_NOTIFICATIONS,
    PERMISSIONS.SEND_NOTIFICATIONS,
  ],
  Documents: [
    PERMISSIONS.VIEW_DOCUMENTS,
    PERMISSIONS.MANAGE_DOCUMENTS,
    PERMISSIONS.DELETE_DOCUMENTS,
  ],
};

// SSL/HTTPS Configuration
export const SSL_CONFIG = {
  enabled: true,
  protocol: "https",
  baseUrl: "https://www.example.com",
  certificate: "enterprise-ssl-certificate",
  tlsVersion: "1.3",
  cipherSuites: [
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256",
    "TLS_AES_128_GCM_SHA256",
  ],
  hsts: {
    enabled: true,
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
};
