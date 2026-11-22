// The Account part of Settings: sign in or create an account, see how saving to it is going, sign out.
// The game works without an account; this only adds a copy of the game online (docs/cloud-saves.md).
import { useEffect, useState } from "preact/hooks";
import { PASSWORD_MAX, PASSWORD_MIN, isValidEmail, isValidPassword, normalizeEmail } from "../sync/account-rules";
import type { CloudSync } from "../sync/sync";

function useCloud(cloud: CloudSync): void {
  const [, setCount] = useState(0);
  useEffect(() => cloud.subscribe(() => setCount((n) => n + 1)), [cloud]);
}

const timeText = (at: number): string => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function SignedOut({ cloud }: { cloud: CloudSync }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState(cloud.lastEmail);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState(cloud.message);
  const [working, setWorking] = useState(false);

  const submit = async (event: Event): Promise<void> => {
    event.preventDefault();
    const clean = normalizeEmail(email);
    if (!isValidEmail(clean)) return setProblem("Please enter a valid email address.");
    if (mode === "in" && password === "") return setProblem("Please enter your password.");
    if (mode === "up" && !isValidPassword(password)) return setProblem(`Choose a password of ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`);
    if (mode === "up" && code.trim() === "") return setProblem("Please enter the family code.");
    setWorking(true);
    setProblem("");
    try {
      const failure = mode === "in" ? await cloud.signIn(clean, password) : await cloud.signUp(clean, password, code.trim());
      if (failure) setProblem(failure);
      else setPassword(""); // signed in: this form is replaced by the signed in view
    } catch {
      setProblem("Something went wrong. Please try again.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p class="hint">
        Sign in to keep a copy of your game online and carry on from another device. The game works fine without an account.
      </p>
      <div class="row">
        <button type="button" class="btn small" aria-pressed={mode === "in"} onClick={() => setMode("in")}>
          Sign in
        </button>
        <button type="button" class="btn small" aria-pressed={mode === "up"} onClick={() => setMode("up")}>
          Create account
        </button>
      </div>
      <label class="stack">
        Email
        <input type="email" value={email} autocomplete="username" autocapitalize="off" spellcheck={false} onInput={(e) => setEmail(e.currentTarget.value)} />
      </label>
      <label class="stack">
        Password
        <input
          type="password"
          value={password}
          autocomplete={mode === "in" ? "current-password" : "new-password"}
          onInput={(e) => setPassword(e.currentTarget.value)}
        />
      </label>
      {mode === "up" && (
        <>
          <p class="hint">
            Use {PASSWORD_MIN} or more characters. There is no way to reset a forgotten password yet, so write it down somewhere safe.
          </p>
          <label class="stack">
            Family code
            <input type="text" value={code} autocomplete="off" autocapitalize="off" spellcheck={false} onInput={(e) => setCode(e.currentTarget.value)} />
          </label>
        </>
      )}
      {problem && (
        <p class="notice" role="alert">
          {problem}
        </p>
      )}
      <button type="submit" class="btn small" disabled={working}>
        {working ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}

function SignedIn({ cloud, email }: { cloud: CloudSync; email: string }) {
  const status = cloud.busy
    ? "Saving…"
    : cloud.message || (cloud.lastSyncedAt === null ? "" : `Up to date at ${timeText(cloud.lastSyncedAt)}.`);
  return (
    <>
      <p>
        Signed in as <strong>{email}</strong>
      </p>
      {cloud.choosing ? (
        <div class="notice" role="alert">
          <p>This device has a game, and so does your account. Which one do you want to keep? The other one is kept as a backup.</p>
          <div class="row">
            <button class="btn small" disabled={cloud.busy} onClick={() => void cloud.choose("device")}>
              Keep this device's game
            </button>
            <button class="btn small" disabled={cloud.busy} onClick={() => void cloud.choose("account")}>
              Use my account's game
            </button>
          </div>
        </div>
      ) : (
        status && <p class="hint">{status}</p>
      )}
      <div class="row">
        <button class="btn small" disabled={cloud.busy || cloud.choosing !== null} onClick={() => void cloud.sync()}>
          Sync now
        </button>
        <button class="btn small" disabled={cloud.busy} onClick={() => void cloud.signOut()}>
          Sign out
        </button>
      </div>
    </>
  );
}

export function AccountSection({ cloud }: { cloud: CloudSync }) {
  useCloud(cloud);
  const email = cloud.email;
  return (
    <fieldset>
      <legend>Account</legend>
      {email === null ? <SignedOut cloud={cloud} /> : <SignedIn cloud={cloud} email={email} />}
    </fieldset>
  );
}
