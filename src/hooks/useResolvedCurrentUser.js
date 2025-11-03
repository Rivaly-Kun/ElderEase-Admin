import { useEffect, useState } from "react";
import { ref, get } from "firebase/database";
import { db } from "../services/firebase";
import { useAuth } from "../Context/AuthContext";

const buildActorLabel = (user) => {
  if (!user) {
    return "Unknown";
  }

  const role = user.role || user.roleName;
  const baseLabel =
    user.displayName ||
    user.name ||
    user.username ||
    user.email ||
    role ||
    "Unknown";

  if (!role || baseLabel.toLowerCase().includes(role.toLowerCase())) {
    return baseLabel;
  }

  return `${baseLabel} (${role})`;
};

export const useResolvedCurrentUser = () => {
  const { user: authUser } = useAuth();
  const [resolvedUser, setResolvedUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const hydrateUser = async () => {
      setLoading(true);

      if (!authUser) {
        if (isMounted) {
          setResolvedUser(null);
          setLoading(false);
        }
        return;
      }

      const identifier = authUser.id || authUser.uid || authUser.userId;

      const baseUser = {
        ...authUser,
        id: identifier || authUser.uid || "super-admin",
        uid: authUser.uid || identifier,
        role: authUser.role || authUser.roleName,
        roleName: authUser.role || authUser.roleName,
        actorLabel: buildActorLabel(authUser),
      };

      // Super admin does not exist inside the users collection
      if (!identifier || identifier === "super-admin") {
        if (isMounted) {
          setResolvedUser({
            ...baseUser,
            displayName: authUser.displayName || "Super Admin",
            role: authUser.role || "Super Admin",
            roleName: authUser.role || "Super Admin",
            actorLabel: buildActorLabel({
              displayName: authUser.displayName || "Super Admin",
              email: authUser.email,
              role: authUser.role || "Super Admin",
            }),
          });
          setLoading(false);
        }
        return;
      }

      try {
        const userRef = ref(db, `users/${identifier}`);
        const snapshot = await get(userRef);

        if (!isMounted) {
          return;
        }

        if (snapshot.exists()) {
          const data = snapshot.val();
          const mergedUser = {
            ...baseUser,
            ...data,
            id: identifier,
            uid: data?.uid || baseUser.uid,
            displayName: data.displayName || baseUser.displayName,
            email: data.email || baseUser.email,
            role: data.role || baseUser.role,
            roleName: data.role || data.roleName || baseUser.roleName,
            actorLabel: buildActorLabel({
              displayName: data.displayName || baseUser.displayName,
              email: data.email || baseUser.email,
              username: data.username || baseUser.username,
              role: data.role || data.roleName || baseUser.roleName,
            }),
          };
          setResolvedUser(mergedUser);
        } else {
          setResolvedUser(baseUser);
        }
      } catch (error) {
        console.error("Failed to hydrate current user", error);
        if (isMounted) {
          setResolvedUser(baseUser);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    hydrateUser();

    return () => {
      isMounted = false;
    };
  }, [authUser]);

  return {
    currentUser: resolvedUser,
    actorLabel: resolvedUser?.actorLabel || "Unknown",
    loading,
  };
};

export default useResolvedCurrentUser;
