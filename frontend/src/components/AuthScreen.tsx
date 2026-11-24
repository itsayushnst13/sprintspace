import { useState } from "react";
import { ArrowRight, Command, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { apiRequest } from "../lib/api";
import { useSession } from "../store/session";

type AuthResponse = {
  accessToken: string;
  user: { id: string; name: string; email: string };
  workspace?: { id: string; name: string; slug: string; role: string };
  workspaces?: Array<{ id: string; name: string; slug: string; role: string }>;
};

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingResponse, setPendingResponse] = useState<AuthResponse | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const establish = useSession((state) => state.establish);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await apiRequest<AuthResponse>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(mode === "register" ? { name, email, password } : { email, password })
      });
      if (mode === "login" && (response.workspaces?.length ?? 0) > 1) {
        const savedWorkspaceId = localStorage.getItem("sprintspace.workspaceId");
        const preferred = response.workspaces?.find((workspace) => workspace.id === savedWorkspaceId);
        setSelectedWorkspaceId(preferred?.id ?? response.workspaces?.[0]?.id ?? "");
        setPendingResponse(response);
      } else {
        establish(response.accessToken, response.user, response.workspace);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally { setBusy(false); }
  }

  return <div className="auth-layout">
    <div className="auth-aside">
      <div className="auth-brand"><span><Command size={18} /></span>SprintSpace</div>
      <div className="auth-pitch"><div className="auth-chip">THE WORKSPACE FOR WHAT'S NEXT</div><h1>Great work happens when everyone moves <em>together.</em></h1><p>Bring your projects, people, and plans into one calm, focused place.</p>
        <div className="auth-preview"><div className="preview-bar"><i/><i/><i/><span>Northstar Studio / Overview</span></div><div className="preview-content"><div className="preview-line short"/><div className="preview-line"/><div className="preview-bars"><i/><i/><i/><i/></div><div className="preview-bottom"><i/><i/><i/></div></div></div>
      </div>
      <div className="auth-aside-foot">PLAN WITH CLARITY. SHIP WITH CONFIDENCE.</div>
    </div>
    <div className="auth-main"><div className="auth-form-wrap">
      <div className="auth-mobile-brand"><Command size={18}/> SprintSpace</div>
      <div className="auth-kicker">WELCOME TO SPRINTSPACE</div>
      <h2>{mode === "login" ? "Welcome back" : "Create your workspace"}</h2>
      <p className="auth-description">{mode === "login" ? "Enter your details to continue to your workspace." : "Start collaborating with your team in minutes."}</p>
      {pendingResponse ? <div className="workspace-login-picker">
        <label>Choose workspace<select value={selectedWorkspaceId} onChange={(event) => setSelectedWorkspaceId(event.target.value)}>
          {(pendingResponse.workspaces ?? []).map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.role === "Member" ? "Developer" : workspace.role}</option>)}
        </select></label>
        <p>Your role depends on the workspace you enter. The same account can be Admin in one workspace and Developer in another.</p>
        <button className="auth-submit" type="button" disabled={!selectedWorkspaceId} onClick={() => {
          const workspace = pendingResponse.workspaces?.find((item) => item.id === selectedWorkspaceId);
          if (workspace) establish(pendingResponse.accessToken, pendingResponse.user, workspace);
        }}>Continue to workspace <ArrowRight size={16}/></button>
        <button className="auth-back-button" type="button" onClick={() => { setPendingResponse(null); setError(""); }}>Use another account</button>
      </div> : <form onSubmit={submit}>
        {mode === "register" && <label>Your name<div className="auth-input"><UserRound size={16}/><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ayush Gupta" required minLength={2}/></div></label>}
        <label>Work email<div className="auth-input"><Mail size={16}/><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required/></div></label>
        <label>Password<div className="auth-input"><LockKeyhole size={16}/><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters" minLength={mode === "register" ? 10 : 1} required/><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility">{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"} <ArrowRight size={16}/></button>
      </form>}
      <div className="auth-switch">{mode === "login" ? "New to SprintSpace?" : "Already have an account?"} <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setPendingResponse(null); setError(""); }}>{mode === "login" ? "Create an account" : "Sign in"}</button></div>
      <div className="auth-terms">By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</div>
    </div></div>
  </div>;
}
