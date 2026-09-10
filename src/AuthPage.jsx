import React, { useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Auth page: username + password only.
// Front-end mock authentication for now.
// ---------------------------------------------------------------------------

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
  const [mode, setMode] = useState("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const usersRef = useRef(new Map());

  const isSignup = mode === "signup";
  const trimmedUsername = username.trim();

  function switchMode(nextMode) {
    setMode(nextMode);
    setErrors({});
    setFormError("");
    setConfirmPassword("");
  }

  function authenticate(user) {
    setSubmitting(false);
    onAuthenticated({ username: user });
  }

  function handleSubmit(e) {
    e.preventDefault();
    setFormError("");

    const fieldErrors = validate(username, password, mode);

    if (isSignup && password !== confirmPassword) {
      fieldErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(fieldErrors);

    if (Object.keys(fieldErrors).length > 0) {
      return;
    }

    setSubmitting(true);

    setTimeout(() => {
      const key = trimmedUsername.toLowerCase();

      if (isSignup) {
        if (usersRef.current.has(key)) {
          setFormError("That username is already taken.");
          setSubmitting(false);
          return;
        }

        usersRef.current.set(key, password);
        authenticate(trimmedUsername);
        return;
      }

      const storedPassword = usersRef.current.get(key);

      // Temporary demo behaviour: allow sign-in even without prior signup.
      if (storedPassword === undefined) {
        authenticate(trimmedUsername);
        return;
      }

      if (storedPassword !== password) {
        setFormError("Incorrect username or password.");
        setSubmitting(false);
        return;
      }

      authenticate(trimmedUsername);
    }, 400);
  }

  return (
    <div className="auth-shell">
      <div className="auth-backdrop" aria-hidden="true" />

      <div className={`auth-card ${isSignup ? "is-signup" : "is-signin"}`}>
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="50" height="50">
              <path
                d="M2 18c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <circle
                cx="12"
                cy="8"
                r="4.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M12 3.8v8.4"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          </span>

          <div>
            <div className="brand-title">
              KYMA
            </div>
            {/* <div className="brand-sub">
              SIH26143
            </div> */}
          </div>
        </div>

        <div className="auth-tabs">
          {["signin", "signup"].map((tab) => (
            <button
              key={tab}
              type="button"
              className={`auth-tab ${mode === tab ? "active" : ""}`}
              onClick={() => switchMode(tab)}
            >
              {tab === "signin" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>

        <form
          className={`auth-form ${isSignup ? "is-signup" : "is-signin"}`}
          onSubmit={handleSubmit}
          noValidate
        >
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

            {errors.username && (
              <span className="auth-error">
                {errors.username}
              </span>
            )}
          </label>

          <label className="auth-field">
            <span className="auth-label">Password</span>

            <div className="auth-password-row">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  isSignup ? "new-password" : "current-password"
                }
                placeholder={
                  isSignup
                    ? "At least 8 characters"
                    : "Enter your password"
                }
                className={errors.password ? "invalid" : ""}
              />

              <button
                type="button"
                className="auth-toggle-visibility"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={
                  showPassword ? "Hide password" : "Show password"
                }
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {errors.password && (
              <span className="auth-error">
                {errors.password}
              </span>
            )}
          </label>

          {isSignup && (
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
                <span className="auth-error">
                  {errors.confirmPassword}
                </span>
              )}
            </label>
          )}

          {formError && (
            <div className="auth-form-error">
              {formError}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary auth-submit"
            disabled={submitting}
          >
            {submitting
              ? isSignup
                ? "Creating account…"
                : "Signing in…"
              : isSignup
              ? "Create account"
              : "Sign in"}
          </button>
        </form>

        <p className="auth-switch">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("signin")}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("signup")}
              >
                Sign up
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}