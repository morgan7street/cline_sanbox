// Module d'intégration de Cline dans la sandbox
const express = require('express');
const axios = require('axios');
const winston = require('winston');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Charger les variables d'environnement
dotenv.config();

// Configuration du logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'cline-integration' },
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

// Configuration de Cline
const CLINE_CONFIG = {
  // Chemin vers le répertoire .clinerules
  clinerules: path.join(process.env.HOME || '/home/clineuser', 'workspace', '.clinerules'),
  // URL du serveur MCP de base
  mcpBaseUrl: process.env.MCP_BASE_URL || 'http://localhost:8000',
  // Port pour le serveur d'intégration
  port: process.env.INTEGRATION_PORT || 8001
};

// Initialisation de l'application Express
const app = express();
app.use(express.json());

// Créer le répertoire .clinerules s'il n'existe pas
if (!fs.existsSync(CLINE_CONFIG.clinerules)) {
  fs.mkdirSync(CLINE_CONFIG.clinerules, { recursive: true });
  logger.info(`Répertoire .clinerules créé: ${CLINE_CONFIG.clinerules}`);
}

// Générer le fichier .clinerules/index.json
function generateClinerules() {
  const clinerules = {
    "name": "cline-sandbox-integration",
    "version": "1.0.0",
    "description": "Intégration de Cline dans un environnement sandbox",
    "tools": [
      {
        "name": "readFile",
        "description": "Lit le contenu d'un fichier",
        "parameters": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "Chemin du fichier à lire"
            }
          },
          "required": ["path"]
        },
        "endpoint": "/tools/readFile"
      },
      {
        "name": "writeFile",
        "description": "Écrit du contenu dans un fichier",
        "parameters": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "Chemin du fichier à écrire"
            },
            "content": {
              "type": "string",
              "description": "Contenu à écrire dans le fichier"
            }
          },
          "required": ["path", "content"]
        },
        "endpoint": "/tools/writeFile"
      },
      {
        "name": "executeCommand",
        "description": "Exécute une commande shell",
        "parameters": {
          "type": "object",
          "properties": {
            "command": {
              "type": "string",
              "description": "Commande à exécuter"
            }
          },
          "required": ["command"]
        },
        "endpoint": "/tools/executeCommand"
      },
      {
        "name": "findFiles",
        "description": "Recherche des fichiers correspondant à un motif",
        "parameters": {
          "type": "object",
          "properties": {
            "pattern": {
              "type": "string",
              "description": "Motif de recherche (glob)"
            },
            "directory": {
              "type": "string",
              "description": "Répertoire de départ pour la recherche"
            }
          },
          "required": ["pattern", "directory"]
        },
        "endpoint": "/tools/findFiles"
      },
      {
        "name": "browseWeb",
        "description": "Navigue sur le web et récupère le contenu d'une page",
        "parameters": {
          "type": "object",
          "properties": {
            "url": {
              "type": "string",
              "description": "URL de la page à visiter"
            }
          },
          "required": ["url"]
        },
        "endpoint": "/tools/browseWeb"
      },
      {
        "name": "installPackage",
        "description": "Installe un package npm ou pip",
        "parameters": {
          "type": "object",
          "properties": {
            "packageName": {
              "type": "string",
              "description": "Nom du package à installer"
            },
            "packageManager": {
              "type": "string",
              "description": "Gestionnaire de packages (npm ou pip)",
              "enum": ["npm", "pip"]
            }
          },
          "required": ["packageName", "packageManager"]
        },
        "endpoint": "/tools/installPackage"
      }
    ]
  };

  fs.writeFileSync(
    path.join(CLINE_CONFIG.clinerules, 'index.json'),
    JSON.stringify(clinerules, null, 2)
  );
  
  logger.info('Fichier .clinerules/index.json généré');
  return clinerules;
}

// Proxy pour les outils MCP de base
app.post('/tools/:name', async (req, res) => {
  const { name } = req.params;
  const params = req.body;
  
  try {
    logger.info(`Appel de l'outil ${name}`, { params });
    
    // Appeler le serveur MCP de base
    const response = await axios.post(`${CLINE_CONFIG.mcpBaseUrl}/tools/${name}`, params);
    
    // Journaliser et renvoyer le résultat
    logger.info(`Résultat de l'outil ${name}`, { result: response.data });
    res.json(response.data);
  } catch (error) {
    logger.error(`Erreur lors de l'appel de l'outil ${name}`, { error: error.message, params });
    res.status(500).json({ error: error.message });
  }
});

// Outil supplémentaire: browseWeb
app.post('/tools/browseWeb', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL requise' });
  }
  
  try {
    logger.info(`Navigation vers ${url}`);
    
    // Vérifier que l'URL est sécurisée (liste blanche de domaines)
    const allowedDomains = ['github.com', 'stackoverflow.com', 'developer.mozilla.org', 'docs.microsoft.com'];
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    const isDomainAllowed = allowedDomains.some(allowedDomain => domain.includes(allowedDomain));
    if (!isDomainAllowed) {
      throw new Error(`Domaine non autorisé: ${domain}`);
    }
    
    // Récupérer le contenu de la page
    const response = await axios.get(url);
    const content = response.data;
    
    // Simplifier le contenu HTML pour le rendre plus facile à traiter
    const simplifiedContent = content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    res.json({ success: true, content: simplifiedContent });
  } catch (error) {
    logger.error(`Erreur lors de la navigation vers ${url}`, { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Outil supplémentaire: installPackage
app.post('/tools/installPackage', async (req, res) => {
  const { packageName, packageManager } = req.body;
  
  if (!packageName || !packageManager) {
    return res.status(400).json({ error: 'Nom du package et gestionnaire de packages requis' });
  }
  
  try {
    logger.info(`Installation du package ${packageName} avec ${packageManager}`);
    
    // Vérifier que le package est sécurisé (pas de caractères spéciaux)
    if (!/^[a-zA-Z0-9\-_.]+$/.test(packageName)) {
      throw new Error(`Nom de package non sécurisé: ${packageName}`);
    }
    
    // Construire la commande d'installation
    let command;
    if (packageManager === 'npm') {
      command = `npm install --save ${packageName}`;
    } else if (packageManager === 'pip') {
      command = `pip install ${packageName}`;
    } else {
      throw new Error(`Gestionnaire de packages non supporté: ${packageManager}`);
    }
    
    // Appeler l'outil executeCommand du serveur MCP de base
    const response = await axios.post(`${CLINE_CONFIG.mcpBaseUrl}/tools/executeCommand`, {
      command
    });
    
    res.json({ success: true, output: response.data.output });
  } catch (error) {
    logger.error(`Erreur lors de l'installation du package ${packageName}`, { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Route pour le statut du serveur d'intégration
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    clinerules: CLINE_CONFIG.clinerules,
    mcpBaseUrl: CLINE_CONFIG.mcpBaseUrl
  });
});

// Générer le fichier .clinerules au démarrage
generateClinerules();

// Démarrer le serveur
const PORT = CLINE_CONFIG.port;
app.listen(PORT, () => {
  logger.info(`Serveur d'intégration Cline démarré sur le port ${PORT}`);
});

module.exports = app;
