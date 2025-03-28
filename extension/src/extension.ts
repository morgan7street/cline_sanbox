import * as vscode from 'vscode';
import axios from 'axios';
import * as socketIo from 'socket.io-client';
import * as fs from 'fs';
import * as path from 'path';

// Interfaces
interface SandboxConfig {
  apiUrl: string;
  autoStart: boolean;
  resourceLimits: {
    cpu: number;
    memory: number;
  };
  permissions: {
    fileAccess: 'prompt' | 'allow' | 'deny';
    terminalAccess: 'prompt' | 'allow' | 'deny';
    networkAccess: 'prompt' | 'allow' | 'deny';
  };
}

interface ContainerInfo {
  id: string;
  name: string;
  status: string;
}

interface MCPServer {
  name: string;
  path: string;
  isDirectory: boolean;
  modified: Date;
  config: any;
}

interface Checkpoint {
  id: string;
  name: string;
  date: Date;
  containerId: string;
}

// État global
let apiClient: axios.AxiosInstance;
let socket: any;
let statusBarItem: vscode.StatusBarItem;
let sandboxContainer: ContainerInfo | null = null;
let authToken: string | null = null;

// Activation de l'extension
export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "cline-sandbox" est maintenant active');

  // Créer l'élément de barre d'état
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = "$(debug-disconnect) Cline Sandbox";
  statusBarItem.tooltip = "Cline Sandbox n'est pas démarrée";
  statusBarItem.command = 'cline-sandbox.start';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Initialiser le client API
  const config = getConfiguration();
  apiClient = axios.create({
    baseURL: config.apiUrl,
    timeout: 10000,
  });

  // Enregistrer les commandes
  context.subscriptions.push(
    vscode.commands.registerCommand('cline-sandbox.start', startSandbox),
    vscode.commands.registerCommand('cline-sandbox.stop', stopSandbox),
    vscode.commands.registerCommand('cline-sandbox.restart', restartSandbox),
    vscode.commands.registerCommand('cline-sandbox.openTerminal', openSandboxTerminal),
    vscode.commands.registerCommand('cline-sandbox.installMCP', installMCPServer),
    vscode.commands.registerCommand('cline-sandbox.createCheckpoint', createCheckpoint),
    vscode.commands.registerCommand('cline-sandbox.restoreCheckpoint', restoreCheckpoint)
  );

  // Démarrage automatique si configuré
  if (config.autoStart) {
    startSandbox();
  }
}

// Désactivation de l'extension
export function deactivate() {
  // Fermer la connexion WebSocket
  if (socket) {
    socket.disconnect();
  }

  // Arrêter le conteneur si nécessaire
  if (sandboxContainer) {
    stopSandbox();
  }
}

// Obtenir la configuration
function getConfiguration(): SandboxConfig {
  const config = vscode.workspace.getConfiguration('cline-sandbox');
  return {
    apiUrl: config.get<string>('apiUrl') || 'http://localhost:3000',
    autoStart: config.get<boolean>('autoStart') || false,
    resourceLimits: config.get<{cpu: number, memory: number}>('resourceLimits') || {cpu: 2, memory: 4},
    permissions: config.get<{fileAccess: 'prompt' | 'allow' | 'deny', terminalAccess: 'prompt' | 'allow' | 'deny', networkAccess: 'prompt' | 'allow' | 'deny'}>('permissions') || {
      fileAccess: 'prompt',
      terminalAccess: 'prompt',
      networkAccess: 'prompt'
    }
  };
}

// Authentification à l'API
async function authenticate(): Promise<boolean> {
  try {
    // Dans un environnement de production, demander les identifiants à l'utilisateur
    const username = 'admin';
    const password = 'password';

    const response = await apiClient.post('/api/auth', { username, password });
    authToken = response.data.token;
    
    // Configurer le client API avec le token
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
    
    return true;
  } catch (error) {
    vscode.window.showErrorMessage('Erreur d\'authentification à l\'API Cline Sandbox');
    console.error('Erreur d\'authentification:', error);
    return false;
  }
}

// Démarrer la sandbox
async function startSandbox() {
  try {
    vscode.window.showInformationMessage('Démarrage de la sandbox Cline...');
    
    // Authentification
    if (!authToken) {
      const authenticated = await authenticate();
      if (!authenticated) {
        return;
      }
    }
    
    // Vérifier si le conteneur existe déjà
    const containers = await apiClient.get('/api/containers');
    const existingContainer = containers.data.find((c: any) => c.Names.some((n: string) => n === '/cline-sandbox'));
    
    if (existingContainer) {
      // Démarrer le conteneur existant s'il est arrêté
      if (existingContainer.State !== 'running') {
        await apiClient.post(`/api/containers/${existingContainer.Id}/start`);
      }
      
      sandboxContainer = {
        id: existingContainer.Id,
        name: 'cline-sandbox',
        status: 'running'
      };
    } else {
      // Créer un nouveau conteneur
      const config = getConfiguration();
      const response = await apiClient.post('/api/containers', {
        name: 'cline-sandbox',
        image: 'cline-sandbox:latest',
        ports: [3000, 8000, 8080],
        env: {
          NODE_ENV: 'development',
          CLINE_SANDBOX_MODE: 'true',
          MCP_SERVER_ENABLED: 'true'
        }
      });
      
      sandboxContainer = {
        id: response.data.id,
        name: 'cline-sandbox',
        status: 'running'
      };
    }
    
    // Mettre à jour la barre d'état
    statusBarItem.text = "$(debug-start) Cline Sandbox";
    statusBarItem.tooltip = "Cline Sandbox est en cours d'exécution";
    statusBarItem.command = 'cline-sandbox.stop';
    
    // Connecter au WebSocket
    connectWebSocket();
    
    vscode.window.showInformationMessage('Sandbox Cline démarrée avec succès');
  } catch (error) {
    vscode.window.showErrorMessage('Erreur lors du démarrage de la sandbox Cline');
    console.error('Erreur de démarrage:', error);
  }
}

