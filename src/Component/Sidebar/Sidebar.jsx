import React, { useContext, useMemo } from "react";
import { GiHamburgerMenu } from "react-icons/gi";
import { FaRegMessage } from "react-icons/fa6";
import { FiTrash2 } from "react-icons/fi";
import NewChat from "../NewChat/NewChat.jsx";
import SearchBar from "../Search/SearchBar.jsx";
import AuthButton from "../Auth/AuthButton.jsx";
import { dataContext } from "../../context/UserContext.jsx";
import "./Sidebar.css";

function BrandLogo() {
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
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </svg>
  );
}

function Sidebar() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const { chats, activeChatId, selectChat, deleteChat } =
    useContext(dataContext);

  const visibleChats = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return chats;
    return chats.filter((chat) => chat.title.toLowerCase().includes(search));
  }, [chats, query]);

  // On phones the sidebar is an overlay drawer, so close it after an action.
  function closeOnPhone() {
    if (window.innerWidth <= 600) setIsOpen(false);
  }

  function handleSelect(id) {
    selectChat(id);
    closeOnPhone();
  }

  function handleDelete(event, chat) {
    event.stopPropagation();
    deleteChat(chat.id);
  }

  return (
    <div className={isOpen ? "sidebar open" : "sidebar"}>
      <div className="sidebar-header">
        <button
          type="button"
          className="icon-btn"
          id="ham"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <GiHamburgerMenu />
        </button>

        {isOpen ? (
          <div className="sidebar-brand">
            <BrandLogo />
            <span className="sidebar-brand-name">My Assistant</span>
          </div>
        ) : null}
      </div>

      <NewChat isOpen={isOpen} onStart={closeOnPhone} />

      {isOpen ? <SearchBar value={query} onChange={setQuery} /> : null}

      <div className="sidebar-section">
        <div className="sidebar-label">
          <FaRegMessage />
          {isOpen ? <span>Recent Chats</span> : null}
        </div>

        {isOpen ? (
          <div className="chat-list">
            {chats.length === 0 ? (
              <p className="empty-chats">No chats yet</p>
            ) : visibleChats.length === 0 ? (
              <p className="empty-chats">No chats match “{query}”</p>
            ) : (
              visibleChats.map((chat) => (
                <div
                  key={chat.id}
                  className={
                    chat.id === activeChatId
                      ? "chat-item active"
                      : "chat-item"
                  }
                  title={chat.title}
                  onClick={() => handleSelect(chat.id)}
                >
                  <span className="chat-item-title">{chat.title}</span>
                  <button
                    type="button"
                    className="chat-item-delete"
                    aria-label={`Delete ${chat.title}`}
                    title="Delete chat"
                    onClick={(event) => handleDelete(event, chat)}
                  >
                    <FiTrash2 />
                  </button>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>

      <AuthButton isOpen={isOpen} />
    </div>
  );
}

export default Sidebar;
