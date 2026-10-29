"use client";

/**
 * Navigates when the service worker hands over a tapped notification's path.
 *
 * The decision of whether a message may become a navigation is not here: it is
 * `parseNavigateMessage`, a pure function with its own tests. This component
 * only coordinates — subscribe on mount, route on a parsed message, unsubscribe
 * on unmount — which is where the engineering standard puts a component.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { parseNavigateMessage } from "./navigate-message";

export function NavigateOnNotificationTap() {
  const router = useRouter();

  useEffect(() => {
    // A browser without a service worker container never receives the message,
    // and asking for one that is not there is how a mount throws.
    if (!("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;

    const onMessage = (event: Event) => {
      const destination = parseNavigateMessage((event as MessageEvent).data);
      if (destination === null) return;
      router.push(destination);
    };

    container.addEventListener("message", onMessage);
    return () => container.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}
