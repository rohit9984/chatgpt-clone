import { useContext, useState } from "react";
import { FiLogIn, FiLogOut } from "react-icons/fi";
import { authContext } from "../../context/AuthContext.jsx";
import LoginModal from "./LoginModal.jsx";
import "./Auth.css";

/**
 * Login / logout control pinned to the bottom of the sidebar.
 * Logged out -> opens the login modal.
 * Logged in  -> opens a small menu with "Log out".
 */
function AuthButton({ isOpen }) {
  const { user, login, logout } = useContext(authContext);
  const [showLogin, setShowLogin] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  function handleClick() {
    if (user) {
      setShowMenu((prev) => !prev);
    } else {
      setShowLogin(true);
    }
  }

  function handleLogout() {
    logout();
    setShowMenu(false);
  }

  return (
    <div className="auth">
      {user ? (
        <div className="auth-user">
          <button
            className={isOpen ? "auth-btn" : "auth-btn collapsed"}
            onClick={handleClick}
            title={user.name}
          >
            <span className="auth-avatar">{user.name.charAt(0).toUpperCase()}</span>
            {isOpen ? <span className="auth-name">{user.name}</span> : null}
          </button>

          {showMenu && isOpen ? (
            <div className="auth-menu">
              <p className="auth-email">{user.email}</p>
              <button className="auth-logout" onClick={handleLogout}>
                <FiLogOut />
                <span>Log out</span>
              </button>
            </div>
          ) : null}

          {showMenu && !isOpen ? (
            <button
              className="auth-logout collapsed"
              onClick={handleLogout}
              title="Log out"
            >
              <FiLogOut />
            </button>
          ) : null}
        </div>
      ) : (
        <button
          className={isOpen ? "auth-btn" : "auth-btn collapsed"}
          onClick={handleClick}
          title="Log in"
        >
          <FiLogIn />
          {isOpen ? <span className="auth-name">Log in</span> : null}
        </button>
      )}

      {showLogin ? (
        <LoginModal onClose={() => setShowLogin(false)} onLogin={login} />
      ) : null}
    </div>
  );
}

export default AuthButton;
