import { useEffect, useState } from "react";
import { FiX } from "react-icons/fi";
import "./Auth.css";

function LoginModal({ onClose, onLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  // Close with the Escape key.
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleSubmit(event) {
    event.preventDefault();

    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    onLogin(name.trim(), email.trim());
    onClose();
  }

  return (
    <div className="login-overlay" onClick={onClose}>
      <div
        className="login-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Log in"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="login-close" onClick={onClose} aria-label="Close">
          <FiX />
        </button>

        <h2>Log in</h2>
        <p className="login-subtitle">
          Sign in to keep your chats together in one place.
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="login-name">Name</label>
          <input
            id="login-name"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />

          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          {error ? <p className="login-error">{error}</p> : null}

          <button type="submit" className="login-submit">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginModal;
