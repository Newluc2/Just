/**
 * Just - Point d'entrée du serveur backend
 * 
 * Ce fichier initialise Express, Socket.io et connecte tous les modules.
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');

// Import des routes
const authRoutes = require('./routes/auth');
const serverRoutes = require('./routes/servers');
const channelRoutes = require('./routes/channels');
const messageRoutes = require('./routes/messages');
const dmRoutes = require('./routes/dm');
const inviteRoutes = require('./routes/invites');

// Import de la base de données et du handler Socket.io
const db = require('./database/db');
const setupSocket = require('./socket/socketHandler');

const app = express();
const server = http.createServer(app);

// Déterminer les origines autorisées pour le CORS
// Supporte une liste séparée par des virgules dans CLIENT_URL
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

function isLocalNetworkOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/i.test(origin);
}

function corsOriginValidator(origin, callback) {
  if (!origin) {
    callback(null, true);
    return;
  }

  if (allowedOrigins.includes(origin) || isLocalNetworkOrigin(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error('Not allowed by CORS'));
}

// Configuration de Socket.io avec CORS
const io = new Server(server, {
  cors: {
    origin: corsOriginValidator,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});

// Middlewares globaux
app.use(cors({
  origin: corsOriginValidator,
  credentials: true,
}));
app.use(express.json());

// Dossier pour les uploads (avatars, etc.)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/dm', dmRoutes);
app.use('/api/invites', inviteRoutes);

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Just backend is running!' });
});

// Démarrage asynchrone pour initialiser la DB (sql.js est async)
async function start() {
  await db.initialize();
  
  // Configurer Socket.io
  setupSocket(io);
  
  // Démarrage du serveur (0.0.0.0 pour être accessible dans Docker)
  const PORT = process.env.PORT || 5001;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Just backend running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
