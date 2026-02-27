/**
 * Just - Page d'authentification
 * 
 * Gère l'inscription et la connexion avec un formulaire à onglets
 */

import { useState } from 'react';
import useStore from '../store/useStore';
import './AuthPage.css';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, register } = useStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(username, email, password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Fond animé avec des particules */}
      <div className="auth-background">
        <div className="auth-particles">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="particle" style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${3 + Math.random() * 4}s`,
            }} />
          ))}
        </div>
      </div>

      <div className="auth-container">
        {/* Logo */}
        <div className="auth-logo">
          <div className="logo-icon">J</div>
          <h1>Just</h1>
        </div>

        <div className="auth-card">
          <h2>{isLogin ? 'Content de te revoir !' : 'Créer un compte'}</h2>
          <p className="auth-subtitle">
            {isLogin
              ? 'On est impatient de te retrouver !'
              : 'Rejoins la communauté Just'}
          </p>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            {!isLogin && (
              <div className="form-group">
                <label>Nom d'utilisateur</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="MonPseudo"
                  required={!isLogin}
                />
              </div>
            )}

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemple.com"
                required
              />
            </div>

            <div className="form-group">
              <label>Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button type="submit" className="auth-button" disabled={loading}>
              {loading ? 'Chargement...' : isLogin ? 'Connexion' : 'S\'inscrire'}
            </button>
          </form>

          <p className="auth-switch">
            {isLogin ? 'Pas encore de compte ?' : 'Déjà un compte ?'}
            <button onClick={() => { setIsLogin(!isLogin); setError(''); }}>
              {isLogin ? 'S\'inscrire' : 'Se connecter'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
