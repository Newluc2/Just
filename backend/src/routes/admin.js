const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

const loginRateLimit = new Map();

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const maxAttempts = 10;
  const current = loginRateLimit.get(ip);

  if (!current || now > current.resetAt) {
    loginRateLimit.set(ip, { attempts: 1, resetAt: now + windowMs });
    return true;
  }

  current.attempts += 1;
  return current.attempts <= maxAttempts;
}

router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body || {};
    if (!login || !password) {
      return res.status(400).json({ error: 'Login et mot de passe requis' });
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkLoginRateLimit(ip)) {
      return res.status(429).json({ error: 'Trop de tentatives. Réessayez plus tard.' });
    }

    const adminLogin = process.env.ADMIN_LOGIN;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
    const fallbackPassword = process.env.ADMIN_PASSWORD;

    if (!adminLogin || (!adminPasswordHash && !fallbackPassword)) {
      return res.status(503).json({ error: 'Panel admin non configuré sur le serveur' });
    }

    if (login !== adminLogin) {
      return res.status(401).json({ error: 'Identifiants admin invalides' });
    }

    let valid = false;
    if (adminPasswordHash) {
      valid = await bcrypt.compare(password, adminPasswordHash);
    } else {
      valid = password === fallbackPassword;
    }

    if (!valid) {
      return res.status(401).json({ error: 'Identifiants admin invalides' });
    }

    const token = jwt.sign(
      { type: 'admin', login: adminLogin },
      process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.json({ token, admin: { login: adminLogin } });
  } catch (err) {
    console.error('POST /admin/login error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/me', adminAuth, (req, res) => {
  res.json({ admin: { login: req.admin.login } });
});

router.get('/stats', adminAuth, (req, res) => {
  try {
    const totalMembers = db.get('SELECT COUNT(*) AS count FROM users')?.count || 0;
    const totalBannedAccounts = db.get('SELECT COUNT(*) AS count FROM admin_bans')?.count || 0;
    const totalServers = db.get('SELECT COUNT(*) AS count FROM servers')?.count || 0;
    const totalChannels = db.get('SELECT COUNT(*) AS count FROM channels')?.count || 0;
    const totalMessages = db.get('SELECT COUNT(*) AS count FROM messages')?.count || 0;
    const totalDirectMessages = db.get('SELECT COUNT(*) AS count FROM direct_messages')?.count || 0;
    const activeMembers = db.get("SELECT COUNT(*) AS count FROM users WHERE status = 'online'")?.count || 0;

    res.json({
      stats: {
        totalMembers,
        totalBannedAccounts,
        totalServers,
        totalChannels,
        totalMessages,
        totalDirectMessages,
        activeMembers,
      },
    });
  } catch (err) {
    console.error('GET /admin/stats error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/users/search', adminAuth, (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.json({ users: [] });
    }

    const users = db.all(
      `SELECT u.id, u.username, u.display_name, u.email, u.created_at,
              ab.user_id IS NOT NULL AS is_banned,
              ab.reason AS ban_reason,
              ab.banned_at
       FROM users u
       LEFT JOIN admin_bans ab ON ab.user_id = u.id
       WHERE u.username LIKE ?
          OR COALESCE(u.display_name, '') LIKE ?
          OR u.email LIKE ?
       ORDER BY u.created_at DESC
       LIMIT 50`,
      [`%${q}%`, `%${q}%`, `%${q}%`]
    );

    res.json({ users: users.map((u) => ({ ...u, is_banned: Number(u.is_banned) === 1 })) });
  } catch (err) {
    console.error('GET /admin/users/search error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/bans', adminAuth, (req, res) => {
  try {
    const bans = db.all(
      `SELECT ab.user_id, ab.banned_by, ab.reason, ab.banned_at,
              u.username, u.display_name, u.email
       FROM admin_bans ab
       INNER JOIN users u ON u.id = ab.user_id
       ORDER BY ab.banned_at DESC`
    );
    res.json({ bans });
  } catch (err) {
    console.error('GET /admin/bans error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/bans/:userId', adminAuth, (req, res) => {
  try {
    const { userId } = req.params;
    const reason = (req.body?.reason || '').trim() || null;

    const user = db.get('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    db.run(
      `INSERT INTO admin_bans (user_id, banned_by, reason, banned_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         banned_by = excluded.banned_by,
         reason = excluded.reason,
         banned_at = CURRENT_TIMESTAMP`,
      [userId, req.admin.login, reason]
    );

    res.json({ message: 'Utilisateur banni globalement' });
  } catch (err) {
    console.error('POST /admin/bans/:userId error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/bans/:userId', adminAuth, (req, res) => {
  try {
    const { userId } = req.params;
    db.run('DELETE FROM admin_bans WHERE user_id = ?', [userId]);
    res.json({ message: 'Utilisateur débanni' });
  } catch (err) {
    console.error('DELETE /admin/bans/:userId error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ═══ IP BANS ═══

/**
 * GET /api/admin/ip-bans
 * Lister les IPs bannies
 */
router.get('/ip-bans', adminAuth, (req, res) => {
  try {
    const bans = db.all(
      `SELECT ip_address, banned_by, reason, banned_at
       FROM ip_bans
       ORDER BY banned_at DESC
       LIMIT 100`
    );
    res.json({ bans });
  } catch (err) {
    console.error('GET /admin/ip-bans error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/admin/ip-bans
 * Bannir une IP
 */
router.post('/ip-bans', adminAuth, (req, res) => {
  try {
    const { ip_address, reason } = req.body;
    if (!ip_address || !ip_address.trim()) {
      return res.status(400).json({ error: 'Adresse IP requise' });
    }

    const existing = db.get('SELECT * FROM ip_bans WHERE ip_address = ?', [ip_address.trim()]);
    if (existing) {
      return res.status(400).json({ error: 'Cette IP est déjà bannie' });
    }

    db.run(
      `INSERT INTO ip_bans (ip_address, banned_by, reason, banned_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [ip_address.trim(), req.admin.login, (reason || '').trim() || null]
    );

    res.json({ message: 'IP bannie' });
  } catch (err) {
    console.error('POST /admin/ip-bans error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * DELETE /api/admin/ip-bans/:ipAddress
 * Débannir une IP
 */
router.delete('/ip-bans/:ipAddress', adminAuth, (req, res) => {
  try {
    const { ipAddress } = req.params;
    const ip = decodeURIComponent(ipAddress);
    db.run('DELETE FROM ip_bans WHERE ip_address = ?', [ip]);
    res.json({ message: 'IP débannnie' });
  } catch (err) {
    console.error('DELETE /admin/ip-bans error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ═══ ACCESS LOGS ═══

/**
 * GET /api/admin/logs
 * Lister les logs d'accès (filtrable)
 */
router.get('/logs', adminAuth, (req, res) => {
  try {
    const { filter = '', limit = 100 } = req.query;
    let query = `SELECT * FROM access_logs`;
    let params = [];

    if (filter && filter.trim()) {
      query += ` WHERE ip_address LIKE ? OR action LIKE ? OR endpoint LIKE ?`;
      const pattern = `%${filter.trim()}%`;
      params = [pattern, pattern, pattern];
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(Math.min(parseInt(limit) || 100, 1000));

    const logs = db.all(query, params);
    res.json({ logs });
  } catch (err) {
    console.error('GET /admin/logs error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * GET /api/admin/logs/stats
 * Statistiques des logs (IPs les plus actives, bloquées, etc.)
 */
router.get('/logs/stats', adminAuth, (req, res) => {
  try {
    const totalLogs = db.get('SELECT COUNT(*) AS count FROM access_logs')?.count || 0;
    const blockedCount = db.get('SELECT COUNT(*) AS count FROM access_logs WHERE blocked = 1')?.count || 0;
    const uniqueIps = db.get('SELECT COUNT(DISTINCT ip_address) AS count FROM access_logs')?.count || 0;
    
    const topBlocked = db.all(
      `SELECT ip_address, COUNT(*) AS attempts
       FROM access_logs
       WHERE blocked = 1
       GROUP BY ip_address
       ORDER BY attempts DESC
       LIMIT 10`
    );

    res.json({
      stats: {
        totalLogs,
        blockedCount,
        uniqueIps,
        topBlocked
      }
    });
  } catch (err) {
    console.error('GET /admin/logs/stats error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * GET /api/admin/users/:userId/ip
 * Récupère l'adresse IP la plus récente associée à un utilisateur
 * Cherche dans: 1) access_logs (si disponible), 2) Dernière tentative de login
 */
router.get('/users/:userId/ip', adminAuth, (req, res) => {
  try {
    const { userId } = req.params;

    // D'abord chercher dans les access_logs avec user_id (IPs d'accès API)
    const access = db.get(
      `SELECT ip_address FROM access_logs 
       WHERE user_id = ? AND ip_address IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (access) {
      return res.json({ ip_address: access.ip_address });
    }

    // Fallback: dernière IP connue stockée sur le compte utilisateur
    const user = db.get('SELECT last_ip FROM users WHERE id = ?', [userId]);
    if (user?.last_ip) {
      return res.json({ ip_address: user.last_ip });
    }

    // Si pas trouvé, on ne peut pas bannir sans IP
    return res.status(400).json({ 
      error: 'Aucune IP trouvée pour cet utilisateur. L\'utilisateur doit d\'abord accéder au système.'
    });
  } catch (err) {
    console.error('GET /admin/users/:userId/ip error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/admin/ban-user-ip/:userId
 * Bannit un utilisateur en bannissant son adresse IP la plus récente
 */
router.post('/ban-user-ip/:userId', adminAuth, (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body || {};

    // Récupérer l'IP la plus récente de l'utilisateur (même logique que GET)
    const access = db.get(
      `SELECT ip_address FROM access_logs 
       WHERE user_id = ? AND ip_address IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    const userWithIp = db.get('SELECT last_ip FROM users WHERE id = ?', [userId]);
    const ipAddress = access?.ip_address || userWithIp?.last_ip;

    if (!ipAddress) {
      return res.status(400).json({ 
        error: 'Aucune IP trouvée pour cet utilisateur. L\'utilisateur doit d\'abord accéder au système.'
      });
    }

    // Vérifier si l'IP est déjà bannie
    const existingBan = db.get('SELECT * FROM ip_bans WHERE ip_address = ?', [ipAddress]);
    if (existingBan) {
      return res.status(400).json({ error: `Cette IP (${ipAddress}) est déjà bannie` });
    }

    // Récupérer l'ID ou le login de l'utilisateur pour la raison
    const user = db.get('SELECT id, username FROM users WHERE id = ?', [userId]);
    const userInfo = user ? user.username : `ID:${userId}`;

    // Bannir l'IP
    db.run(
      `INSERT INTO ip_bans (ip_address, banned_by, reason, banned_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [
        ipAddress, 
        req.adminLogin, 
        (reason || `Bannissement de l'utilisateur ${userInfo}`)
      ]
    );

    res.json({ 
      message: `IP bannie avec succès (${ipAddress}) - Utilisateur: ${userInfo}`,
      ip_address: ipAddress,
      user_info: userInfo
    });
  } catch (err) {
    console.error('POST /admin/ban-user-ip/:userId error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
