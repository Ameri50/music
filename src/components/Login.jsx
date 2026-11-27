import { useState } from 'react';

export default function Login({ onSignIn, onGoogle, error, busy }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="login-wrap">
      <form
        className="login-card"
        onSubmit={(e) => {
          e.preventDefault();
          onSignIn(email.trim(), password);
        }}
      >
        <div className="login-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path
              d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h1>ONDA</h1>
        <p className="login-sub">
          Tu música, en todos tus dispositivos. Inicia sesión para sincronizar la biblioteca.
        </p>

        <button
          type="button"
          className="google-btn"
          onClick={onGoogle}
          disabled={busy}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.65h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.58-5.15 3.58-8.82Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.29a12 12 0 0 0 0 10.74l3.98-3.09Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.77c1.76 0 3.34.6 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.29 6.63l3.98 3.09C6.22 6.87 8.87 4.77 12 4.77Z"
            />
          </svg>
          Continuar con Google
        </button>

        <div className="login-or">
          <span>o con tu correo</span>
        </div>

        <label>
          Correo
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            inputMode="email"
            required
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button type="submit" className="btn btn-primary login-btn" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <small>Entra con la cuenta de administrador de la tienda.</small>
      </form>
    </div>
  );
}
