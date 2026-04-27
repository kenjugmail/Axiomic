import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

export function useKeyboardShortcuts(onOpenSearch: () => void) {
  const navigate = useNavigate();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger in inputs/textareas
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
      return;
    }

    // / to open search
    if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onOpenSearch();
      return;
    }

    // ? for help
    if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
      // Could show shortcuts help
      return;
    }

    // g then h for home
    if (e.key === "g") {
      const handler = (e2: KeyboardEvent) => {
        document.removeEventListener("keydown", handler);
        if (e2.key === "h") { e2.preventDefault(); navigate("/"); }
        if (e2.key === "w") { e2.preventDefault(); navigate("/wiki"); }
        if (e2.key === "p") { e2.preventDefault(); navigate("/paths"); }
      };
      document.addEventListener("keydown", handler);
      setTimeout(() => document.removeEventListener("keydown", handler), 1000);
    }
  }, [navigate, onOpenSearch]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