// Arrêter la sandbox
async function stopSandbox() {
  try {
    if (!sandboxContainer) {
      vscode.window.showInformationMessage('Aucune sandbox Cline en cours d\'exécution');
      return;
    }
    
    vscode.window.showInformationMessage('Arrêt de la sandbox Cline...');
    
    // Arrêter le conteneur
    await apiClient.post(`/api/containers/${sandboxContainer.id}/stop`);
    
    // Mettre à jour la barre d'état
    statusBarItem.text = "$(debug-disconnect) Cline Sandbox";
    statusBarItem.tooltip = "Cline Sandbox n'est pas démarrée";
    statusBarItem.command = 'cline-sandbox.start';
    
    // Déconnecter le WebSocket
    if (socket) {
      socket.disconnect();
    }
    
    sandboxContainer = null;
    
    vscode.window.showInformationMessage('Sandbox Cline arrêtée avec succès');
  } catch (error) {
    vscode.window.showErrorMessage('Erreur lors de l\'arrêt de la sandbox Cline');
    console.error('Erreur d\'arrêt:', error);
  }
}

// Redémarrer la sandbox
async function restartSandbox() {
  await stopSandbox();
  await startSandbox();
}

// Ouvrir un terminal dans la sandbox
async function openSandboxTerminal() {
  try {
    if (!sandboxContainer) {
      vscode.window.showInformationMessage('Aucune sandbox Cline en cours d\'exécution');
      return;
    }
    
    // Créer un terminal VS Code
    const terminal = vscode.window.createTerminal('Cline Sandbox');
    
    // Exécuter une commande pour se connecter au conteneur
    terminal.sendText(`docker exec -it ${sandboxContainer.id} /bin/bash`);
    terminal.show();
  } catch (error) {
    vscode.window.showErrorMessage('Erreur lors de l\'ouverture du terminal dans la sandbox Cline');
    console.error('Erreur de terminal:', error);
  }
}

// Installer un serveur MCP
async function installMCPServer() {
  try {
    if (!sandboxContainer) {
      vscode.window.showInformationMessage('Aucune sandbox Cline en cours d\'exécution');
      return;
    }
    
    // Demander l'URL du dépôt Git
    const gitUrl = await vscode.window.showInputBox({
      prompt: 'URL du dépôt Git du serveur MCP',
      placeHolder: 'https://github.com/exemple/mcp-server.git'
    });
    
    if (!gitUrl) {
      return;
    }
    
    // Extraire le nom du serveur à partir de l'URL
    const urlParts = gitUrl.split('/');
    let serverName = urlParts[urlParts.length - 1].replace('.git', '');
    
    // Demander confirmation du nom
    const confirmedName = await vscode.window.showInputBox({
      prompt: 'Nom du serveur MCP',
      value: serverName
    });
    
    if (!confirmedName) {
      return;
    }
    
    serverName = confirmedName;
    
    vscode.window.showInformationMessage(`Installation du serveur MCP ${serverName}...`);
    
    // Installer le serveur MCP
    await apiClient.post('/api/mcp/servers', {
      name: serverName,
      gitUrl
    });
    
    vscode.window.showInformationMessage(`Serveur MCP ${serverName} installé avec succès`);
  } catch (error) {
    vscode.window.showErrorMessage('Erreur lors de l\'installation du serveur MCP');
    console.error('Erreur d\'installation MCP:', error);
  }
}

// Créer un checkpoint
async function createCheckpoint() {
  try {
    if (!sandboxContainer) {
      vscode.window.showInformationMessage('Aucune sandbox Cline en cours d\'exécution');
      return;
    }
    
    // Demander le nom du checkpoint
    const checkpointName = await vscode.window.showInputBox({
      prompt: 'Nom du checkpoint',
      placeHolder: 'Checkpoint 1'
    });
    
    if (!checkpointName) {
      return;
    }
    
    vscode.window.showInformationMessage(`Création du checkpoint ${checkpointName}...`);
    
    // Créer un checkpoint (commit du conteneur)
    const response = await apiClient.post(`/api/containers/${sandboxContainer.id}/commit`, {
      name: `cline-sandbox-checkpoint-${Date.now()}`,
      tag: checkpointName
    });
    
    vscode.window.showInformationMessage(`Checkpoint ${checkpointName} créé avec succès`);
  } catch (error) {
    vscode.window.showErrorMessage('Erreur lors de la création du checkpoint');
    console.error('Erreur de création de checkpoint:', error);
  }
}

