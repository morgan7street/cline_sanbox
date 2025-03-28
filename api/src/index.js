const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const socketIo = require('socket.io');
const http = require('http');
const winston = require('winston');
const Docker = require('dockerode');
const jwt = require('jsonwebtoken');
const fs = require('fs-extra');
const path = require('path');
const dotenv = require('dotenv');

// Charger les variables d'environnement
dotenv.config();

// Configuration du logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'cline-sandbox-api' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Initialisation de l'application Express
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Middleware d'authentification
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token == null) return res.sendStatus(401);
  
  jwt.verify(token, process.env.JWT_SECRET || 'default_secret', (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Initialisation de Docker
const docker = new Docker({
  socketPath: '/var/run/docker.sock'
});

// Routes API

// Statut de l'API
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Authentification
app.post('/api/auth', (req, res) => {
  const { username, password } = req.body;
  
  // Dans un environnement de production, vérifiez les identifiants dans une base de données
  if (username === 'admin' && password === 'password') {
    const user = { username };
    const token = jwt.sign(user, process.env.JWT_SECRET || 'default_secret', { expiresIn: '1h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Identifiants invalides' });
  }
});

// Gestion des conteneurs

// Lister les conteneurs
app.get('/api/containers', authenticateToken, async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    res.json(containers);
  } catch (error) {
    logger.error('Erreur lors de la récupération des conteneurs', { error });
    res.status(500).json({ error: 'Erreur lors de la récupération des conteneurs' });
  }
});

// Créer un conteneur
app.post('/api/containers', authenticateToken, async (req, res) => {
  try {
    const { name, image, ports, env } = req.body;
    
    // Vérifier les paramètres
    if (!name || !image) {
      return res.status(400).json({ error: 'Nom et image requis' });
    }
    
    // Créer le conteneur
    const container = await docker.createContainer({
      Image: image,
      name,
      ExposedPorts: ports ? ports.reduce((acc, port) => {
        acc[`${port}/tcp`] = {};
        return acc;
      }, {}) : {},
      Env: env ? Object.entries(env).map(([key, value]) => `${key}=${value}`) : [],
      HostConfig: {
        PortBindings: ports ? ports.reduce((acc, port) => {
          acc[`${port}/tcp`] = [{ HostPort: port.toString() }];
          return acc;
        }, {}) : {},
        RestartPolicy: {
          Name: 'unless-stopped'
        }
      }
    });
    
    // Démarrer le conteneur
    await container.start();
    
    res.json({ id: container.id, name });
  } catch (error) {
    logger.error('Erreur lors de la création du conteneur', { error });
    res.status(500).json({ error: 'Erreur lors de la création du conteneur' });
  }
});

// Démarrer un conteneur
app.post('/api/containers/:id/start', authenticateToken, async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.start();
    res.json({ status: 'started' });
  } catch (error) {
    logger.error('Erreur lors du démarrage du conteneur', { error });
    res.status(500).json({ error: 'Erreur lors du démarrage du conteneur' });
  }
});

// Arrêter un conteneur
app.post('/api/containers/:id/stop', authenticateToken, async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.stop();
    res.json({ status: 'stopped' });
  } catch (error) {
    logger.error('Erreur lors de l\'arrêt du conteneur', { error });
    res.status(500).json({ error: 'Erreur lors de l\'arrêt du conteneur' });
  }
});

// Supprimer un conteneur
app.delete('/api/containers/:id', authenticateToken, async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.remove({ force: true });
    res.json({ status: 'removed' });
  } catch (error) {
    logger.error('Erreur lors de la suppression du conteneur', { error });
    res.status(500).json({ error: 'Erreur lors de la suppression du conteneur' });
  }
});

// Gestion des fichiers

// Lister les fichiers
app.get('/api/files', authenticateToken, async (req, res) => {
  try {
    const { dir = '/home/clineuser/workspace' } = req.query;
    const files = await fs.readdir(dir);
    const fileStats = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          path: filePath,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          modified: stats.mtime
        };
      })
    );
    res.json(fileStats);
  } catch (error) {
    logger.error('Erreur lors de la récupération des fichiers', { error });
    res.status(500).json({ error: 'Erreur lors de la récupération des fichiers' });
  }
});

// Lire un fichier
app.get('/api/files/read', authenticateToken, async (req, res) => {
  try {
    const { path: filePath } = req.query;
    
    if (!filePath) {
      return res.status(400).json({ error: 'Chemin du fichier requis' });
    }
    
    const content = await fs.readFile(filePath, 'utf8');
    res.json({ content });
  } catch (error) {
    logger.error('Erreur lors de la lecture du fichier', { error });
    res.status(500).json({ error: 'Erreur lors de la lecture du fichier' });
  }
});

// Écrire un fichier
app.post('/api/files/write', authenticateToken, async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: 'Chemin et contenu du fichier requis' });
    }
    
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content);
    res.json({ status: 'written' });
  } catch (error) {
    logger.error('Erreur lors de l\'écriture du fichier', { error });
    res.status(500).json({ error: 'Erreur lors de l\'écriture du fichier' });
  }
});

// Supprimer un fichier
app.delete('/api/files', authenticateToken, async (req, res) => {
  try {
    const { path: filePath } = req.query;
    
    if (!filePath) {
      return res.status(400).json({ error: 'Chemin du fichier requis' });
    }
    
    await fs.remove(filePath);
    res.json({ status: 'removed' });
  } catch (error) {
    logger.error('Erreur lors de la suppression du fichier', { error });
    res.status(500).json({ error: 'Erreur lors de la suppression du fichier' });
  }
});

