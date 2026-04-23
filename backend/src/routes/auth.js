/**
 * Just - Routes d'authentification
 * 
 * Gère l'inscription, la connexion et la récupération du profil
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');
const { getClientIp, logAccess } = require('../middleware/ipBan');

const router = express.Router();

// ── Multer pour avatar ─────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${req.user.id}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (!allowed.test(file.originalname)) return cb(new Error('Type de fichier non autorisé'));
    cb(null, true);
  },
});

/**
 * POST /api/auth/register
 * Inscription d'un nouvel utilisateur
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, display_name: displayName } = req.body;

    // Validation des champs
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    if (username.length < 3 || username.length > 32) {
      return res.status(400).json({ error: 'Le nom d\'utilisateur doit faire entre 3 et 32 caractères' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
    }

    // Vérifier si l'utilisateur existe déjà
    const existingUser = db.get('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (existingUser) {
      return res.status(400).json({ error: 'Cet email ou nom d\'utilisateur est déjà utilisé' });
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // Insérer l'utilisateur en base
    db.run('INSERT INTO users (id, username, email, password, display_name) VALUES (?, ?, ?, ?, ?)',
      [userId, username, email, hashedPassword, displayName?.trim() || null]);

    // Générer un token JWT
    const token = jwt.sign(
      { id: userId, username, email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: { id: userId, username, email, avatar: null, display_name: null, status: 'online' },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/auth/login
 * Connexion d'un utilisateur existant
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    // Chercher l'utilisateur par email
    const user = db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const globalBan = db.get('SELECT user_id FROM admin_bans WHERE user_id = ?', [user.id]);
    if (globalBan) {
      return res.status(403).json({ error: 'Votre compte a été banni par un administrateur.' });
    }

    // Vérifier le mot de passe
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    // Générer un token JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const clientIp = getClientIp(req);
    db.run('UPDATE users SET last_ip = ? WHERE id = ?', [clientIp, user.id]);
    logAccess(clientIp, 'login_success', 'POST /api/auth/login', user.id, false);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        display_name: user.display_name || null,
        status: 'online',
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * GET /api/auth/me
 * Récupérer le profil de l'utilisateur connecté
 */
router.get('/me', authMiddleware, (req, res) => {
  try {
    const user = db.get('SELECT id, username, email, avatar, display_name, status, created_at FROM users WHERE id = ?',
      [req.user.id]);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({ user });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * PUT /api/auth/profile
 * Mettre à jour le profil (username, email) ou le mot de passe
 */
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { username, email, currentPassword, newPassword, display_name: displayName } = req.body;
    const userId = req.user.id;

    const user = db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Changement de mot de passe
    if (currentPassword && newPassword) {
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
      }
      const hash = await bcrypt.hash(newPassword, 10);
      db.run('UPDATE users SET password = ? WHERE id = ?', [hash, userId]);
      return res.json({ message: 'Mot de passe modifié' });
    }

    // Mise à jour du profil
    if (username) {
      // Vérifier l'unicité
      const existing = db.get('SELECT id FROM users WHERE username = ? AND id != ?', [username, userId]);
      if (existing) {
        return res.status(400).json({ error: 'Ce nom d\'utilisateur est déjà pris' });
      }
    }

    if (email) {
      const existingEmail = db.get('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
      if (existingEmail) {
        return res.status(400).json({ error: 'Cet email est déjà utilisé' });
      }
    }

    const updates = [];
    const params = [];

    if (username !== undefined) {
      updates.push('username = ?');
      params.push((username || '').trim() || user.username);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push((email || '').trim() || user.email);
    }
    if (displayName !== undefined) {
      updates.push('display_name = ?');
      params.push((displayName || '').trim() || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Aucune modification fournie' });
    }

    params.push(userId);

    db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    const updated = db.get(
      'SELECT id, username, email, avatar, display_name, status, created_at FROM users WHERE id = ?',
      [userId]
    );

    res.json({ user: updated });
  } catch (err) {
    console.error('PUT /auth/profile error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/auth/avatar
 * Upload d'un avatar utilisateur
 */
router.post('/avatar', authMiddleware, avatarUpload.single('avatar'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
    const avatarUrl = `/uploads/${req.file.filename}`;
    db.run('UPDATE users SET avatar = ? WHERE id = ?', [avatarUrl, req.user.id]);
    const updated = db.get(
      'SELECT id, username, email, avatar, display_name, status, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json({ user: updated });
  } catch (err) {
    console.error('POST /auth/avatar error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
