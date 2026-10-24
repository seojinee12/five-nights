import { useEffect, useState } from "react";

/** A message that clears itself after `ms`. Setting a new message restarts the timer; unmounting cancels it. */
export function useTransientMessage(ms = 6000) {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), ms);
    return () => clearTimeout(timer);
  }, [message, ms]);
  return [message, setMessage] as const;
}
