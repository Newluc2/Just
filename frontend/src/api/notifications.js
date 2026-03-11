/**
 * Just - Service de notifications navigateur
 *
 * Fournit une API centralisée pour afficher des notifications
 * système via l'API Web Notifications.
 *
 * Usage :
 *   import { requestPermission, sendNotification } from './notifications';
 *   await requestPermission();
 *   sendNotification({ title: 'Nouveau message', body: 'Salut !', onClick: () => {} });
 */

// Icône par défaut (favicon de l'app)
const DEFAULT_ICON = '/favicon.ico';

/**
 * Vérifie si les notifications sont supportées par le navigateur.
 * @returns {boolean}
 */
export function isSupported() {
  return 'Notification' in window;
}

/**
 * Retourne le statut actuel de la permission.
 * @returns {'default'|'granted'|'denied'|'unsupported'}
 */
export function getPermission() {
  if (!isSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Demande la permission d'afficher des notifications si elle n'est pas encore accordée.
 * Ne fait rien si déjà granted ou denied.
 * @returns {Promise<'granted'|'denied'|'unsupported'>}
 */
export async function requestPermission() {
  if (!isSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  try {
    const result = await Notification.requestPermission();
    return result;
  } catch (err) {
    console.warn('[Notifications] requestPermission error:', err);
    return 'denied';
  }
}

/**
 * Envoie une notification navigateur.
 *
 * @param {object} options
 * @param {string}   options.title     - Titre de la notification (obligatoire)
 * @param {string}  [options.body]     - Corps du message
 * @param {string}  [options.icon]     - URL de l'icône
 * @param {string}  [options.tag]      - Tag pour regrouper / remplacer des notifications similaires
 * @param {boolean} [options.silent]   - Silencieux (pas de son)
 * @param {Function}[options.onClick]  - Callback exécuté au clic sur la notification
 *
 * @returns {Notification|null} L'instance Notification ou null si impossible
 */
export function sendNotification({ title, body = '', icon = DEFAULT_ICON, tag, silent = false, onClick } = {}) {
  // Ne pas notifier si la page est visible (l'utilisateur est déjà là)
  if (document.visibilityState === 'visible') return null;

  if (!isSupported()) {
    console.warn('[Notifications] Non supporté par ce navigateur.');
    return null;
  }

  if (Notification.permission !== 'granted') {
    console.warn('[Notifications] Permission non accordée :', Notification.permission);
    return null;
  }

  try {
    const notification = new Notification(title, {
      body,
      icon,
      tag,
      silent,
    });

    // Ramener la fenêtre au premier plan au clic
    notification.onclick = (e) => {
      e.preventDefault();
      window.focus();
      if (typeof onClick === 'function') onClick();
      notification.close();
    };

    // Fermer automatiquement après 6 secondes
    setTimeout(() => notification.close(), 6000);

    return notification;
  } catch (err) {
    console.warn('[Notifications] Erreur lors de la création :', err);
    return null;
  }
}

/**
 * Raccourci : notification pour un nouveau message dans un salon.
 * @param {string} senderName - Auteur du message
 * @param {string} channelName - Nom du salon
 * @param {string} content - Aperçu du message
 * @param {Function} [onClick] - Action au clic
 */
export function notifyNewMessage(senderName, channelName, content, onClick) {
  sendNotification({
    title: `${senderName} dans #${channelName}`,
    body: content.length > 80 ? content.slice(0, 80) + '…' : content,
    tag: `channel-${channelName}`,
    onClick,
  });
}

/**
 * Raccourci : notification pour un nouveau message privé (DM).
 * @param {string} senderName - Expéditeur
 * @param {string} content - Aperçu du message
 * @param {Function} [onClick] - Action au clic
 */
export function notifyDM(senderName, content, onClick) {
  sendNotification({
    title: `Message privé de ${senderName}`,
    body: content.length > 80 ? content.slice(0, 80) + '…' : content,
    tag: `dm-${senderName}`,
    onClick,
  });
}

/**
 * Raccourci : notification pour un appel vocal entrant.
 * @param {string} callerName - Appelant
 * @param {Function} [onClick] - Action au clic (ex: ouvrir l'interface d'appel)
 */
export function notifyIncomingCall(callerName, onClick) {
  sendNotification({
    title: '📞 Appel entrant',
    body: `${callerName} vous appelle`,
    tag: 'incoming-call',
    silent: false,
    onClick,
  });
}
