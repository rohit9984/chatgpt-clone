import { FiSearch, FiX } from "react-icons/fi";
import "./SearchBar.css";

function SearchBar({ value, onChange, placeholder = "Search chats" }) {
  return (
    <div className="searchbar">
      <FiSearch className="searchbar-icon" />

      <input
        type="search"
        className="searchbar-input"
        placeholder={placeholder}
        aria-label="Search chats"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />

      {value ? (
        <button
          type="button"
          className="searchbar-clear"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <FiX />
        </button>
      ) : null}
    </div>
  );
}

export default SearchBar;
