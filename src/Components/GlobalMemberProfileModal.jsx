import React from "react";
import MemberProfileModal from "./MemberProfileModal";
import { useMemberSearch } from "../Context/MemberSearchContext";
import { ref as dbRef, onValue } from "firebase/database";
import { db } from "../services/firebase";
import { useState, useEffect } from "react";

const GlobalMemberProfileModal = () => {
  const memberSearch = useMemberSearch();
  const [paymentsData, setPaymentsData] = useState([]);

  // Fetch payments data for the modal
  useEffect(() => {
    const paymentsRef = dbRef(db, "payments");

    const unsubscribe = onValue(
      paymentsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const paymentsArray = Object.entries(data).map(([key, value]) => ({
            firebaseKey: key,
            id: key,
            ...value,
          }));
          setPaymentsData(paymentsArray);
        } else {
          setPaymentsData([]);
        }
      },
      (error) => {
        console.error("Error fetching payments:", error);
        setPaymentsData([]);
      }
    );

    return () => unsubscribe();
  }, []);

  // Helper functions
  const isDeceased = (oscaID) => {
    // You can customize this logic based on your needs
    return false;
  };

  const extractBarangay = (address) => {
    if (!address) return "-";
    const parts = address.split(",");
    const barangayPart = parts.find(
      (part) =>
        part.toLowerCase().includes("brgy") ||
        part.toLowerCase().includes("barangay")
    );
    return barangayPart ? barangayPart.trim() : "-";
  };

  const getImagePath = (url) => url || "/img/default-avatar.png";

  if (!memberSearch.showProfileModal || !memberSearch.selectedMember) {
    return null;
  }

  return (
    <MemberProfileModal
      showProfileModal={memberSearch.showProfileModal}
      setShowProfileModal={memberSearch.setShowProfileModal}
      selectedMember={memberSearch.selectedMember}
      paymentsData={paymentsData}
      getImagePath={getImagePath}
      isDeceased={isDeceased}
      extractBarangay={extractBarangay}
    />
  );
};

export default GlobalMemberProfileModal;
