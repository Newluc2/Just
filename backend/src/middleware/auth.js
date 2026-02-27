/**
 * Just - Middleware d'authentification JWT
 * 
 * Vérifie le token JWT dans le header Authorization
 * et attache les infos utilisateur à req.user
 */

const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  // Récupérer le token du header Authorization
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant ou invalide' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Vérifier et décoder le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, username, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token expiré ou invalide' });
  }
}

module.exports = authMiddleware;
