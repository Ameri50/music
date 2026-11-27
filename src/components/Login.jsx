import { useState } from 'react';

export default function Login({ onSignIn, error, busy }) {
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
        <small>Usa la misma cuenta de administrador de la tienda.</small>
      </form>
    </div>
  );
}
