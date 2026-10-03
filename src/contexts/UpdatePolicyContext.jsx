import { createContext, useContext } from "react";

const DEFAULT_POLICY = { status: "ok", currentVersion: null };
const UpdatePolicyContext = createContext(DEFAULT_POLICY);

export function UpdatePolicyProvider({ value, children }) {
  return (
    <UpdatePolicyContext.Provider value={value || DEFAULT_POLICY}>
      {children}
    </UpdatePolicyContext.Provider>
  );
}

export function useUpdatePolicy() {
  return useContext(UpdatePolicyContext);
}
