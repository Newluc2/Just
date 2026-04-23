/**
 * Just - Zone de chat pour les messages privés (DM)
 *
 * Fonctionnalités complètes (miroir de ChatArea) :
 * - Édition inline, suppression, réactions emoji
 * - Reply (citation), upload fichiers, context menu
 * - Appel vocal WebRTC
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Phone, Smile, Paperclip, Reply,
  Pencil, Trash2, X, Check, MoreHorizontal,
} from 'lucide-react';
import useStore from '../../store/useStore';
import { getSocket } from '../../api/socket';
import { initiateCall } from '../../api/voiceCall';
import RichMessageDisplay from '../RichMessageDisplay/RichMessageDisplay';
import '../ChatArea/ChatArea.css';
import './DMChatArea.css';

/* ─── Émojis communs ─── */
const COMMON_EMOJIS = [
  '👍','❤️','😂','😮','😢','😡','🎉','🔥',
  '✅','👀','🙏','💯','🤔','😍','👏','💀',
  '🤣','😎','🥳','💪','🚀','✨','😭','🫡',
];

/* ─── Mini emoji picker ─── */
function EmojiPicker({ onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div className="emoji-picker dm-emoji-picker" ref={ref}>
      {COMMON_EMOJIS.map((em) => (
        <button key={em} className="emoji-btn" onMouseDown={(e) => { e.preventDefault(); onPick(em); }}>{em}</button>
      ))}
    </div>
  );
}

/* ─── Context menu ─── */
function ContextMenu({ x, y, message, isMine, onEdit, onDelete, onReply, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div className="context-menu" ref={ref}
      style={{ left: Math.min(x, window.innerWidth - 170), top: Math.min(y, window.innerHeight - 160) }}>
      <button onMouseDown={() => { onReply(); onClose(); }}><Reply size={14} /> Répondre</button>
      {isMine && <button onMouseDown={() => { onEdit(); onClose(); }}><Pencil size={14} /> Modifier</button>}
      {isMine && <button className="danger" onMouseDown={() => { onDelete(); onClose(); }}><Trash2 size={14} /> Supprimer</button>}
    </div>
  );
}

