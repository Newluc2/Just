/**
 * Middleware pour vérifier les IP bannies et logger les tentatives d'accès
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

function logAccess(ipAddress, action, endpoint, userId = null, blocked = false) {
  try {
    db.run(
      `INSERT INTO access_logs (id, ip_address, user_id, action, endpoint, blocked, created_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [uuidv4(), ipAddress, userId || null, action, endpoint || null, blocked ? 1 : 0]
    );
  } catch (err) {
    console.error('Error logging access:', err);
  }
}

function ipBanMiddleware(req, res, next) {
  const ipAddress = getClientIp(req);
  const endpoint = `${req.method} ${req.path}`;
  const userId = req.user?.id || null;

  try {
    // Vérifier si l'IP est bannée
    const banned = db.get('SELECT * FROM ip_bans WHERE ip_address = ?', [ipAddress]);
    
    if (banned) {
      logAccess(ipAddress, 'blocked_by_ip_ban', endpoint, userId, true);
      return res.status(403).json({
        error: 'Votre adresse IP a été bannie de ce service.',
        reason: banned.reason || 'Aucune raison fournie'
      });
    }

    // Logger l'accès réussi (optionnel, pour les accès API importants)
    if (req.path.startsWith('/api/') && !req.path.startsWith('/api/health')) {
      logAccess(ipAddress, req.method, endpoint, userId, false);
    }

    next();
  } catch (err) {
    console.error('IP ban middleware error:', err);
    next(); // Ne pas bloquer si erreur
  }
}

module.exports = { ipBanMiddleware, getClientIp, logAccess };
