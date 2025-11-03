// Audit Logging Service
// Tracks all admin actions with encryption

import { db } from "../services/firebase";
import { ref, push, set } from "firebase/database";

/**
 * Log audit events to Firebase
 * Tracks: who performed action, what action, what changed, when, where
 */
export class AuditLogger {
  constructor(userId, userName, userRole) {
    this.userId = userId;
    this.userName = userName;
    this.userRole = userRole;
  }

  /**
   * Create audit log entry
   */
  async logAction(action, module, details = {}) {
    try {
      const timestamp = new Date().toISOString();

      const auditEntry = {
        userId: this.userId,
        userName: this.userName,
        userRole: this.userRole,
        action, // e.g., "CREATE", "UPDATE", "DELETE", "APPROVE", "REJECT"
        module, // e.g., "Senior Citizens", "Payments", "Reports"
        timestamp,
        details: {
          ...details,
          ip: await this.getUserIP(),
          userAgent: navigator.userAgent,
        },
        // For encryption tracking
        encrypted: true,
        encryptionMethod: "SSL/TLS",
      };

      // Push to Firebase audit logs (global collection)
      const auditLogsRef = ref(db, "auditLogs");
      const newAuditRef = push(auditLogsRef);
      const logId = newAuditRef.key;
      const entryWithId = {
        ...auditEntry,
        logId,
        actorPath: this.userId ? `audits/${this.userId}/${logId}` : null,
      };
      await set(newAuditRef, entryWithId);

      // Also index this entry under the acting user's audit trail
      if (this.userId) {
        const userAuditRef = ref(db, `audits/${this.userId}/${logId}`);
        try {
          await set(userAuditRef, entryWithId);
        } catch (indexError) {
          console.error("Audit indexing error:", indexError);
        }
      }

      // Also log to console in development
      if (import.meta.env.DEV) {
        console.log("[AUDIT LOG]", entryWithId);
      }

      return true;
    } catch (error) {
      console.error("Audit logging error:", error);
      return false;
    }
  }

  /**
   * Log member creation
   */
  async logMemberCreated(memberId, memberName, memberData) {
    return this.logAction("CREATE", "Senior Citizens", {
      recordId: memberId,
      recordName: memberName,
      dataSnapshot: {
        name: memberData.name,
        age: memberData.age,
        barangay: memberData.barangay,
        status: memberData.status,
      },
    });
  }

  /**
   * Log member update
   */
  async logMemberUpdated(memberId, memberName, oldData, newData) {
    const changes = this.getChangedFields(oldData, newData);
    return this.logAction("UPDATE", "Senior Citizens", {
      recordId: memberId,
      recordName: memberName,
      changes,
      oldValues: this.sanitizeData(oldData),
      newValues: this.sanitizeData(newData),
    });
  }

  /**
   * Log member deletion
   */
  async logMemberDeleted(memberId, memberName, memberData) {
    return this.logAction("DELETE", "Senior Citizens", {
      recordId: memberId,
      recordName: memberName,
      deletedData: this.sanitizeData(memberData),
    });
  }

  /**
   * Log member archival
   */
  async logMemberArchived(memberId, memberName, reason) {
    return this.logAction("ARCHIVE", "Senior Citizens", {
      recordId: memberId,
      recordName: memberName,
      reason,
    });
  }

  /**
   * Log payment creation
   */
  async logPaymentCreated(paymentId, memberName, amount, paymentType) {
    return this.logAction("CREATE", "Payments", {
      recordId: paymentId,
      memberName,
      amount,
      paymentType,
    });
  }

  /**
   * Log payment update
   */
  async logPaymentUpdated(paymentId, memberName, oldAmount, newAmount) {
    return this.logAction("UPDATE", "Payments", {
      recordId: paymentId,
      memberName,
      oldAmount,
      newAmount,
      difference: newAmount - oldAmount,
    });
  }

  /**
   * Log payment deletion
   */
  async logPaymentDeleted(paymentId, memberName, amount) {
    return this.logAction("DELETE", "Payments", {
      recordId: paymentId,
      memberName,
      amount,
    });
  }

  /**
   * Log service approval
   */
  async logServiceApproved(serviceId, memberName, serviceType) {
    return this.logAction("APPROVE", "Services", {
      recordId: serviceId,
      memberName,
      serviceType,
    });
  }

  /**
   * Log service rejection
   */
  async logServiceRejected(serviceId, memberName, serviceType, reason) {
    return this.logAction("REJECT", "Services", {
      recordId: serviceId,
      memberName,
      serviceType,
      reason,
    });
  }

  /**
   * Log report generation
   */
  async logReportGenerated(reportId, reportType, filters) {
    return this.logAction("GENERATE", "Reports", {
      recordId: reportId,
      reportType,
      filters: this.sanitizeData(filters),
    });
  }

  /**
   * Log report export
   */
  async logReportExported(reportId, reportType, exportFormat) {
    return this.logAction("EXPORT", "Reports", {
      recordId: reportId,
      reportType,
      exportFormat, // PDF, Excel, CSV
    });
  }

  /**
   * Log template creation
   */
  async logTemplateCreated(templateId, templateName) {
    return this.logAction("CREATE", "Reports", {
      recordId: templateId,
      recordName: templateName,
      category: "Template",
    });
  }

  /**
   * Log template update
   */
  async logTemplateUpdated(templateId, templateName, changes) {
    return this.logAction("UPDATE", "Reports", {
      recordId: templateId,
      recordName: templateName,
      category: "Template",
      changes,
    });
  }

  /**
   * Log role assignment
   */
  async logRoleAssigned(targetUserId, targetUserName, role) {
    return this.logAction("ASSIGN_ROLE", "Access Control", {
      targetUserId,
      targetUserName,
      role,
    });
  }

  /**
   * Log permission grant
   */
  async logPermissionGranted(targetUserId, role, permission) {
    return this.logAction("GRANT_PERMISSION", "Access Control", {
      targetUserId,
      role,
      permission,
    });
  }

  /**
   * Log permission revoke
   */
  async logPermissionRevoked(targetUserId, role, permission) {
    return this.logAction("REVOKE_PERMISSION", "Access Control", {
      targetUserId,
      role,
      permission,
    });
  }

  /**
   * Log failed access attempt
   */
  async logFailedAccessAttempt(attemptedModule, reason) {
    return this.logAction("FAILED_ACCESS", "Security", {
      module: attemptedModule,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log bulk operation
   */
  async logBulkOperation(operationType, module, recordCount, details) {
    return this.logAction(`BULK_${operationType}`, module, {
      recordCount,
      ...details,
    });
  }

  /**
   * Helper: Get changed fields between two objects
   */
  getChangedFields(oldData, newData) {
    const changes = {};
    Object.keys(newData).forEach((key) => {
      if (oldData[key] !== newData[key]) {
        changes[key] = { old: oldData[key], new: newData[key] };
      }
    });
    return changes;
  }

  /**
   * Helper: Sanitize sensitive data before logging
   */
  sanitizeData(data) {
    if (!data) return null;
    const sanitized = { ...data };

    // Remove or mask sensitive fields
    const sensitiveFields = [
      "password",
      "pin",
      "ssn",
      "phoneNumber",
      "email",
      "address",
    ];

    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = "[REDACTED]";
      }
    });

    return sanitized;
  }

  /**
   * Helper: Get user's IP address
   */
  async getUserIP() {
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.error("IP fetch error:", error);
      return "Unknown";
    }
  }
}

/**
 * Create audit logger instance for current user
 */
export const createAuditLogger = (userId, userName, userRole) => {
  return new AuditLogger(userId, userName, userRole);
};

export default AuditLogger;
