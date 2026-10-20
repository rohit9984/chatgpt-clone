import { useEffect, useState } from "react";
import "./Darkmode.css";

function SunLogo() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.2v2.1M12 19.7v2.1M4.1 4.1l1.5 1.5M18.4 18.4l1.5 1.5M2.2 12h2.1M19.7 12h2.1M4.1 19.9l1.5-1.5M18.4 5.6l1.5-1.5" />
    </svg>
  );
}

function MoonLogo() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.6 13.4A8.6 8.6 0 1 1 10.6 3.4a6.6 6.6 0 0 0 10 10z" />
      <path d="M17.2 4.3l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5z" />
    </svg>
  );
}

function Darkmode() {
  const [mode, setMode] = useState("dark-mode");

  function toggle() {
    setMode((prev) => (prev === "dark-mode" ? "light-mode" : "dark-mode"));
  }

  useEffect(() => {
    document.body.className = mode;
  }, [mode]);

  const isDark = mode === "dark-mode";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={isDark}
    >
      <span className="theme-toggle-icon">
        {isDark ? <SunLogo /> : <MoonLogo />}
      </span>
    </button>
  );
}

export default Darkmode;
