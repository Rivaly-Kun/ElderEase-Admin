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

  return parseStoredUser(sessionValue || localValue);
};

export const storeSessionUser = (user, remember = false) => {
  if (typeof window === "undefined" || !user) {
    return;
  }

  try {
    const payload = JSON.stringify(user);
    sessionStorage.setItem(SESSION_USER_KEY, payload);

    if (remember) {
      localStorage.setItem(SESSION_USER_KEY, payload);
    } else {
      localStorage.removeItem(SESSION_USER_KEY);
    }

    window.dispatchEvent(new Event(SESSION_USER_CHANGED_EVENT));
  } catch (error) {
    console.error("Failed to store session user", error);
  }
};

export const clearStoredSessionUser = () => {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.removeItem(SESSION_USER_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
  window.dispatchEvent(new Event(SESSION_USER_CHANGED_EVENT));
};

export { SESSION_USER_KEY, SESSION_USER_CHANGED_EVENT };
