import { createContext, useEffect, useState } from "react";
import run from "../api";

export const dataContext = createContext();

const STORAGE_KEY = "chat-history";
const ACTIVE_KEY = "chat-active";

function loadChats() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error("Could not load chat history:", error);
    return [];
  }
}

function loadActiveId() {
  try {
    return localStorage.getItem(ACTIVE_KEY) || null;
  } catch {
    return null;
  }
}

function createId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function makeTitle(text) {
  return text.length > 30 ? `${text.slice(0, 30)}...` : text;
}

function UserContext(props) {
  const [chats, setChats] = useState(loadChats);
  const [activeChatId, setActiveChatId] = useState(loadActiveId);
  const [loading, setLoading] = useState(false);
  // Lives here so "New Chat" can clear and re-focus the input box.
  const [draft, setDraft] = useState("");
  const [newChatSignal, setNewChatSignal] = useState(0);

  // Save every change so history survives a page reload.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    } catch (error) {
      console.error("Could not save chat history:", error);
    }
  }, [chats]);

  // Reopen the last chat you were reading after a reload.
  useEffect(() => {
    try {
      if (activeChatId) {
        localStorage.setItem(ACTIVE_KEY, activeChatId);
      } else {
        localStorage.removeItem(ACTIVE_KEY);
      }
    } catch (error) {
      console.error("Could not save active chat:", error);
    }
  }, [activeChatId]);

  const activeChat = chats.find((chat) => chat.id === activeChatId) || null;
  const messages = activeChat ? activeChat.messages : [];

  function newChat() {
    setActiveChatId(null);
    setDraft("");
    setNewChatSignal((count) => count + 1);
  }

  function selectChat(id) {
    setActiveChatId(id);
  }

  function deleteChat(id) {
    setChats((prev) => prev.filter((chat) => chat.id !== id));
    setActiveChatId((prev) => (prev === id ? null : prev));
  }

  function appendMessage(chatId, message) {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? { ...chat, messages: [...chat.messages, message] }
          : chat,
      ),
    );
  }

  async function sent(prompt) {
    const text = prompt?.trim();
    if (!text || loading) return;

    // Context for the model: everything already in the open chat.
    const history = activeChat ? activeChat.messages : [];

    // No open chat? Start one, put it at the top of the recent list.
    let chatId = activeChatId;
    if (!chatId) {
      chatId = createId();
      const userMessage = { role: "user", text };
      setChats((prev) => [
        { id: chatId, title: makeTitle(text), messages: [userMessage] },
        ...prev,
      ]);
      setActiveChatId(chatId);
    } else {
      appendMessage(chatId, { role: "user", text });
    }

    setLoading(true);

    try {
      const reply = await run(text, history);
      appendMessage(chatId, { role: "model", text: reply });
    } catch (error) {
      appendMessage(chatId, {
        role: "error",
        text: error?.message || "Something went wrong. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  const data = {
    chats,
    activeChatId,
    messages,
    loading,
    draft,
    newChatSignal,
    setDraft,
    sent,
    newChat,
    selectChat,
    deleteChat,
  };

  return (
    <dataContext.Provider value={data}>{props.children}</dataContext.Provider>
  );
}

export default UserContext;
