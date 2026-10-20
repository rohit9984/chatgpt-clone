import { useState } from "react";
import { FiCheck, FiCopy } from "react-icons/fi";
import "./Message.css";

function Message({ role, text }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Could not copy message:", error);
    }
  }

  return (
    <div className={`message-row ${role}`}>
      <div className={`message ${role}`}>{text}</div>

      {role === "model" ? (
        <button
          type="button"
          className="message-copy"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy message"}
          title={copied ? "Copied" : "Copy message"}
        >
          {copied ? <FiCheck /> : <FiCopy />}
        </button>
      ) : null}
    </div>
  );
}

export default Message;
