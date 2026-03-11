/**
 * Just - Service d'appel vocal (WebRTC)
 *
 * Gère les appels audio peer-to-peer via WebRTC.
 * La signalisation (échange des offres/réponses ICE) passe par Socket.io.
 *
 * Architecture :
 *   - Une seule connexion RTCPeerConnection active à la fois
 *   - Le stream local (micro) est obtenu via getUserMedia
 *   - Le stream distant (audio reçu) est joué automatiquement
 *   - Tous les événements de signalisation transitent par getSocket()
 *
 * Flux d'appel :
 *   Appelant  → call:initiate  → Destinataire
 *   Destinataire → call:accept → Appelant
 *   Appelant  → createOffer → call:offer → Destinataire
 *   Destinataire → createAnswer → call:answer → Appelant
 *   Les deux → call:ice-candidate (échange ICE)
 *   N'importe lequel → call:end → fermeture propre
 */

import { getSocket } from './socket';

// ─── Serveurs STUN publics pour traverser les NAT ───────────────────────────
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// ─── État interne du service ─────────────────────────────────────────────────
let peerConnection = null;   // RTCPeerConnection active
let localStream    = null;   // MediaStream du micro local
let remoteAudio    = null;   // Élément <audio> pour jouer l'audio distant
let currentCallId  = null;   // ID unique de l'appel en cours
let currentPeerId  = null;   // userId du correspondant

// Callbacks d'état (pour mettre à jour le store / l'UI)
const callbacks = {
  onStateChange : null, // (state: CallState) => void
  onError       : null, // (message: string) => void
};

/**
 * @typedef {'idle'|'calling'|'receiving'|'connected'|'ended'} CallState
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Émet un événement de signalisation via Socket.io.
 */
function signal(event, data) {
  const socket = getSocket();
  if (!socket) {
    console.warn('[VoiceCall] Socket non disponible pour signaler :', event);
    return;
  }
  socket.emit(event, data);
}

/**
 * Met à jour l'état de l'appel et notifie le callback.
 * @param {CallState} state
 * @param {object} [extra] - données supplémentaires passées au callback
 */
function setState(state, extra = {}) {
  if (typeof callbacks.onStateChange === 'function') {
    callbacks.onStateChange({ state, callId: currentCallId, peerId: currentPeerId, ...extra });
  }
}

/**
 * Reporte une erreur via le callback puis termine l'appel.
 */
function reportError(message) {
  console.error('[VoiceCall]', message);
  if (typeof callbacks.onError === 'function') callbacks.onError(message);
  endCall();
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Enregistrer les callbacks de l'UI / du store.
 * À appeler une seule fois, au montage du composant ou de l'app.
 *
 * @param {{ onStateChange?: Function, onError?: Function }} cbs
 */
export function registerCallbacks(cbs = {}) {
  if (cbs.onStateChange) callbacks.onStateChange = cbs.onStateChange;
  if (cbs.onError)       callbacks.onError       = cbs.onError;
}

/**
 * Obtenir le stream local (micro).
 * Demande la permission d'accès au micro si nécessaire.
 * @returns {Promise<MediaStream>}
 */
async function getLocalStream() {
  if (localStream) return localStream;

  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  return localStream;
}

/**
 * Créer et configurer une RTCPeerConnection.
 * @param {string} peerId - userId du correspondant (pour ICE)
 * @returns {RTCPeerConnection}
 */
function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection(ICE_SERVERS);

  // Envoyer les candidats ICE au correspondant via Socket
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      signal('call:ice-candidate', { to: peerId, candidate });
    }
  };

  // Recevoir le stream audio distant
  pc.ontrack = (event) => {
    if (!remoteAudio) {
      remoteAudio = document.createElement('audio');
      remoteAudio.autoplay = true;
      remoteAudio.style.display = 'none';
      document.body.appendChild(remoteAudio);
    }
    remoteAudio.srcObject = event.streams[0];
    setState('connected');
  };

  // Observer les changements d'état de connexion
  pc.onconnectionstatechange = () => {
    console.log('[VoiceCall] Connection state:', pc.connectionState);
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      reportError('La connexion audio a été perdue.');
    }
  };

  return pc;
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Initier un appel vers un utilisateur.
 * @param {string} targetUserId - userId de la personne appelée
 * @param {string} callId - ID unique généré par l'appelant (ex: uuid)
 */
export async function initiateCall(targetUserId, callId) {
  if (peerConnection) {
    console.warn('[VoiceCall] Un appel est déjà en cours.');
    return;
  }

  try {
    currentCallId = callId;
    currentPeerId = targetUserId;
    setState('calling');

    // Signaler l'appel sortant au destinataire
    signal('call:initiate', { to: targetUserId, callId });
  } catch (err) {
    reportError('Impossible d\'initier l\'appel : ' + err.message);
  }
}

