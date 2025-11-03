/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState } from "react";

const MemberSearchContext = createContext();

export const MemberSearchProvider = ({ children }) => {
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);

  const openMemberProfile = (member) => {
    setSelectedMember(member);
    setShowProfileModal(true);
  };

  const closeMemberProfile = () => {
    setShowProfileModal(false);
    setSelectedMember(null);
  };

  return (
    <MemberSearchContext.Provider
      value={{
        showProfileModal,
        setShowProfileModal,
        selectedMember,
        setSelectedMember,
        openMemberProfile,
        closeMemberProfile,
      }}
    >
      {children}
    </MemberSearchContext.Provider>
  );
};

export const useMemberSearch = () => {
  const context = useContext(MemberSearchContext);
  if (!context) {
    throw new Error("useMemberSearch must be used within MemberSearchProvider");
  }
  return context;
};
