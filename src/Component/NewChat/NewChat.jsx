import { useContext } from "react";
import { TiPlus } from "react-icons/ti";
import { dataContext } from "../../context/UserContext.jsx";
import "./NewChat.css";

/**
 * ChatGPT-style "New Chat" button.
 * Starts a blank conversation, clears the input box and focuses it so the
 * user can type right away. Existing chats stay saved in Recent Chats.
 */
function NewChat({ isOpen, onStart }) {
  const { newChat } = useContext(dataContext);

  function handleClick() {
    newChat();
    onStart?.();
  }

  return (
    <div
      className={isOpen ? "newchat" : "newchat collapsed"}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      title="New Chat"
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleClick();
        }
      }}
    >
      <TiPlus />
      {isOpen ? <p>New Chat</p> : null}
    </div>
  );
}

export default NewChat;