/* ─── Composant principal ─── */
export default function DMChatArea() {
  const {
    currentDM, dmMessages, sendDM, user, dmTypingUsers, uploadFile,
  } = useStore();

  const [input, setInput]           = useState('');
  const [replyTo, setReplyTo]       = useState(null);
  const [editingId, setEditingId]   = useState(null);
  const [editContent, setEditContent] = useState('');
  const [emojiTarget, setEmojiTarget] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [uploading, setUploading]   = useState(false);
  const [pendingFile, setPendingFile] = useState(null);

  const messagesEndRef   = useRef(null);
  const typingTimeoutRef = useRef(null);
  const inputRef         = useRef(null);
  const editInputRef     = useRef(null);
  const fileInputRef     = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [dmMessages]);
  useEffect(() => { if (editingId) setTimeout(() => editInputRef.current?.focus(), 50); }, [editingId]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') { setContextMenu(null); cancelEdit(); setReplyTo(null); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  /* ── Typing ── */
  const handleTyping = useCallback(() => {
    const socket = getSocket();
    if (!socket || !currentDM) return;
    socket.emit('dm:typing:start', currentDM.id);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => socket.emit('dm:typing:stop', currentDM.id), 3000);
  }, [currentDM]);

  /* ── Envoi ── */
  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() && !pendingFile) return;

    let attachments = [];
    if (pendingFile) {
      try {
        setUploading(true);
        const res = await uploadFile(pendingFile.file);
        attachments = [res];
      } catch { alert("Erreur lors de l'envoi du fichier"); setUploading(false); return; }
      finally { setUploading(false); }
      setPendingFile(null);
    }

    sendDM(input, { replyTo: replyTo?.id, attachments });
    setInput(''); setReplyTo(null);
    const socket = getSocket();
    if (socket && currentDM) socket.emit('dm:typing:stop', currentDM.id);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  /* ── Appel vocal ── */
  const handleCall = () => {
    if (!currentDM?.other_user_id) return;
    initiateCall(currentDM.other_user_id, crypto.randomUUID());
  };

  /* ── Édition DM ── */
  const startEdit   = (msg) => { setEditingId(msg.id); setEditContent(msg.content); };
  const cancelEdit  = () => { setEditingId(null); setEditContent(''); };
  const confirmEdit = (e) => {
    e.preventDefault();
    if (!editContent.trim()) return;
    const socket = getSocket();
    if (socket) socket.emit('dm:edit', { messageId: editingId, content: editContent, conversationId: currentDM.id });
    // Mise à jour locale optimiste
    useStore.setState((state) => ({
      dmMessages: state.dmMessages.map((m) =>
        m.id === editingId ? { ...m, content: editContent, edited_at: new Date().toISOString() } : m
      ),
    }));
    cancelEdit();
  };

  /* ── Suppression DM ── */
  const handleDelete = (msgId) => {
    if (!window.confirm('Supprimer ce message ?')) return;
    const socket = getSocket();
    if (socket) socket.emit('dm:delete', { messageId: msgId, conversationId: currentDM.id });
    useStore.setState((state) => ({
      dmMessages: state.dmMessages.filter((m) => m.id !== msgId),
    }));
  };

  /* ── Réaction DM ── */
  const handleReact = (msgId, emoji) => {
    const socket = getSocket();
    if (socket) socket.emit('dm:react', { messageId: msgId, emoji, conversationId: currentDM.id });
    setEmojiTarget(null);
  };

  /* ── Upload fichier ── */
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    setPendingFile({ file, previewUrl });
    e.target.value = '';
  };

  /* ── Context menu ── */
  const handleContextMenu = (e, msg) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, message: msg }); };

  /* ── Helpers ── */
  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now  = new Date();
    const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === now.toDateString()) return `Aujourd'hui à ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return `Hier à ${time}`;
    return `${date.toLocaleDateString('fr-FR')} ${time}`;
  };

  const getAvatarColor = (username) => {
    const colors = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#f47b67', '#3ba5b8'];
    let hash = 0;
    for (let i = 0; i < (username || '').length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const isSameAuthorGroup = (msg, prevMsg) => {
    if (!prevMsg || msg.author_id !== prevMsg.author_id) return false;
    return new Date(msg.created_at) - new Date(prevMsg.created_at) < 5 * 60 * 1000;
  };

  const renderContent = (content) => {
    if (!content) return null;
    return <RichMessageDisplay content={content} />;
  };

  // Le backend envoie déjà des réactions groupées : [{emoji, count, users:[userId,...]}]
  // Il ne faut PAS re-grouper — juste calculer `hasMe` depuis le tableau `users`.
  const buildReactionGroups = (reactions = []) =>
    reactions.map((r) => ({ ...r, hasMe: (r.users || []).includes(user?.id) }));

  /* ── Empty state ── */
  if (!currentDM) {
    return (
      <div className="dm-chat-area">
        <div className="chat-empty">
          <div className="chat-empty-icon">💬</div>
          <h2>Aucune conversation sélectionnée</h2>
          <p>Sélectionne une conversation ou démarre un nouveau DM</p>
        </div>
      </div>
    );
  }

  const othersTyping = dmTypingUsers.filter((t) => t.userId !== user?.id);
  const otherName    = currentDM.other_username || 'Utilisateur';

  return (
    <div className="dm-chat-area" onClick={() => { setContextMenu(null); setEmojiTarget(null); }}>

      {/* ── Header ── */}
      <div className="dm-chat-header">
        <div className="dm-chat-header-info">
          <div className="dm-chat-avatar" style={{ background: getAvatarColor(otherName) }}>
            {otherName.charAt(0).toUpperCase()}
          </div>
          <h3>{otherName}</h3>
        </div>
        <button className="dm-call-btn" onClick={handleCall} title={`Appeler ${otherName}`}>
          <Phone size={18} />
        </button>
      </div>

      {/* ── Messages ── */}
      <div className="chat-messages">
        <div className="chat-welcome">
          <div className="dm-welcome-avatar" style={{ background: getAvatarColor(otherName) }}>
            {otherName.charAt(0).toUpperCase()}
          </div>
          <h2>Début de votre conversation avec {otherName}</h2>
          <p>Ce n'est que vous deux. Dites bonjour !</p>
        </div>

        {dmMessages.map((msg, index) => {
          // Un message avec reply ne peut pas être groupé
          const grouped  = isSameAuthorGroup(msg, dmMessages[index - 1]) && !msg.reply_to && !msg.replied_message;
          const isMine   = msg.author_id === user?.id;
          const isEditing = editingId === msg.id;
          const reactionGroups = buildReactionGroups(msg.reactions || []);

          return (
            <div
              key={msg.id}
              className={`message ${grouped ? 'grouped' : ''} ${isMine ? 'own' : ''}`}
              onContextMenu={(e) => handleContextMenu(e, msg)}
            >
              {!grouped && (
                msg.author_avatar ? (
                  <img src={msg.author_avatar} alt="" className="message-avatar message-avatar-img" />
                ) : (
                  <div className="message-avatar" style={{ background: getAvatarColor(msg.author_username) }}>
                    {(msg.author_username || '?').charAt(0).toUpperCase()}
                  </div>
                )
              )}

              <div className={`message-content ${grouped ? 'grouped-content' : ''}`}>
                {/* Citation (reply) */}
                {(msg.reply_to || msg.replied_message) && (
                  <div className="reply-quote">
                    <Reply size={12} />
                    <span className="reply-author">
                      {msg.replied_message?.author_username || '?'}
                    </span>
                    <span className="reply-text">
                      {msg.replied_message?.content || '(message supprimé)'}
                    </span>
                  </div>
                )}

                {!grouped && (
                  <div className="message-header">
                    <span className="message-author" style={{ color: getAvatarColor(msg.author_username) }}>
                      {isMine ? 'Vous' : (msg.author_display_name || msg.author_username)}
                    </span>
                    <span className="message-time">{formatTime(msg.created_at)}</span>
                  </div>
                )}

                {/* Contenu ou édition */}
                {isEditing ? (
                  <form className="edit-form" onSubmit={confirmEdit}>
                    <input ref={editInputRef} className="edit-input" value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                    <div className="edit-actions">
                      <button type="button" className="edit-cancel" onClick={cancelEdit}><X size={14} /> Annuler</button>
                      <button type="submit" className="edit-confirm"><Check size={14} /> Sauvegarder</button>
                    </div>
                  </form>
                ) : (
                  <div className="message-text">
                    {renderContent(msg.content)}
                    {msg.edited_at && <span className="edited-tag">(modifié)</span>}
                  </div>
                )}

                {/* Pièces jointes */}
                {msg.attachments?.length > 0 && (
                  <div className="attachments">
                    {msg.attachments.map((att, i) => {
                      // Formats image supportés
                      const mimeType = att.mime_type || att.mimetype || '';
                      const fileName = att.original_name || att.originalName || '';
                      const isImage = mimeType.startsWith('image/') || 
                                     /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|heic)$/i.test(fileName);
                      
                      if (isImage) {
                        return (
                          <div key={i} className="attach-image-wrapper">
                            <img 
                              src={att.url} 
                              alt={fileName} 
                              className="attach-image"
                              title={fileName}
                            />
                          </div>
                        );
                      } else {
                        return (
                          <a 
                            key={i} 
                            href={att.url} 
                            download={fileName} 
                            className="attach-file"
                          >
                            📎 {fileName || 'Fichier'}
                          </a>
                        );
                      }
                    })}
                  </div>
                )}

                {/* Réactions */}
                {reactionGroups.length > 0 && (
                  <div className="reactions">
                    {reactionGroups.map(({ emoji, count, users, hasMe }) => (
                      <button
                        key={emoji}
                        className={`reaction-pill ${hasMe ? 'reacted' : ''}`}
                        title={users.join(', ')}
                        onClick={(e) => { e.stopPropagation(); handleReact(msg.id, emoji); }}
                      >
                        {emoji} {count}
                      </button>
                    ))}
                    <button
                      className="reaction-add-btn"
                      onClick={(e) => { e.stopPropagation(); setEmojiTarget(emojiTarget === msg.id ? null : msg.id); }}
                    >
                      <Smile size={14} />
                    </button>
                  </div>
                )}

                {emojiTarget === msg.id && (
                  <EmojiPicker onPick={(em) => handleReact(msg.id, em)} onClose={() => setEmojiTarget(null)} />
                )}
              </div>

              {/* Toolbar au hover */}
              <div className="message-toolbar">
                <button className="toolbar-btn" title="Réagir"
                  onClick={(e) => { e.stopPropagation(); setEmojiTarget(emojiTarget === msg.id ? null : msg.id); }}>
                  <Smile size={16} />
                </button>
                <button className="toolbar-btn" title="Répondre"
                  onClick={(e) => { e.stopPropagation(); setReplyTo(msg); inputRef.current?.focus(); }}>
                  <Reply size={16} />
                </button>
                {isMine && (
                  <>
                    <button className="toolbar-btn" title="Modifier" onClick={(e) => { e.stopPropagation(); startEdit(msg); }}>
                      <Pencil size={16} />
                    </button>
                    <button className="toolbar-btn danger" title="Supprimer" onClick={(e) => { e.stopPropagation(); handleDelete(msg.id); }}>
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
                <button className="toolbar-btn" title="Plus"
                  onClick={(e) => { e.stopPropagation(); handleContextMenu(e, msg); }}>
                  <MoreHorizontal size={16} />
                </button>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Typing indicator ── */}
      {othersTyping.length > 0 && (
        <div className="typing-indicator">
          <div className="typing-dots"><span /><span /><span /></div>
          <span>
            {othersTyping.length === 1
              ? `${othersTyping[0].username} est en train d'écrire...`
              : `${othersTyping.map((t) => t.username).join(', ')} sont en train d'écrire...`}
          </span>
        </div>
      )}

      {/* ── Input area ── */}
      <div className="chat-input-wrapper">

        {/* Bannière reply */}
        {replyTo && (
          <div className="reply-banner">
            <Reply size={14} />
            <span>Répondre à <strong>{replyTo.author_username}</strong> : {replyTo.content?.slice(0, 60)}{replyTo.content?.length > 60 ? '…' : ''}</span>
            <button className="reply-cancel" onClick={() => setReplyTo(null)}><X size={14} /></button>
          </div>
        )}

        {/* Preview fichier */}
        {pendingFile && (
          <div className="file-preview">
            {pendingFile.previewUrl
              ? <img src={pendingFile.previewUrl} alt="preview" className="file-preview-img" />
              : <span>📎 {pendingFile.file.name}</span>
            }
            <button className="file-preview-remove" onClick={() => setPendingFile(null)}><X size={14} /></button>
          </div>
        )}

        <form onSubmit={handleSend} className="chat-input-form">
          {/* Bouton fichier */}
          <button type="button" className="attach-btn" title="Joindre un fichier" onClick={() => fileInputRef.current?.click()}>
            <Paperclip size={20} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf,.txt,.doc,.docx,.zip"
            style={{ display: 'none' }} onChange={handleFileChange} />

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); handleTyping(); }}
            placeholder={`Envoyer un message à ${otherName}`}
            autoFocus
            disabled={uploading}
          />
          <button type="submit" className="send-button" disabled={(!input.trim() && !pendingFile) || uploading}>
            <Send size={20} />
          </button>
        </form>
      </div>

      {/* ── Context menu ── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y}
          message={contextMenu.message}
          isMine={contextMenu.message.author_id === user?.id}
          onEdit={() => startEdit(contextMenu.message)}
          onDelete={() => handleDelete(contextMenu.message.id)}
          onReply={() => { setReplyTo(contextMenu.message); inputRef.current?.focus(); }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
