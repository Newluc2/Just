/**
 * Just - Composant d'appel vocal
 *
 * Gère l'affichage de l'état de l'appel en cours :
 * - Bannière d'appel entrant (Accepter / Refuser)
 * - Barre d'appel actif (durée, Mute, Raccrocher)
 * - Appel en cours de connexion
 */

import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, PhoneOff, Phone, PhoneCall } from 'lucide-react';
import {
  initiateCall, acceptCall, rejectCall, endCall,
  setMuted, isMuted, registerCallbacks,
  handleCallAccepted, handleOffer, handleAnswer, handleIceCandidate,
} from '../../api/voiceCall';
import { notifyIncomingCall } from '../../api/notifications';
import { getSocket } from '../../api/socket';
import './VoiceCallUI.css';

/**
 * @param {{ currentUserId: string }} props
 */
export default function VoiceCallUI({ currentUserId }) {
  const [callState, setCallState]       = useState('idle'); // idle | calling | receiving | connected
  const [peerId, setPeerId]             = useState(null);
  const [peerName, setPeerName]         = useState('');
  const [callId, setCallId]             = useState(null);
  const [pendingOffer, setPendingOffer] = useState(null); // SDP offer entrant
  const [muted, setMutedState]          = useState(false);
  const [duration, setDuration]         = useState(0);     // secondes
  const timerRef                        = useRef(null);

  // ── Enregistrer les callbacks WebRTC ───────────────────────────────────────
  useEffect(() => {
    registerCallbacks({
      onStateChange: ({ state }) => {
        setCallState(state);
        if (state === 'connected') startTimer();
        if (state === 'idle') stopTimer();
      },
      onError: (msg) => {
        console.error('[VoiceCallUI] Erreur:', msg);
        resetUI();
      },
    });
  }, []);

  // ── Écouter les événements de signalisation Socket.io ─────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    /** Appel entrant */
    const onIncoming = ({ from, fromUsername, callId: cid }) => {
      setPeerId(from);
      setPeerName(fromUsername);
      setCallId(cid);
      setCallState('receiving');

      // Notification navigateur si la page est en arrière-plan
      notifyIncomingCall(fromUsername, () => {/* focus déjà géré */});
    };

    /** L'appelé a décroché → créer offer */
    const onAccepted = ({ from, callId: cid }) => {
      handleCallAccepted(from);
    };

    /** L'appelé a refusé */
    const onRejected = () => {
      resetUI();
      endCall();
    };

    /** Réception d'une SDP offer */
    const onOffer = ({ from, callId: cid, offer }) => {
      // On l'applique directement si on est en train d'accepter
      handleOffer(from, offer);
    };

    /** Réception d'une SDP answer */
    const onAnswer = ({ answer }) => {
      handleAnswer(answer);
    };

    /** Réception d'un candidat ICE */
    const onIce = ({ candidate }) => {
      handleIceCandidate(candidate);
    };

    /** L'autre côté a raccroché */
    const onEnded = () => {
      endCall();
      resetUI();
    };

    socket.on('call:incoming',      onIncoming);
    socket.on('call:accepted',      onAccepted);
    socket.on('call:rejected',      onRejected);
    socket.on('call:offer',         onOffer);
    socket.on('call:answer',        onAnswer);
    socket.on('call:ice-candidate', onIce);
    socket.on('call:ended',         onEnded);

    return () => {
      socket.off('call:incoming',      onIncoming);
      socket.off('call:accepted',      onAccepted);
      socket.off('call:rejected',      onRejected);
      socket.off('call:offer',         onOffer);
      socket.off('call:answer',        onAnswer);
      socket.off('call:ice-candidate', onIce);
      socket.off('call:ended',         onEnded);
    };
  }, []);

  // ── Timer de durée ─────────────────────────────────────────────────────────
  const startTimer = () => {
    setDuration(0);
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setDuration(0);
  };

  const formatDuration = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  // ── Actions UI ─────────────────────────────────────────────────────────────
  const resetUI = () => {
    setPeerId(null);
    setPeerName('');
    setCallId(null);
    setPendingOffer(null);
    setMutedState(false);
    setCallState('idle');
    stopTimer();
  };

  const handleAccept = async () => {
    if (!peerId || !callId) return;
    // Signaler l'acceptation → l'appelant va envoyer l'offer
    const socket = getSocket();
    if (socket) socket.emit('call:accept', { to: peerId, callId });
    setCallState('connected');
  };

  const handleReject = () => {
    rejectCall(peerId, callId);
    resetUI();
  };

  const handleHangUp = () => {
    endCall();
    resetUI();
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  // ── Rendu ──────────────────────────────────────────────────────────────────
  if (callState === 'idle') return null;

  return (
    <div className="voice-call-ui">
      {/* ── Appel entrant ── */}
      {callState === 'receiving' && (
        <div className="call-banner incoming">
          <div className="call-banner-info">
            <div className="call-avatar">{peerName?.charAt(0).toUpperCase()}</div>
            <div>
              <span className="call-peer-name">{peerName}</span>
              <span className="call-status-text">Appel entrant…</span>
            </div>
          </div>
          <div className="call-actions">
            <button className="call-btn accept" onClick={handleAccept} title="Accepter">
              <Phone size={18} />
            </button>
            <button className="call-btn reject" onClick={handleReject} title="Refuser">
              <PhoneOff size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ── Appel sortant en attente ── */}
      {callState === 'calling' && (
        <div className="call-banner outgoing">
          <div className="call-banner-info">
            <div className="call-avatar ringing">{peerName?.charAt(0).toUpperCase()}</div>
            <div>
              <span className="call-peer-name">{peerName}</span>
              <span className="call-status-text">Appel en cours…</span>
            </div>
          </div>
          <div className="call-actions">
            <button className="call-btn reject" onClick={handleHangUp} title="Annuler">
              <PhoneOff size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ── Appel connecté ── */}
      {callState === 'connected' && (
        <div className="call-banner connected">
          <div className="call-banner-info">
            <div className="call-avatar">{peerName?.charAt(0).toUpperCase()}</div>
            <div>
              <span className="call-peer-name">{peerName}</span>
              <span className="call-status-text call-duration">{formatDuration(duration)}</span>
            </div>
          </div>
          <div className="call-actions">
            <button
              className={`call-btn mute ${muted ? 'active' : ''}`}
              onClick={handleToggleMute}
              title={muted ? 'Activer le micro' : 'Couper le micro'}
            >
              {muted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button className="call-btn reject" onClick={handleHangUp} title="Raccrocher">
              <PhoneOff size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Hook utilitaire : déclencher un appel vers un utilisateur depuis n'importe quel composant.
 * @returns {(targetId: string, targetName: string) => void}
 */
export function useVoiceCall() {
  const [callState, setCallState] = useState('idle');

  const call = (targetId, targetName) => {
    const callId = crypto.randomUUID();
    initiateCall(targetId, callId);
  };

  return { call, callState };
}
