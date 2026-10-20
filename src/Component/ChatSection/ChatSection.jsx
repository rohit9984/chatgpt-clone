import { useContext, useEffect, useRef } from "react";
import "./ChatSection.css";
import Darkmode from "../Darkmode/Darkmode.jsx";
import Message from "./Message.jsx";
import { LuSendHorizontal } from "react-icons/lu";
import { dataContext } from "../../context/UserContext.jsx";

function ChatSection() {
  const { messages, loading, sent, draft, newChatSignal, setDraft } =
    useContext(dataContext);
  const inputRef = useRef(null);
  const bottomRef = useRef(null);

  // Focus the box whenever "New Chat" is pressed.
  useEffect(() => {
    if (newChatSignal > 0) inputRef.current?.focus();
  }, [newChatSignal]);

  // Grow the composer with the text, up to a max height (CSS caps it).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  // Always keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, loading]);

  function handleSend() {
    if (!draft.trim() || loading) return;
    sent(draft);
    setDraft("");
  }

  function handleKeyDown(event) {
    // Enter sends, Shift+Enter makes a new line (like ChatGPT).
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="chat-section">
      <div className="topSection">
        {messages.length === 0 ? (
          <h1 className="headings">
            <span>HELLO ROHIT</span>
            <span>I'm Your Own Assistant</span>
            <span>What can I help you...?</span>
          </h1>
        ) : (
          <div className="messages">
            {messages.map((message, index) => (
              <Message
                key={index}
                role={message.role}
                text={message.text}
              />
            ))}

            {loading ? (
              <div className="message-row model">
                <div className="message model">Thinking...</div>
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="bottomSection">
        <textarea
          ref={inputRef}
          className="composer"
          rows={1}
          placeholder="Enter a prompt"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          id="sendbtn"
          onClick={handleSend}
          disabled={loading || !draft.trim()}
          aria-label="Send message"
        >
          <LuSendHorizontal />
        </button>
        <Darkmode />
      </div>
    </div>
  );
}

export default ChatSection;
