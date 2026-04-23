/**
 * Utilitaire pour parser et styliser les URLs, mentions et liens d'invitation dans les messages
 */

const URL_REGEX = /https?:\/\/[^\s<>"\)]+/gi;
const MENTION_REGEX = /@([a-zA-Z0-9_]+)/g;
const INVITE_CODE_REGEX = /\b[A-Za-z0-9]{8,32}\b/g;

/**
 * Détecte si un texte contient une URL valide
 */
export const containsUrl = (text) => {
  return URL_REGEX.test(text);
};

/**
 * Détecte si une chaîne est un code d'invitation Just valide
 * Format: 8-32 caractères alphanumériques
 */
export const isInviteCode = (text) => {
  return /^[A-Za-z0-9]{8,32}$/.test(text);
};

/**
 * Parse un message et retourne un tableau de tokens (texte ou liens)
 * Chaque token: { type: 'text' | 'url' | 'invite' | 'mention', content: string, url?: string, mention?: string }
 */
export const parseMessage = (content) => {
  if (!content || typeof content !== 'string') {
    return [{ type: 'text', content: '' }];
  }

  const tokens = [];
  let remaining = content;
  let offset = 0;

  // Créer une liste de tous les matches avec leur position
  const matches = [];

  // Ajouter les URLs
  const urlMatches = Array.from(content.matchAll(URL_REGEX));
  urlMatches.forEach((match) => {
    matches.push({
      type: 'url',
      start: match.index,
      end: match.index + match[0].length,
      content: match[0],
    });
  });

  // Ajouter les mentions
  const mentionMatches = Array.from(content.matchAll(MENTION_REGEX));
  mentionMatches.forEach((match) => {
    matches.push({
      type: 'mention',
      start: match.index,
      end: match.index + match[0].length,
      content: match[0],
      mention: match[1],
    });
  });

  // Trier les matches par position
  matches.sort((a, b) => a.start - b.start);

  // Fusionner les matches qui se chevauchent (garder le premier)
  const mergedMatches = [];
  let lastEnd = 0;
  for (const match of matches) {
    if (match.start >= lastEnd) {
      mergedMatches.push(match);
      lastEnd = match.end;
    }
  }

  // Construire les tokens
  let currentPos = 0;
  mergedMatches.forEach((match) => {
    // Ajouter le texte avant cette correspondance
    if (currentPos < match.start) {
      const beforeText = content.substring(currentPos, match.start);
      tokens.push(...parseTextForInvites(beforeText));
    }

    // Ajouter la correspondance
    if (match.type === 'url') {
      tokens.push({
        type: 'url',
        content: match.content,
        url: match.content,
      });
    } else if (match.type === 'mention') {
      tokens.push({
        type: 'mention',
        content: match.content,
        mention: match.mention,
      });
    }

    currentPos = match.end;
  });

  // Ajouter le texte restant
  if (currentPos < content.length) {
    const remainingText = content.substring(currentPos);
    tokens.push(...parseTextForInvites(remainingText));
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', content }];
};

/**
 * Parse un segment de texte pour les codes d'invitation
 */
const parseTextForInvites = (text) => {
  const tokens = [];
  let lastIndex = 0;
  // Amélioration : vérifier les limites de mots
  const inviteMatches = Array.from(
    text.matchAll(/(?:^|[\s(\[\{\"<>])([A-Za-z0-9]{8,32})(?=$|[\s)\]\}\"<>])/g)
  );

  inviteMatches.forEach((match) => {
    const beforeText = text.substring(lastIndex, match.index);

    if (beforeText) {
      tokens.push({ type: 'text', content: beforeText });
    }

    // Extraire juste le code (groupe 1), pas les limites
    const code = match[1];
    tokens.push({
      type: 'invite',
      content: code,
      code: code,
    });

    lastIndex = match.index + match[0].length - (match[0].length - match[0].trimEnd().length);
  });

  const remainingText = text.substring(lastIndex);
  if (remainingText) {
    tokens.push({ type: 'text', content: remainingText });
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', content: text }];
};

export default { parseMessage, isInviteCode, containsUrl };
