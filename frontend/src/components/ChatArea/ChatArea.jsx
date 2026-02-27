/**
 * Just - Zone de chat principale
 * 
 * Affiche les messages du salon sélectionné,
 * avec le champ de saisie et l'indicateur de frappe
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Hash, Send, SmilePlus } from 'lucide-react';
import useStore from '../../store/useStore';
import { getSocket } from '../../api/socket';
import './ChatArea.css';

export default function ChatArea() {
  const { currentChannel, currentServer, messages, sendMessage, user, typingUsers } = useStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Auto-scroll vers le bas quand un message arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * Gérer l'indicateur de frappe
   */
  const handleTyping = useCallback(() => {
    const socket = getSocket();
    if (!socket || !currentChannel) return;

    socket.emit('typing:start', currentChannel.id);

    // Arrêter l'indicateur après 3 secondes d'inactivité
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', currentChannel.id);
    }, 3000);
  }, [currentChannel]);

  /**
   * Envoyer le message
   */
  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    sendMessage(input);
    setInput('');

    // Arrêter l'indicateur de frappe
    const socket = getSocket();
    if (socket && currentChannel) {
      socket.emit('typing:stop', currentChannel.id);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  /**
   * Formater la date d'un message
   */
  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    
    if (isToday) return `Aujourd'hui à ${time}`;
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return `Hier à ${time}`;

    return `${date.toLocaleDateString('fr-FR')} ${time}`;
  };

  /**
   * Obtenir la couleur d'avatar d'un auteur
   */
  const getAvatarColor = (username) => {
    const colors = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#f47b67', '#3ba5b8'];
    let hash = 0;
    for (let i = 0; i < (username || '').length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  /**
   * Vérifier si deux messages consécutifs sont du même auteur (pour le groupement)
   */
  const isSameAuthorGroup = (msg, prevMsg) => {
    if (!prevMsg) return false;
    if (msg.author_id !== prevMsg.author_id) return false;
    const diff = new Date(msg.created_at) - new Date(prevMsg.created_at);
    return diff < 5 * 60 * 1000; // Moins de 5 minutes d'écart
  };

  // Affichage quand aucun salon n'est sélectionné
  if (!currentChannel) {
    return (
      <div className="chat-area">
        <div className="chat-empty">
          <div className="chat-empty-icon">
            {currentServer ? '💬' : '👋'}
          </div>
          <h2>{currentServer ? 'Sélectionne un salon' : 'Bienvenue sur Just !'}</h2>
          <p>
            {currentServer
              ? 'Choisis un salon textuel dans la barre latérale pour commencer à discuter'
              : 'Crée ou rejoins un serveur pour commencer à discuter avec tes amis'}
          </p>
        </div>
      </div>
    );
  }

  // Filtrer les typing users pour ne pas montrer l'utilisateur actuel
  const othersTyping = typingUsers.filter((t) => t.userId !== user?.id);

  return (
    <div className="chat-area">
      {/* Header du salon */}
      <div className="chat-header">
        <Hash size={20} className="chat-header-hash" />
        <h3>{currentChannel.name}</h3>
      </div>

      {/* Zone de messages */}
      <div className="chat-messages">
        {/* Message de bienvenue */}
        <div className="chat-welcome">
          <div className="chat-welcome-icon">
            <Hash size={40} />
          </div>
          <h2>Bienvenue dans #{currentChannel.name} !</h2>
          <p>C'est le début du salon #{currentChannel.name}.</p>
        </div>

        {/* Liste des messages */}
        {messages.map((msg, index) => {
          const grouped = isSameAuthorGroup(msg, messages[index - 1]);

          return (
            <div key={msg.id} className={`message ${grouped ? 'grouped' : ''}`}>
              {!grouped && (
                <div
                  className="message-avatar"
                  style={{ background: getAvatarColor(msg.author_username) }}
                >
                  {(msg.author_username || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div className={`message-content ${grouped ? 'grouped-content' : ''}`}>
                {!grouped && (
                  <div className="message-header">
                    <span
                      className="message-author"
                      style={{ color: getAvatarColor(msg.author_username) }}
                    >
                      {msg.author_username}
                    </span>
                    <span className="message-time">{formatTime(msg.created_at)}</span>
                  </div>
                )}
                <div className="message-text">{msg.content}</div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Indicateur de frappe */}
      {othersTyping.length > 0 && (
        <div className="typing-indicator">
          <div className="typing-dots">
            <span /><span /><span />
          </div>
          <span>
            {othersTyping.length === 1
              ? `${othersTyping[0].username} est en train d'écrire...`
              : `${othersTyping.map((t) => t.username).join(', ')} sont en train d'écrire...`}
          </span>
        </div>
      )}

      {/* Barre de saisie */}
      <div className="chat-input-wrapper">
        <form onSubmit={handleSend} className="chat-input-form">
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              handleTyping();
            }}
            placeholder={`Envoyer un message dans #${currentChannel.name}`}
            autoFocus
          />
          <button type="submit" className="send-button" disabled={!input.trim()}>
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}
