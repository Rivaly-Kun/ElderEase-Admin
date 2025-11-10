const SESSION_USER_KEY = "eldereaseCurrentUser";
const SESSION_USER_CHANGED_EVENT = "elderease-session-user-changed";

const parseStoredUser = (rawValue) => {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    console.error("Failed to parse stored session user", error);
    return null;
  }
};

export const getStoredSessionUser = () => {
  const sessionValue =
    typeof window !== "undefined"
      ? sessionStorage.getItem(SESSION_USER_KEY)
      : null;

  const localValue =
    typeof window !== "undefined"
      ? localStorage.getItem(SESSION_USER_KEY)
      : null;

  const parsed = parseStoredUser(sessionValue || localValue);
  console.log("[SESSION] getStoredSessionUser retrieved:", {
    source: sessionValue
      ? "sessionStorage"
      : localValue
      ? "localStorage"
      : "none",
    user: parsed
      ? {
          email: parsed.email,
          role: parsed.role,
          displayName: parsed.displayName,
        }
      : null,
  });
  return parsed;
};

export const storeSessionUser = (user, remember = false) => {
  if (typeof window === "undefined" || !user) {
    console.log("[SESSION] Cannot store: window undefined or no user provided");
    return;
  }

  try {
    const payload = JSON.stringify(user);
    console.log("[SESSION] Storing session user:", {
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      remember: remember,
    });

    sessionStorage.setItem(SESSION_USER_KEY, payload);
    console.log("[SESSION] ✅ Stored in sessionStorage");

    if (remember) {
      localStorage.setItem(SESSION_USER_KEY, payload);
      console.log(
        "[SESSION] ✅ Also stored in localStorage (remember me enabled)"
      );
    } else {
      localStorage.removeItem(SESSION_USER_KEY);
      console.log("[SESSION] Cleared from localStorage (remember me disabled)");
    }

    window.dispatchEvent(new Event(SESSION_USER_CHANGED_EVENT));
    console.log("[SESSION] ✅ Dispatched SESSION_USER_CHANGED_EVENT");
  } catch (error) {
    console.error("[SESSION] ❌ Failed to store session user:", error);
  }
};

export const clearStoredSessionUser = () => {
  if (typeof window === "undefined") {
    console.log("[SESSION] Cannot clear: window undefined");
    return;
  }

  console.log("[SESSION] Clearing stored session user...");
  sessionStorage.removeItem(SESSION_USER_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
  console.log("[SESSION] ✅ Cleared from both storages");
  window.dispatchEvent(new Event(SESSION_USER_CHANGED_EVENT));
  console.log("[SESSION] ✅ Dispatched SESSION_USER_CHANGED_EVENT");
};

export { SESSION_USER_KEY, SESSION_USER_CHANGED_EVENT };
