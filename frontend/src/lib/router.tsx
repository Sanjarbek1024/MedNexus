import { useMemo, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

const CHANGE = "mednexus:navigate";

export function navigate(to: string, { replace = false } = {}): void {
  if (to === window.location.pathname + window.location.search) return;
  window.history[replace ? "replaceState" : "pushState"](null, "", to);
  window.dispatchEvent(new Event(CHANGE));
  window.scrollTo({ top: 0 });
}

export interface Location {
  path: string;
  query: URLSearchParams;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  window.addEventListener(CHANGE, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(CHANGE, callback);
  };
}

const currentHref = () => window.location.pathname + window.location.search;

// An external store, so a navigation fired by a child's effect before this hook subscribes is not missed.
export function useLocation(): Location {
  const href = useSyncExternalStore(subscribe, currentHref);
  return useMemo(() => {
    const url = new URL(href, window.location.origin);
    return { path: url.pathname, query: url.searchParams };
  }, [href]);
}

export function Link({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...props} />;
}