// Restaurer un checkpoint
async function restoreCheckpoint() {
  try {
    // Obtenir la liste des checkpoints
    const response = await apiClient.get('/api/images', {
      params: {
        filters: JSON.stringify({
          reference: ['cline-sandbox-checkpoint']
        })
      }
    });
    
    const checkpoints = response.data.map((image: any) => {
      const tags = image.RepoTags || [];
      return {
        id: image.Id,
        name: tags[0] ? tags[0].split(':')[1] : 'Sans nom',
        date: new Date(image.Created * 1000)
      };
    });
    
    if (checkpoints.length === 0) {
      vscode.window.showInformationMessage('Aucun checkpoint disponible');
      return;
    }
    
    // Demander à l'utilisateur de choisir un checkpoint
    const selectedCheckpoint = await vscode.window.showQuickPick(
      checkpoints.map(cp => ({
        label: cp.name,
        description: `Créé le ${cp.date.toLocaleString()}`,
        detail: cp.id,
        checkpoint: cp
      })),
      {
        placeHolder: 'Sélectionner un checkpoint à restaurer'
      }
    );
    
    if (!selectedCheckpoint) {
      return;
    }
    
    // Arrêter le conteneur actuel
    if (sandboxContainer) {
      await stopSandbox();
    }
    
    vscode.window.showInformationMessage(`Restauration du checkpoint ${selectedCheckpoint.label}...`);
    
    // Créer un nouveau conteneur à partir de l'image du checkpoint
    const newContainer = await apiClient.post('/api/containers', {
      name: 'cline-sandbox',
      image: `cline-sandbox-checkpoint:${selectedCheckpoint.label}`,
      ports: [3000, 8000, 8080],
      env: {
        NODE_ENV: 'development',
        CLINE_SANDBOX_MODE: 'true',
        MCP_SERVER_ENABLED: 'true'
      }
    });
    
    // Démarrer le nouveau conteneur
    await apiClient.post(`/api/containers/${newContainer.data.id}/start`);
    
    sandboxContainer = {
      id: newContainer.data.id,
      name: 'cline-sandbox',
      status: 'running'
    };
    
    // Mettre à jour la barre d'état
    statusBarItem.text = "$(debug-start) Cline Sandbox";
    statusBarItem.tooltip = "Cline Sandbox est en cours d'exécution";
    statusBarItem.command = 'cline-sandbox.stop';
    
    // Connecter au WebSocket
    connectWebSocket();
    
    vscode.window.showInformationMessage(`Checkpoint ${selectedCheckpoint.label} restauré avec succès`);
  } catch (error) {
    vscode.window.showErrorMessage('Erreur lors de la restauration du checkpoint');
    console.error('Erreur de restauration de checkpoint:', error);
  }
}

// Connecter au WebSocket
function connectWebSocket() {
  if (!authToken) {
    return;
  }
  
  const config = getConfiguration();
  socket = socketIo.io(config.apiUrl, {
    auth: {
      token: authToken
    }
  });
  
  socket.on('connect', () => {
    console.log('WebSocket connecté');
    socket.emit('authenticate', authToken);
  });
  
  socket.on('authenticated', (data: any) => {
    console.log('WebSocket authentifié', data);
    
    // S'abonner aux événements du conteneur
    if (sandboxContainer) {
      socket.emit('subscribe_container', sandboxContainer.id);
    }
  });
  
  socket.on('container_output', (data: any) => {
    console.log('Sortie du conteneur:', data);
    // Traiter la sortie du conteneur si nécessaire
  });
  
  socket.on('command_output', (data: any) => {
    console.log('Sortie de commande:', data);
    // Traiter la sortie de commande si nécessaire
  });
  
  socket.on('command_completed', (data: any) => {
    console.log('Commande terminée:', data);
    // Traiter la fin de commande si nécessaire
  });
  
  socket.on('error', (error: any) => {
    console.error('Erreur WebSocket:', error);
    vscode.window.showErrorMessage(`Erreur WebSocket: ${error.error}`);
  });
  
  socket.on('disconnect', () => {
    console.log('WebSocket déconnecté');
  });
}

// Vérifier les permissions
async function checkPermission(type: 'fileAccess' | 'terminalAccess' | 'networkAccess', resource: string): Promise<boolean> {
  const config = getConfiguration();
  const permission = config.permissions[type];
  
  if (permission === 'allow') {
    return true;
  }
  
  if (permission === 'deny') {
    return false;
  }
  
  // Si 'prompt', demander à l'utilisateur
  const action = type === 'fileAccess' ? 'accéder au fichier' :
                 type === 'terminalAccess' ? 'exécuter la commande' :
                 'accéder au réseau';
  
  const result = await vscode.window.showInformationMessage(
    `Cline demande la permission de ${action}: ${resource}`,
    'Autoriser',
    'Refuser'
  );
  
  return result === 'Autoriser';
}
