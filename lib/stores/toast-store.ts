import { create } from "zustand";

export type ToastTone = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  title: string;
  tone: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastStoreState {
  toasts: ToastItem[];
  pushToast: (toast: Omit<ToastItem, "id">) => string;
  dismissToast: (toastId: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastStoreState>((set) => ({
  toasts: [],
  pushToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    set((state) => ({
      toasts: state.toasts.concat({
        id,
        ...toast
      })
    }));

    return id;
  },
  dismissToast: (toastId) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== toastId)
    })),
  clearToasts: () =>
    set({
      toasts: []
    })
}));
