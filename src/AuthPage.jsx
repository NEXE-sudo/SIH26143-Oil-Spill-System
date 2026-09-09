import React, { useState, useRef } from "react";
import { useAuth } from "./context/AuthContext.jsx";

function validate(username, password, mode) {
  const errors = {};
  if (!username.trim()) {
    errors.username = "Username is required";
  } else if (username.trim().length < 3) {
    errors.username = "Username must be at least 3 characters";
  }

  if (!password) {
    errors.password = "Password is required";
  } else if (mode === "signup" && password.length < 8) {
    errors.password = "Password must be at least 8 characters";
  }

  return errors;
}

export default function AuthPage({ onAuthenticated }) {
  const { login } = useAuth();
  
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // In-memory "database" for local session testing
  const usersRef = useRef(new Map());

  function switchMode(next) {
    setMode(next);
    setErrors({});
    setFormError("");
    setConfirmPassword("");
  }

  function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    const fieldErrors = validate(username, password, mode);

    if (mode === "signup" && password !== confirmPassword) {
      fieldErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setSubmitting(true);

    setTimeout(() => {
      const key = username.trim().toLowerCase();
      // Generate a mock JWT token string safely
      const mockToken = `mock_jwt_session_${btoa(key)}_${Date.now()}`;

      if (mode === "signup") {
        if (usersRef.current.has(key)) {
          setFormError("That username is already taken.");
          setSubmitting(false);
          return;
        }
        usersRef.current.set(key, password);
        setSubmitting(false);
        login(mockToken);
        if (onAuthenticated) onAuthenticated({ username: username.trim() });
        return;
      }

      // signin
      const stored = usersRef.current.get(key);
      if (stored !== undefined && stored !== password) {
        setFormError("Incorrect username or password.");
        setSubmitting(false);
        return;
      }

      // If key wasn't in local map, allow mock sign-in for demo
      if (stored === undefined) {
        usersRef.current.set(key, password);
      }

      setSubmitting(false);
      login(mockToken);
      if (onAuthenticated) onAuthenticated({ username: username.trim() });
    }, 400);
  }

  return (
    <div className="auth-shell">
      <div className="auth-backdrop" aria-hidden="true">
        <svg viewBox="0 0 400 400" className="auth-backdrop-svg">
          <defs>
            <radialGradient id="authGlow" cx="30%" cy="20%" r="70%">
              <stop offset="0%" stopColor="#0f2a3d" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0a0e14" stopOpacity="0" />
            </radialGradient>
            <pattern id="authGrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#141e29" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="400" height="400" fill="#0a0e14" />
          <rect width="400" height="400" fill="url(#authGrid)" />
          <rect width="400" height="400" fill="url(#authGlow)" />
        </svg>
      </div>

      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path
                d="M2 18c2 1.5 4 1.5 6 0s4-1.5 6 0 4-1.5 6-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <circle cx="12" cy="8" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 3.8v8.4" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </span>
          <div>
            <div className="brand-title">Maritime Oil Spill Intelligence</div>
            <div className="brand-sub">SIH26143 · NTRO investigation console</div>
          </div>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={"auth-tab" + (mode === "signin" ? " active" : "")}
            onClick={() => switchMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={"auth-tab" + (mode === "signup" ? " active" : "")}
            onClick={() => switchMode("signup")}
          >
            Sign up
          </button>
        </div>

        {formError && <div className="auth-banner-error">{formError}</div>}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="auth-field">
            <span className="auth-label">Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="e.g. investigator07"
              className={errors.username ? "invalid" : ""}
            />
            {errors.username && <span className="auth-error">{errors.username}</span>}
          </label>

          <label className="auth-field">
            <span className="auth-label">Password</span>
            <div className="auth-password-row">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"}
                className={errors.password ? "invalid" : ""}
              />
              <button
                type="button"
                className="auth-toggle-visibility"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {errors.password && <span className="auth-error">{errors.password}</span>}
          </label>

          {mode === "signup" && (
            <label className="auth-field">
              <span className="auth-label">Confirm password</span>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Re-enter your password"
                className={errors.confirmPassword ? "invalid" : ""}
              />
              {errors.confirmPassword && (
                <span className="auth-error">{errors.confirmPassword}</span>
              )}
            </label>
          )}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Authenticating..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          <div className="auth-switch">
            {mode === "signin" ? (
              <span>
                Don't have an account?{" "}
                <button type="button" className="btn-link" onClick={() => switchMode("signup")}>
                  Sign up
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{" "}
                <button type="button" className="btn-link" onClick={() => switchMode("signin")}>
                  Sign in
                </button>
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}