/**
 * Accepter un appel entrant.
 * Crée la PeerConnection, ajoute le stream local, envoie l'answer.
 * @param {string} callerId - userId de l'appelant
 * @param {string} callId   - ID de l'appel
 * @param {RTCSessionDescriptionInit} offer - SDP offer reçue
 */
export async function acceptCall(callerId, callId, offer) {
  try {
    currentCallId = callId;
    currentPeerId = callerId;
    setState('receiving');

    // Obtenir le micro local
    const stream = await getLocalStream();

    // Créer la connexion peer
    peerConnection = createPeerConnection(callerId);
    stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

    // Appliquer l'offre reçue
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    // Créer et envoyer la réponse
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    signal('call:answer', { to: callerId, callId, answer });
    setState('connected');
  } catch (err) {
    reportError('Impossible d\'accepter l\'appel : ' + err.message);
  }
}

/**
 * Refuser un appel entrant.
 * @param {string} callerId
 * @param {string} callId
 */
export function rejectCall(callerId, callId) {
  signal('call:reject', { to: callerId, callId });
  currentCallId = null;
  currentPeerId = null;
  setState('idle');
}

/**
 * Terminer l'appel en cours (des deux côtés).
 * Nettoie toutes les ressources WebRTC.
 */
export function endCall() {
  const peerId = currentPeerId;
  const callId = currentCallId;

  // Notifier le correspondant
  if (peerId && callId) {
    signal('call:end', { to: peerId, callId });
  }

  // Arrêter les tracks du micro local
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  // Fermer la connexion peer
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  // Supprimer l'élément audio distant
  if (remoteAudio) {
    remoteAudio.srcObject = null;
    remoteAudio.remove();
    remoteAudio = null;
  }

  currentCallId = null;
  currentPeerId = null;
  setState('idle');
}

/**
 * Couper / rétablir le micro local (mute/unmute).
 * @param {boolean} muted - true = muet
 */
export function setMuted(muted) {
  if (!localStream) return;
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !muted;
  });
}

/**
 * Vérifie si le micro est actuellement coupé.
 * @returns {boolean}
 */
export function isMuted() {
  if (!localStream) return true;
  return localStream.getAudioTracks().some(t => !t.enabled);
}

/**
 * Vérifie si un appel est actif.
 * @returns {boolean}
 */
export function isInCall() {
  return peerConnection !== null;
}

// ─── Gestionnaires de signalisation Socket.io ────────────────────────────────
// Ces fonctions doivent être appelées depuis les listeners Socket.io de l'app
// (App.jsx ou setupSocket) avec les données reçues du serveur.

/**
 * À appeler quand on reçoit `call:offer` (côté appelant après que le destinataire a accepté).
 * @param {string} fromUserId
 * @param {RTCSessionDescriptionInit} offer
 */
export async function handleOffer(fromUserId, offer) {
  if (!peerConnection) {
    // L'appelant doit créer la PC et envoyer l'offer
    try {
      const stream = await getLocalStream();
      peerConnection = createPeerConnection(fromUserId);
      stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      signal('call:answer', { to: fromUserId, callId: currentCallId, answer });
    } catch (err) {
      reportError('Erreur handleOffer : ' + err.message);
    }
  }
}

/**
 * À appeler quand on reçoit `call:answer` (côté appelant).
 * @param {RTCSessionDescriptionInit} answer
 */
export async function handleAnswer(answer) {
  if (!peerConnection) return;
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    setState('connected');
  } catch (err) {
    reportError('Erreur handleAnswer : ' + err.message);
  }
}

/**
 * À appeler quand on reçoit `call:ice-candidate`.
 * @param {RTCIceCandidateInit} candidate
 */
export async function handleIceCandidate(candidate) {
  if (!peerConnection) return;
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.warn('[VoiceCall] Erreur ICE candidate:', err);
  }
}

/**
 * À appeler quand on reçoit `call:accept` (le destinataire a décroché).
 * L'appelant crée alors la PeerConnection et envoie l'offer SDP.
 * @param {string} accepterUserId
 */
export async function handleCallAccepted(accepterUserId) {
  try {
    const stream = await getLocalStream();
    peerConnection = createPeerConnection(accepterUserId);
    stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    signal('call:offer', { to: accepterUserId, callId: currentCallId, offer });
  } catch (err) {
    reportError('Erreur handleCallAccepted : ' + err.message);
  }
}
