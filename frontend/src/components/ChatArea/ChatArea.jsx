/**
 * Just - Zone de chat principale
 *
 * Fonctionnalités :
 * - Messages temps-réel, groupement par auteur
 * - Édition inline, suppression, réactions emoji
 * - Reply (citation), upload de fichiers
 * - @mention autocomplete
 * - Context menu (clic-droit)
 * - Épinglage des messages
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Hash, Send, Smile, AtSign, Paperclip, Pin,
  Pencil, Trash2, Reply, X, Check, MoreHorizontal,
} from 'lucide-react';
import useStore from '../../store/useStore';
import { getSocket } from '../../api/socket';
import RichMessageDisplay from '../RichMessageDisplay/RichMessageDisplay';
import './ChatArea.css';

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
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return (
    <div className="emoji-picker" ref={ref}>
      {COMMON_EMOJIS.map((em) => (
        <button key={em} className="emoji-btn" onMouseDown={(e) => { e.preventDefault(); onPick(em); }}>
          {em}
        </button>
      ))}
    </div>
  );
}

/* ─── Context menu ─── */
function ContextMenu({ x, y, message, isMine, onEdit, onDelete, onReply, onPin, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return (
    <div
      className="context-menu"
      ref={ref}
      style={{ left: Math.min(x, window.innerWidth - 170), top: Math.min(y, window.innerHeight - 200) }}
    >
      <button onMouseDown={() => { onReply(); onClose(); }}><Reply size={14} /> Répondre</button>
      {isMine && (
        <button onMouseDown={() => { onEdit(); onClose(); }}><Pencil size={14} /> Modifier</button>
      )}
      <button onMouseDown={() => { onPin(); onClose(); }}><Pin size={14} /> Épingler</button>
      {isMine && (
        <button className="danger" onMouseDown={() => { onDelete(); onClose(); }}><Trash2 size={14} /> Supprimer</button>
      )}
    </div>
  );
}

/* ─── Composant principal ─── */
export default function ChatArea() {
  const {
    currentChannel, currentServer, messages,
    sendMessage, editMessage, deleteMessage, reactToMessage,
    user, typingUsers, members, uploadFile, channelPermissions,
  } = useStore();

  const [input, setInput] = useState('');
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [emojiTarget, setEmojiTarget] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState([]);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const editInputRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (editingId) setTimeout(() => editInputRef.current?.focus(), 50); }, [editingId]);
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') { setContextMenu(null); cancelEdit(); setReplyTo(null); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleTyping = useCallback(() => {
    const socket = getSocket();
    if (!socket || !currentChannel) return;
    socket.emit('typing:start', currentChannel.id);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => { socket.emit('typing:stop', currentChannel.id); }, 3000);
  }, [currentChannel]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() && !pendingFile) return;
    let attachments = [];
    if (pendingFile) {
      try {
        setUploading(true);
        const res = await uploadFile(pendingFile.file);
        // L'API retourne directement { url, filename, originalName, mimetype, size }
        attachments = [res];
      } catch { alert("Erreur lors de l'envoi du fichier"); setUploading(false); return; }
      finally { setUploading(false); }
      setPendingFile(null);
    }
    sendMessage(input, { replyTo: replyTo?.id, attachments });
    setInput(''); setReplyTo(null); setMentionSuggestions([]);
    const socket = getSocket();
    if (socket && currentChannel) socket.emit('typing:stop', currentChannel.id);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    handleTyping();
    const match = val.match(/@([a-zA-Z0-9_]*)$/);
    if (match) {
      const query = match[1].toLowerCase();
      setMentionSuggestions(members.filter((m) => m.id !== user?.id && m.username.toLowerCase().startsWith(query)).slice(0, 5));
    } else { setMentionSuggestions([]); }
  };

  const insertMention = (username) => {
    setInput(input.replace(/@([a-zA-Z0-9_]*)$/, `@${username} `));
    setMentionSuggestions([]);
    inputRef.current?.focus();
  };

  const startEdit = (msg) => { setEditingId(msg.id); setEditContent(msg.content); };
  const cancelEdit = () => { setEditingId(null); setEditContent(''); };
  const confirmEdit = (e) => {
    e.preventDefault();
    if (!editContent.trim()) return;
    editMessage(editingId, editContent);
    cancelEdit();
  };
  const handleDelete = (msgId) => { if (window.confirm('Supprimer ce message ?')) deleteMessage(msgId); };
  const handleReact = (msgId, emoji) => { reactToMessage(msgId, emoji); setEmojiTarget(null); };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    setPendingFile({ file, previewUrl });
    e.target.value = '';
  };

  const openPinned = async () => {
    const pins = await useStore.getState().fetchPinnedMessages(currentChannel.id);
    setPinnedMessages(pins);
    setPinnedOpen(true);
  };

  const handleContextMenu = (e, msg) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, message: msg }); };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Aujourd'hui à ${time}`;
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return `Hier à ${time}`;
    return `${date.toLocaleDateString('fr-FR')} ${time}`;
  };

  const getAvatarColor = (username) => {
    const colors = ['#5865f2','#57f287','#fee75c','#eb459e','#ed4245','#f47b67','#3ba5b8'];
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

  if (!currentChannel) {
    return (
      <div className="chat-area">
        <div className="chat-empty">
          <div className="chat-empty-icon">{currentServer ? '💬' : '👋'}</div>
          <h2>{currentServer ? 'Sélectionne un salon' : 'Bienvenue sur Just !'}</h2>
          <p>{currentServer ? 'Choisis un salon textuel dans la barre latérale pour commencer à discuter' : 'Crée ou rejoins un serveur pour commencer à discuter avec tes amis'}</p>
        </div>
      </div>
    );
  }

  const othersTyping = typingUsers.filter((t) => t.userId !== user?.id);

  return (
    <div className="chat-area" onClick={() => { setContextMenu(null); setEmojiTarget(null); }}>

      {/* Header */}
      <div className="chat-header">
        <Hash size={20} className="chat-header-hash" />
        <h3>{currentChannel.name}</h3>
        {currentChannel.topic && <span className="chat-header-topic">{currentChannel.topic}</span>}
        <div className="chat-header-actions">
          <button className="header-btn" onClick={openPinned} title="Messages épinglés"><Pin size={18} /></button>
        </div>
      </div>

      {/* Pinned panel */}
      {pinnedOpen && (
        <div className="pinned-panel">
          <div className="pinned-panel-header">
            <Pin size={16} /> Messages épinglés
            <button className="pinned-close" onClick={() => setPinnedOpen(false)}><X size={16} /></button>
          </div>
          <div className="pinned-list">
            {pinnedMessages.length === 0
              ? <p className="pinned-empty">Aucun message épinglé</p>
              : pinnedMessages.map((p) => (
                <div key={p.id} className="pinned-item">
                  <span className="pinned-author">{p.author_username}</span>
                  <span className="pinned-content">{p.content}</span>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages">
        <div className="chat-welcome">
          <div className="chat-welcome-icon"><Hash size={40} /></div>
          <h2>Bienvenue dans #{currentChannel.name} !</h2>
          <p>C'est le début du salon #{currentChannel.name}.</p>
        </div>

        {messages.map((msg, index) => {
          // Un message avec reply ne peut pas être groupé (la quote doit toujours être visible)
          const grouped = isSameAuthorGroup(msg, messages[index - 1]) && !msg.reply_to && !msg.replied_message;
          const isMine = msg.author_id === user?.id;
          const reactionGroups = buildReactionGroups(msg.reactions || []);
          const isEditing = editingId === msg.id;

          return (
            <div key={msg.id} className={`message ${grouped ? 'grouped' : ''}`} onContextMenu={(e) => handleContextMenu(e, msg)}>
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
                {/* Citation (reply) — le backend envoie msg.reply_to (id) + msg.replied_message (objet) */}
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
                    <span className="message-author" style={{ color: getAvatarColor(msg.author_username) }}>{msg.author_display_name || msg.author_username}</span>
                    <span className="message-time">{formatTime(msg.created_at)}</span>
                  </div>
                )}
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
                {msg.attachments?.length > 0 && (
                  <div className="attachments">
                    {msg.attachments.map((att) => {
                      // Formats image supportés
                      const mimeType = att.mime_type || att.mimetype || '';
                      const fileName = att.original_name || att.originalName || '';
                      const isImage = mimeType.startsWith('image/') || 
                                     /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|heic)$/i.test(fileName);
                      
                      if (isImage) {
                        return (
                          <div key={att.id} className="attach-image-wrapper">
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
                          <a key={att.id} href={att.url} download={fileName} className="attach-file">
                            📎 {fileName}
                          </a>
                        );
                      }
                    })}
                  </div>
                )}
                {reactionGroups.length > 0 && (
                  <div className="reactions">
                    {reactionGroups.map(({ emoji, count, users, hasMe }) => (
                      <button key={emoji} className={`reaction-pill ${hasMe ? 'reacted' : ''}`} title={users.join(', ')}
                        onClick={(e) => { e.stopPropagation(); if (channelPermissions?.canReact !== false) reactToMessage(msg.id, emoji); }}>
                        {emoji} {count}
                      </button>
                    ))}
                    {channelPermissions?.canReact !== false && (
                    <button className="reaction-add-btn" title="Ajouter une réaction"
                      onClick={(e) => { e.stopPropagation(); setEmojiTarget(emojiTarget === msg.id ? null : msg.id); }}>
                      <Smile size={14} />
                    </button>
                    )}
                  </div>
                )}
                {emojiTarget === msg.id && (
                  <EmojiPicker onPick={(em) => handleReact(msg.id, em)} onClose={() => setEmojiTarget(null)} />
                )}
              </div>

              {/* Toolbar hover */}
              <div className="message-toolbar">
                {channelPermissions?.canReact !== false && (
                <button className="toolbar-btn" title="Réagir"
                  onClick={(e) => { e.stopPropagation(); setEmojiTarget(emojiTarget === msg.id ? null : msg.id); }}>
                  <Smile size={16} />
                </button>
                )}
                <button className="toolbar-btn" title="Répondre"
                  onClick={(e) => { e.stopPropagation(); setReplyTo(msg); inputRef.current?.focus(); }}>
                  <Reply size={16} />
                </button>
                {isMine && (
                  <>
                    <button className="toolbar-btn" title="Modifier"
                      onClick={(e) => { e.stopPropagation(); startEdit(msg); }}>
                      <Pencil size={16} />
                    </button>
                    <button className="toolbar-btn danger" title="Supprimer"
                      onClick={(e) => { e.stopPropagation(); handleDelete(msg.id); }}>
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

      {/* Typing */}
      {othersTyping.length > 0 && (
        <div className="typing-indicator">
          <div className="typing-dots"><span /><span /><span /></div>
          <span>{othersTyping.length === 1 ? `${othersTyping[0].username} est en train d'écrire...` : `${othersTyping.map((t) => t.username).join(', ')} sont en train d'écrire...`}</span>
        </div>
      )}

      {/* Input area */}
      <div className="chat-input-wrapper">
        {replyTo && (
          <div className="reply-banner">
            <Reply size={14} />
            <span>Répondre à <strong>{replyTo.author_username}</strong> : {replyTo.content.slice(0, 60)}{replyTo.content.length > 60 ? '…' : ''}</span>
            <button className="reply-cancel" onClick={() => setReplyTo(null)}><X size={14} /></button>
          </div>
        )}
        {pendingFile && (
          <div className="file-preview">
            {pendingFile.previewUrl ? <img src={pendingFile.previewUrl} alt="preview" className="file-preview-img" /> : <span>📎 {pendingFile.file.name}</span>}
            <button className="file-preview-remove" onClick={() => setPendingFile(null)}><X size={14} /></button>
          </div>
        )}
        {mentionSuggestions.length > 0 && (
          <div className="mention-suggestions">
            {mentionSuggestions.map((m) => (
              <button key={m.id} className="mention-suggestion-item"
                onMouseDown={(e) => { e.preventDefault(); insertMention(m.username); }}>
                <AtSign size={12} /><span>{m.username}</span>
              </button>
            ))}
          </div>
        )}
        {channelPermissions === null ? (
          <div className="chat-input-disabled">
            <span>Chargement des permissions…</span>
          </div>
        ) : channelPermissions?.canSend === false ? (
          <div className="chat-input-disabled">
            <span>Vous n'avez pas la permission d'envoyer des messages dans ce salon.</span>
          </div>
        ) : (
        <form onSubmit={handleSend} className="chat-input-form">
          <button type="button" className="attach-btn" title="Joindre un fichier" onClick={() => fileInputRef.current?.click()}>
            <Paperclip size={20} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf,.txt,.doc,.docx,.zip" style={{ display: 'none' }} onChange={handleFileChange} />
          <input ref={inputRef} type="text" value={input} onChange={handleInputChange}
            placeholder={`Envoyer un message dans #${currentChannel.name}`} autoFocus disabled={uploading} />
          <button type="submit" className="send-button" disabled={(!input.trim() && !pendingFile) || uploading}>
            <Send size={20} />
          </button>
        </form>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y}
          message={contextMenu.message}
          isMine={contextMenu.message.author_id === user?.id}
          onEdit={() => startEdit(contextMenu.message)}
          onDelete={() => handleDelete(contextMenu.message.id)}
          onReply={() => { setReplyTo(contextMenu.message); inputRef.current?.focus(); }}
          onPin={async () => {
            try {
              await fetch(`${import.meta.env.VITE_API_URL || '/api'}/messages/${contextMenu.message.id}/pin`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${useStore.getState().token}` },
              });
            } catch {}
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
