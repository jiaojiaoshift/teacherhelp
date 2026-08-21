import { create } from "zustand";

type ReviewMode = "document_flow" | "page";

interface UiState {
  reviewMode: ReviewMode;
  setReviewMode: (mode: ReviewMode) => void;
}

export const useUiStore = create<UiState>((set) => ({
  reviewMode: "document_flow",
  setReviewMode: (reviewMode) => set({ reviewMode })
}));
