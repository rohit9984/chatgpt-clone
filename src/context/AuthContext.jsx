import { createContext, useEffect, useState } from "react";

export const authContext = createContext();

const STORAGE_KEY = "chat-user";

function loadUser() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.error("Could not load user:", error);
    return null;
  }
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(loadUser);

  // Keep the logged-in user across reloads.
  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error("Could not save user:", error);
    }
  }, [user]);

  function login(name, email) {
    setUser({ name, email, loggedInAt: Date.now() });
  }

  function logout() {
    setUser(null);
  }

  const data = { user, login, logout };

  return <authContext.Provider value={data}>{children}</authContext.Provider>;
}

export default AuthProvider;
