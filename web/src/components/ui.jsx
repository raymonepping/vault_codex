// components/ui.jsx: small shared pieces (vault_dance). Colour only for state
// (DESIGN.md): ok, warn, denied, info.
import { createContext, useContext, useEffect, useRef } from 'react';
import { CircleCheck, CircleX, TriangleAlert, X, LogIn } from 'lucide-react';

// The signed-in person and what Vault allows them (GET /api/me).
export const AuthContext = createContext({ signedIn: false });
export const useAuth = () => useContext(AuthContext);
export const signInHref = () => `/auth/login?return=${encodeURIComponent(`/${window.location.hash.split('?')[0] || '#/codex'}`)}`;

// Vault's errors arrive as "1 error occurred:\n\t* permission denied\n\n".
const tidy = (v) => String(v).replace(/^\d+ errors? occurred:\s*/, '').replace(/^\*\s*/, '').replace(/\s+/g, ' ').trim();


export function StatePill({ state, children }) {
  const map = { ok: 'vg-pill vg-pill--healthy', warn: 'vg-pill vg-pill--pending', denied: 'vg-pill vg-pill--rejected', info: 'vg-pill vg-pill--approved' };
  const Icon = state === 'ok' ? CircleCheck : state === 'denied' ? CircleX : state === 'warn' ? TriangleAlert : null;
  return (
    <span className={map[state] || 'vg-pill vg-pill--manual'}>
      {Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </span>
  );
}

// An error from the API, with Vault's own error lines verbatim.
export { tidy };

export function ErrorNotice({ error, title }) {
  if (!error) return null;
  if (error.status === 401) return <SignInNotice />;
  const vault = (error.body?.vault?.errors || []).map(tidy);
  return (
    <div className="inline-notice error" role="alert">
      <strong>{title || 'Refused'}</strong>
      {error.status ? <span className="vault-status"> HTTP {error.status}</span> : null}
      {vault.length ? (
        <ul className="vault-errors">
          {vault.map((v) => (
            <li key={v}>
              Vault said: <code>{v}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0">{error.message}</p>
      )}
    </div>
  );
}

export function SignInNotice() {
  return (
    <div className="vg-card signin-notice" role="status">
      <p>
        <strong>Sign in as the Seeker.</strong> Every answer you give runs on a Vault token issued to you; Vault decides what opens.
      </p>
      <a className="primary-button" href={signInHref()}>
        <LogIn size={14} aria-hidden="true" /> Sign in
      </a>
    </div>
  );
}



export function Mono({ children, title }) {
  return (
    <code className="mono" title={title}>
      {children}
    </code>
  );
}


// Right-hand drawer; Escape and the backdrop close it; focus moves in.
export function Drawer({ open, title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="vg-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="vg-drawer" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="vg-drawer__header">
          <h2 className="vg-drawer__title">{title}</h2>
          <button type="button" className="vg-btn vg-btn--ghost" onClick={onClose} aria-label="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="vg-drawer__body">{children}</div>
      </aside>
    </>
  );
}


export function Loading({ label = 'Asking Vault…' }) {
  return (
    <div className="vg-loading" role="status">
      <span className="vg-live-dot" aria-hidden="true" />
      {label}
    </div>
  );
}

