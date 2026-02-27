/**
 * Just - Service Socket.io côté client
 * Gère la connexion et la déconnexion au serveur WebSocket
 */

import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

let socket = null;

/**
 * Connecter le socket avec le token d'authentification
 */
export function connectSocket(token) {
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('🟢 Connected to Just server');
  });

  socket.on('connect_error', (err) => {
    console.error('❌ Socket connection error:', err.message);
  });

  return socket;
}

/**
 * Obtenir l'instance du socket actuel
 */
export function getSocket() {
  return socket;
}

/**
 * Déconnecter le socket
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
