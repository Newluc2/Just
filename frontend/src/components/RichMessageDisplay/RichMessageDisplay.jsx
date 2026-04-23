/**
 * Composant pour afficher un message avec liens cliquables, mentions et codes d'invitation détectés
 */

import { parseMessage } from '../../utils/MessageParser';
import './RichMessageDisplay.css';

export default function RichMessageDisplay({ content, className = '' }) {
  const tokens = parseMessage(content);

  return (
    <span className={`rich-message ${className}`.trim()}>
      {tokens.map((token, idx) => {
        switch (token.type) {
          case 'url':
            return (
              <a
                key={idx}
                href={token.url}
                target="_blank"
                rel="noopener noreferrer"
                className="message-link"
                title={token.url}
              >
                {token.content}
              </a>
            );

          case 'mention':
            return (
              <span
                key={idx}
                className="mention-tag"
                title={`Mention: ${token.mention}`}
              >
                {token.content}
              </span>
            );

          case 'invite':
            return (
              <span
                key={idx}
                className="message-invite-badge"
                title={`Code d'invitation: ${token.code}`}
              >
                <span className="invite-icon">🔗</span>
                {token.content}
              </span>
            );

          case 'text':
          default:
            return <span key={idx}>{token.content}</span>;
        }
      })}
    </span>
  );
}
