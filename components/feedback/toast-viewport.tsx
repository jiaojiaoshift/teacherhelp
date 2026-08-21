"use client";

import { useToastStore } from "@/lib/stores/toast-store";

const toneClassMap = {
  success: "border-emerald-500/45 bg-[#10251f] text-[#8be2bd]",
  error: "border-rose-500/50 bg-[#2a151a] text-[#ff9baa]",
  info: "border-sky-500/45 bg-[#122333] text-[#9acbff]"
} as const;

const toneIndicatorClassMap = {
  success: "bg-emerald-400",
  error: "bg-rose-400",
  info: "bg-sky-400"
} as const;

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);

  if (!toasts.length) {
    return null;
  }

  const toast = toasts[0];

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 w-[min(380px,calc(100vw-2rem))]">
      <div
        className={[
          "pointer-events-auto relative overflow-hidden rounded-lg border px-4 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.42)] backdrop-blur-md",
          toneClassMap[toast.tone]
        ].join(" ")}
        role="status"
      >
        <div className={`absolute inset-y-0 left-0 w-1 ${toneIndicatorClassMap[toast.tone]}`} />
        <div className="flex min-h-8 items-start justify-between gap-3 pl-1">
          <div className="min-w-0 flex-1 break-words pt-1 text-sm font-medium leading-5">
            {toast.title}
          </div>
          <button
            aria-label={`dismiss-${toast.id}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-current/20 bg-black/10 text-lg leading-none transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-current/30"
            onClick={() => dismissToast(toast.id)}
            title="关闭通知"
            type="button"
          >
            ×
          </button>
        </div>
        {toast.actionLabel && toast.onAction ? (
          <div className="mt-3 pl-1">
            <button
              className="rounded-md border border-current/25 bg-black/10 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-current/30"
              onClick={() => {
                toast.onAction?.();
                dismissToast(toast.id);
              }}
              type="button"
            >
              {toast.actionLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

