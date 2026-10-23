import { useCallback, useRef, useState } from "react";
import type { Toast } from "../types";

const TOAST_DURATION_MS = 5000;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (text: string, kind: Toast["kind"] = "info") => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, kind, text }]);
      window.setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss],
  );

  return { toasts, notify, dismiss };
}