// Gestion des serveurs MCP

// Lister les serveurs MCP
app.get('/api/mcp/servers', authenticateToken, async (req, res) => {
  try {
    const mcpDir = '/home/clineuser/.cline/mcp';
    const servers = await fs.readdir(mcpDir);
    const serverDetails = await Promise.all(
      servers.map(async (server) => {
        const serverPath = path.join(mcpDir, server);
        const stats = await fs.stat(serverPath);
        const configPath = path.join(serverPath, '.clinerules');
        let config = {};
        
        if (await fs.pathExists(configPath)) {
          try {
            config = JSON.parse(await fs.readFile(configPath, 'utf8'));
          } catch (e) {
            logger.warn(`Erreur lors de la lecture de la configuration MCP pour ${server}`, { error: e });
          }
        }
        
        return {
          name: server,
          path: serverPath,
          isDirectory: stats.isDirectory(),
          modified: stats.mtime,
          config
        };
      })
    );
    res.json(serverDetails);
  } catch (error) {
    logger.error('Erreur lors de la récupération des serveurs MCP', { error });
    res.status(500).json({ error: 'Erreur lors de la récupération des serveurs MCP' });
  }
});

// Installer un serveur MCP
app.post('/api/mcp/servers', authenticateToken, async (req, res) => {
  try {
    const { name, gitUrl } = req.body;
    
    if (!name || !gitUrl) {
      return res.status(400).json({ error: 'Nom et URL Git requis' });
    }
    
    const mcpDir = '/home/clineuser/.cline/mcp';
    const serverPath = path.join(mcpDir, name);
    
    // Vérifier si le serveur existe déjà
    if (await fs.pathExists(serverPath)) {
      return res.status(400).json({ error: 'Le serveur MCP existe déjà' });
    }
    
    // Cloner le dépôt Git
    const { exec } = require('child_process');
    await new Promise((resolve, reject) => {
      exec(`git clone ${gitUrl} ${serverPath}`, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    
    // Installer les dépendances
    await new Promise((resolve, reject) => {
      exec(`cd ${serverPath} && npm install`, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    
    res.json({ status: 'installed', name, path: serverPath });
  } catch (error) {
    logger.error('Erreur lors de l\'installation du serveur MCP', { error });
    res.status(500).json({ error: 'Erreur lors de l\'installation du serveur MCP' });
  }
});

// Supprimer un serveur MCP
app.delete('/api/mcp/servers/:name', authenticateToken, async (req, res) => {
  try {
    const { name } = req.params;
    const mcpDir = '/home/clineuser/.cline/mcp';
    const serverPath = path.join(mcpDir, name);
    
    // Vérifier si le serveur existe
    if (!await fs.pathExists(serverPath)) {
      return res.status(404).json({ error: 'Serveur MCP non trouvé' });
    }
    
    // Supprimer le serveur
    await fs.remove(serverPath);
    
    res.json({ status: 'removed', name });
  } catch (error) {
    logger.error('Erreur lors de la suppression du serveur MCP', { error });
    res.status(500).json({ error: 'Erreur lors de la suppression du serveur MCP' });
  }
});

// WebSockets pour la communication en temps réel
io.on('connection', (socket) => {
  logger.info('Nouvelle connexion WebSocket', { id: socket.id });
  
  // Authentification WebSocket
  socket.on('authenticate', (token) => {
    jwt.verify(token, process.env.JWT_SECRET || 'default_secret', (err, user) => {
      if (err) {
        socket.emit('authentication_error', { error: 'Token invalide' });
      } else {
        socket.user = user;
        socket.emit('authenticated', { user });
        logger.info('Client WebSocket authentifié', { id: socket.id, user: user.username });
      }
    });
  });
  
  // Écouter les événements du conteneur
  socket.on('subscribe_container', async (containerId) => {
    if (!socket.user) {
      return socket.emit('error', { error: 'Non authentifié' });
    }
    
    try {
      const container = docker.getContainer(containerId);
      const stream = await container.attach({ stream: true, stdout: true, stderr: true });
      
      stream.on('data', (chunk) => {
        socket.emit('container_output', { containerId, output: chunk.toString() });
      });
      
      socket.on('disconnect', () => {
        stream.destroy();
      });
    } catch (error) {
      logger.error('Erreur lors de l\'attachement au conteneur', { error, containerId });
      socket.emit('error', { error: 'Erreur lors de l\'attachement au conteneur' });
    }
  });
  
  // Exécuter une commande dans le conteneur
  socket.on('execute_command', async ({ containerId, command }) => {
    if (!socket.user) {
      return socket.emit('error', { error: 'Non authentifié' });
    }
    
    try {
      const container = docker.getContainer(containerId);
      const exec = await container.exec({
        Cmd: ['sh', '-c', command],
        AttachStdout: true,
        AttachStderr: true
      });
      
      const stream = await exec.start();
      
      stream.on('data', (chunk) => {
        socket.emit('command_output', { containerId, command, output: chunk.toString() });
      });
      
      stream.on('end', async () => {
        const execInspect = await exec.inspect();
        socket.emit('command_completed', { containerId, command, exitCode: execInspect.ExitCode });
      });
    } catch (error) {
      logger.error('Erreur lors de l\'exécution de la commande', { error, containerId, command });
      socket.emit('error', { error: 'Erreur lors de l\'exécution de la commande' });
    }
  });
  
  // Déconnexion
  socket.on('disconnect', () => {
    logger.info('Déconnexion WebSocket', { id: socket.id });
  });
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Serveur démarré sur le port ${PORT}`);
});

module.exports = app;
