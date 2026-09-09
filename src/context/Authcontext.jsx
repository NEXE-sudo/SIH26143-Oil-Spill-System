import React, { createContext, useContext, useState } from 'react';

// Create the AuthContext
const AuthContext = createContext(null);

// Create the AuthProvider
export const AuthProvider = ({ children }) => {
  // Initialize state directly from localStorage to prevent UI flickering
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('token'));

  // Function to handle login
  const login = (newToken) => {
    setToken(newToken);
    setIsAuthenticated(true);
    localStorage.setItem('token', newToken);
  };

  // Function to handle logout
  const logout = () => {
    setToken(null);
    setIsAuthenticated(false);
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ token, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Create the useAuth custom hook with a safety check
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
