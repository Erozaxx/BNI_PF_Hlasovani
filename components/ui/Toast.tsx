"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";

type ToastType = "success" | "error";

interface ToastMessage {
  id: number;
  type: ToastType;
  text: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, text: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((type: ToastType, text: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, text }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    const enterTimer = requestAnimationFrame(() => setVisible(true));

    // Auto-dismiss after 4s
    const dismissTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 4000);

    return () => {
      cancelAnimationFrame(enterTimer);
      clearTimeout(dismissTimer);
    };
  }, [onDismiss]);

  const isSuccess = toast.type === "success";

  return (
    <div
      role="status"
      className={`
        pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-card shadow-lg
        text-sm font-medium max-w-sm
        transition-all duration-300 ease-in-out
        ${visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"}
        ${isSuccess ? "bg-success text-white" : "bg-danger text-white"}
      `.trim()}
    >
      <span className="flex-shrink-0" aria-hidden="true">
        {isSuccess ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </span>
      <span className="flex-1">{toast.text}</span>
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(onDismiss, 300);
        }}
        className="flex-shrink-0 p-1 rounded hover:bg-white/20 transition-colors focus:outline-none focus:shadow-focus"
        aria-label="Zavrit notifikaci"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
