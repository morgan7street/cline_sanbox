// Serveur MCP de base pour l'intégration de Cline
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const winston = require('winston');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Charger les variables d'environnement
dotenv.config();

// Configuration du logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'cline-mcp-base' },
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

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Définition des outils MCP
const tools = {
  // Outil pour lire un fichier
  readFile: {
    description: "Lit le contenu d'un fichier",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Chemin du fichier à lire"
        }
      },
      required: ["path"]
    },
    handler: async (params) => {
      try {
        const filePath = params.path;
        // Vérifier que le chemin est sécurisé (pas de traversée de répertoire)
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath.includes('..')) {
          throw new Error('Chemin non sécurisé');
        }
        
        // Lire le fichier
        const content = await fs.promises.readFile(normalizedPath, 'utf8');
        return { success: true, content };
      } catch (error) {
        logger.error('Erreur lors de la lecture du fichier', { error: error.message, params });
        return { success: false, error: error.message };
      }
    }
  },
  
  // Outil pour écrire dans un fichier
  writeFile: {
    description: "Écrit du contenu dans un fichier",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Chemin du fichier à écrire"
        },
        content: {
          type: "string",
          description: "Contenu à écrire dans le fichier"
        }
      },
      required: ["path", "content"]
    },
    handler: async (params) => {
      try {
        const { path: filePath, content } = params;
        // Vérifier que le chemin est sécurisé (pas de traversée de répertoire)
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath.includes('..')) {
          throw new Error('Chemin non sécurisé');
        }
        
        // Créer le répertoire parent si nécessaire
        await fs.promises.mkdir(path.dirname(normalizedPath), { recursive: true });
        
        // Écrire dans le fichier
        await fs.promises.writeFile(normalizedPath, content);
        return { success: true };
      } catch (error) {
        logger.error('Erreur lors de l\'écriture dans le fichier', { error: error.message, params });
        return { success: false, error: error.message };
      }
    }
  },
  
  // Outil pour exécuter une commande shell
  executeCommand: {
    description: "Exécute une commande shell",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Commande à exécuter"
        }
      },
      required: ["command"]
    },
    handler: async (params) => {
      try {
        const { command } = params;
        // Vérifier que la commande est sécurisée (liste blanche)
        const allowedCommands = ['ls', 'pwd', 'echo', 'cat', 'grep', 'find'];
        const commandName = command.split(' ')[0];
        
        if (!allowedCommands.includes(commandName)) {
          throw new Error('Commande non autorisée');
        }
        
        // Exécuter la commande
        const { exec } = require('child_process');
        const output = await new Promise((resolve, reject) => {
          exec(command, (error, stdout, stderr) => {
            if (error) {
              reject(error);
            } else {
              resolve(stdout);
            }
          });
        });
        
        return { success: true, output };
      } catch (error) {
        logger.error('Erreur lors de l\'exécution de la commande', { error: error.message, params });
        return { success: false, error: error.message };
      }
    }
  },
  
  // Outil pour rechercher des fichiers
  findFiles: {
    description: "Recherche des fichiers correspondant à un motif",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Motif de recherche (glob)"
        },
        directory: {
          type: "string",
          description: "Répertoire de départ pour la recherche"
        }
      },
      required: ["pattern", "directory"]
    },
    handler: async (params) => {
      try {
        const { pattern, directory } = params;
        // Vérifier que le répertoire est sécurisé (pas de traversée de répertoire)
        const normalizedDir = path.normalize(directory);
        if (normalizedDir.includes('..')) {
          throw new Error('Chemin non sécurisé');
        }
        
        // Rechercher les fichiers
        const glob = require('glob');
        const files = await new Promise((resolve, reject) => {
          glob(pattern, { cwd: normalizedDir }, (error, matches) => {
            if (error) {
              reject(error);
            } else {
              resolve(matches);
            }
          });
        });
        
        return { success: true, files };
      } catch (error) {
        logger.error('Erreur lors de la recherche de fichiers', { error: error.message, params });
        return { success: false, error: error.message };
      }
    }
  }
};

// Route pour obtenir la liste des outils disponibles
app.get('/tools', (req, res) => {
  const toolsInfo = Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    parameters: tool.parameters
  }));
  
  res.json(toolsInfo);
});

// Route pour exécuter un outil
app.post('/tools/:name', async (req, res) => {
  const { name } = req.params;
  const params = req.body;
  
  // Vérifier que l'outil existe
  if (!tools[name]) {
    return res.status(404).json({ error: 'Outil non trouvé' });
  }
  
  try {
    // Exécuter l'outil
    const result = await tools[name].handler(params);
    res.json(result);
  } catch (error) {
    logger.error('Erreur lors de l\'exécution de l\'outil', { error: error.message, tool: name, params });
    res.status(500).json({ error: error.message });
  }
});

// Route pour le statut du serveur MCP
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    tools: Object.keys(tools)
  });
});

// Démarrer le serveur
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  logger.info(`Serveur MCP démarré sur le port ${PORT}`);
});

module.exports = app;
