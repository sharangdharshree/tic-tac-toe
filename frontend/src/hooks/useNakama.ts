import { useContext } from "react";
import { NakamaContext } from "../context/NakamaContext";

export function useNakama() {
  const context = useContext(NakamaContext);
  if (!context) {
    throw new Error("useNakama must be used within NakamaProvider");
  }
  return context;
}
