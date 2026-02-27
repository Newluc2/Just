/**
 * Just - Configuration API
 * Centralise l'URL du backend et les headers d'authentification
 */

const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Faire une requête authentifiée vers le backend
 */
export async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('just_token');
  
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  };

  const response = await fetch(`${API_URL}${endpoint}`, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Erreur serveur');
  }

  return data;
}

export default API_URL;
