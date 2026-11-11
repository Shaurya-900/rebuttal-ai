"use client";
// A submit button that says what is happening while the server works, so nobody clicks twice wondering.
import { useFormStatus } from "react-dom";

export function PendingButton({ children, pending, className = "btn-primary" }: { children: React.ReactNode; pending: string; className?: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button className={className} disabled={busy} aria-live="polite">
      {busy ? pending : children}
    </button>
  );
}
