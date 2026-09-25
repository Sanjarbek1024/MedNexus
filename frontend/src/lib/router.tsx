import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

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

export function useLocation(): Location {
  const read = () => ({ path: window.location.pathname, query: new URLSearchParams(window.location.search) });
  const [location, setLocation] = useState<Location>(read);
  useEffect(() => {
    const update = () => setLocation(read());
    window.addEventListener("popstate", update);
    window.addEventListener(CHANGE, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(CHANGE, update);
    };
  }, []);
  return location;
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
