// Utilities to normalize and evaluate member status flags consistently across modules.
// Ensures legacy data (e.g., "true" strings or numeric flags) behave the same as booleans.

const TRUTHY_VALUES = new Set([true, "true", 1, "1", "yes", "y", "active"]);
const FALSY_VALUES = new Set([
  false,
  "false",
  0,
  "0",
  "no",
  "n",
  "inactive",
  null,
  undefined,
  "",
]);

export const normalizeBoolean = (value) => {
  if (TRUTHY_VALUES.has(value)) return true;
  if (FALSY_VALUES.has(value)) return false;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (TRUTHY_VALUES.has(trimmed)) return true;
    if (FALSY_VALUES.has(trimmed)) return false;
  }
  return Boolean(value);
};

export const enhanceMemberStatus = (member = {}) => {
  const archived = normalizeBoolean(member.archived);
  const deceased = normalizeBoolean(member.deceased);
  return {
    ...member,
    archived,
    deceased,
    status: deceased ? "deceased" : archived ? "archived" : "active",
  };
};

export const isMemberDeceased = (member) => normalizeBoolean(member?.deceased);

export const isMemberArchived = (member) =>
  !isMemberDeceased(member) && normalizeBoolean(member?.archived);

export const isMemberActive = (member) =>
  !isMemberDeceased(member) && !normalizeBoolean(member?.archived);

export const ensureMemberCollection = (collection = []) =>
  Array.isArray(collection) ? collection.map(enhanceMemberStatus) : [];

export default {
  normalizeBoolean,
  enhanceMemberStatus,
  isMemberDeceased,
  isMemberArchived,
  isMemberActive,
  ensureMemberCollection,
};
