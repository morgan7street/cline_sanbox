# Guide d'Utilisation : Sandbox pour l'Intégration de Cline

## Table des matières

1. [Introduction](#introduction)
2. [Prérequis](#prérequis)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Utilisation](#utilisation)
6. [Fonctionnalités](#fonctionnalités)
7. [Dépannage](#dépannage)
8. [FAQ](#faq)

## Introduction

Ce document explique comment utiliser la sandbox pour intégrer Cline, un agent de codage IA autonome pour VS Code. La sandbox fournit un environnement isolé et sécurisé où Cline peut exécuter des commandes, créer et modifier des fichiers, et utiliser des serveurs MCP (Model Context Protocol) pour étendre ses capacités.

### Qu'est-ce que Cline ?

Cline est un assistant IA qui peut utiliser votre interface en ligne de commande et votre éditeur. Il peut gérer des tâches complexes de développement logiciel étape par étape, avec des outils qui lui permettent de créer et modifier des fichiers, explorer de grands projets, utiliser le navigateur et exécuter des commandes de terminal (après votre autorisation).

### Pourquoi une sandbox ?

La sandbox offre plusieurs avantages :
- **Sécurité** : Isolation complète des actions de Cline
- **Contrôle** : Permissions granulaires pour les fichiers, commandes et accès réseau
- **Extensibilité** : Support complet du protocole MCP pour étendre les capacités
- **Intégration VS Code** : Interface utilisateur intuitive dans votre IDE

## Prérequis

Avant d'installer la sandbox Cline, assurez-vous que votre système répond aux exigences suivantes :

### Matériel
- Processeur : 2 cœurs minimum (4 recommandés)
- Mémoire : 4 Go RAM minimum (8 Go recommandés)
- Espace disque : 10 Go minimum

### Logiciels
- Système d'exploitation : Linux, macOS ou Windows avec WSL2
- Docker : version 20.10 ou supérieure
- Docker Compose : version 2.0 ou supérieure
- VS Code : version 1.60 ou supérieure
- Node.js : version 16.x ou supérieure

## Installation

### Étape 1 : Cloner le dépôt

```bash
git clone https://github.com/votre-organisation/cline-sandbox.git
cd cline-sandbox
```

### Étape 2 : Construire l'image Docker

```bash
cd docker
docker-compose build
```

### Étape 3 : Installer l'extension VS Code

Il existe deux méthodes pour installer l'extension VS Code :

#### Méthode 1 : Installation depuis le VSIX
```bash
cd extension
npm install
npm run package
code --install-extension cline-sandbox-1.0.0.vsix
```

#### Méthode 2 : Installation en mode développement
```bash
cd extension
npm install
code --extensionDevelopmentPath=/chemin/absolu/vers/extension
```

### Étape 4 : Démarrer l'API

```bash
cd api
npm install
npm start
```

## Configuration

### Configuration de la sandbox

La sandbox peut être configurée via le fichier `.env` à la racine du projet :

```
# Ports
API_PORT=3000
MCP_PORT=8000
WEB_PORT=8080

# Limites de ressources
CPU_LIMIT=2
MEMORY_LIMIT=4G

# Configuration de Cline
CLINE_API_KEY=votre_clé_api
MCP_SERVER_ENABLED=true
```

### Configuration de l'extension VS Code

L'extension VS Code peut être configurée via les paramètres VS Code :

1. Ouvrez VS Code
2. Accédez à Fichier > Préférences > Paramètres
3. Recherchez "Cline Sandbox"
4. Configurez les options suivantes :
   - `cline-sandbox.apiUrl` : URL de l'API (par défaut : http://localhost:3000)
   - `cline-sandbox.autoStart` : Démarrer automatiquement la sandbox au lancement de VS Code
   - `cline-sandbox.resourceLimits` : Limites de ressources pour la sandbox
   - `cline-sandbox.permissions` : Permissions pour la sandbox (prompt, allow, deny)

## Utilisation

### Démarrer la sandbox

1. Ouvrez VS Code
2. Appuyez sur `Ctrl+Shift+P` pour ouvrir la palette de commandes
3. Tapez "Cline Sandbox: Démarrer" et appuyez sur Entrée

Vous verrez un indicateur dans la barre d'état en bas de VS Code indiquant que la sandbox est en cours d'exécution.

### Utiliser Cline dans la sandbox

1. Ouvrez un projet dans VS Code
2. Appuyez sur `Ctrl+Shift+P` pour ouvrir la palette de commandes
3. Tapez "Cline: Open In New Tab" et appuyez sur Entrée
4. Cline s'ouvrira dans un nouvel onglet
5. Décrivez votre tâche à Cline

### Approuver les actions de Cline

Lorsque Cline demande à effectuer une action (lire/écrire un fichier, exécuter une commande), vous recevrez une notification pour approuver ou refuser l'action.

Vous pouvez configurer les permissions pour automatiser certaines approbations :
- `prompt` : Demander à chaque fois (par défaut)
- `allow` : Autoriser automatiquement
- `deny` : Refuser automatiquement

### Utiliser les serveurs MCP

Cline peut utiliser des serveurs MCP pour étendre ses capacités. La sandbox inclut plusieurs serveurs MCP préinstallés :

1. **readFile** : Lire le contenu d'un fichier
2. **writeFile** : Écrire du contenu dans un fichier
3. **executeCommand** : Exécuter une commande shell
4. **findFiles** : Rechercher des fichiers correspondant à un motif
5. **browseWeb** : Naviguer sur le web et récupérer le contenu d'une page
6. **installPackage** : Installer un package npm ou pip

Pour installer un nouveau serveur MCP :
1. Appuyez sur `Ctrl+Shift+P` pour ouvrir la palette de commandes
2. Tapez "Cline Sandbox: Installer un Serveur MCP" et appuyez sur Entrée
3. Entrez l'URL du dépôt Git du serveur MCP

### Créer et restaurer des checkpoints

Vous pouvez créer des checkpoints pour sauvegarder l'état de la sandbox :
1. Appuyez sur `Ctrl+Shift+P` pour ouvrir la palette de commandes
2. Tapez "Cline Sandbox: Créer un Checkpoint" et appuyez sur Entrée
3. Donnez un nom au checkpoint

Pour restaurer un checkpoint :
1. Appuyez sur `Ctrl+Shift+P` pour ouvrir la palette de commandes
2. Tapez "Cline Sandbox: Restaurer un Checkpoint" et appuyez sur Entrée
3. Sélectionnez le checkpoint à restaurer

## Fonctionnalités

### Gestion des fichiers

Cline peut créer, lire, modifier et supprimer des fichiers dans la sandbox. Toutes les modifications sont isolées dans l'environnement sandbox et ne peuvent affecter votre système hôte qu'après votre approbation explicite.

Exemple d'utilisation :
```
Pourrais-tu créer un fichier HTML simple avec un bouton qui affiche une alerte quand on clique dessus ?
```

### Exécution de commandes

Cline peut exécuter des commandes shell dans la sandbox. Les commandes sont exécutées dans un environnement contrôlé avec des restrictions de sécurité.

Exemple d'utilisation :
```
Peux-tu installer le package express et créer un serveur web simple ?
```

### Navigation web

Cline peut naviguer sur le web pour rechercher des informations ou accéder à des ressources. La navigation est limitée à une liste blanche de domaines pour des raisons de sécurité.

Exemple d'utilisation :
```
Peux-tu me trouver la documentation de l'API fetch sur MDN ?
```

### Installation de packages

Cline peut installer des packages npm ou pip pour ajouter des fonctionnalités à vos projets.

Exemple d'utilisation :
```
Peux-tu installer axios et me montrer comment faire une requête GET ?
```

## Dépannage

### La sandbox ne démarre pas

1. Vérifiez que Docker est en cours d'exécution
2. Vérifiez les logs Docker : `docker-compose logs`
3. Vérifiez que les ports requis (3000, 8000, 8080) ne sont pas utilisés par d'autres applications

### Cline ne peut pas accéder aux fichiers

1. Vérifiez que le répertoire de travail est correctement monté dans le conteneur
2. Vérifiez les permissions dans les paramètres de l'extension VS Code
3. Vérifiez les logs de l'API : `cd api && npm run logs`

### Les serveurs MCP ne fonctionnent pas

1. Vérifiez que le serveur MCP est correctement installé : `ls -la /home/clineuser/.cline/mcp`
2. Vérifiez que le fichier `.clinerules` est correctement configuré
3. Redémarrez la sandbox : `Ctrl+Shift+P` > "Cline Sandbox: Redémarrer"

## FAQ

### Q: La sandbox est-elle sécurisée ?
R: Oui, la sandbox utilise Docker pour isoler complètement l'environnement d'exécution de Cline de votre système hôte. Toutes les actions sensibles nécessitent une approbation explicite.

### Q: Puis-je utiliser la sandbox avec d'autres modèles IA que Cline ?
R: La sandbox est spécifiquement conçue pour Cline, mais elle pourrait être adaptée pour d'autres agents IA qui utilisent le protocole MCP.

### Q: Comment puis-je ajouter mes propres outils à Cline ?
R: Vous pouvez créer vos propres serveurs MCP et les installer dans la sandbox. Consultez la documentation MCP pour plus d'informations : https://modelcontextprotocol.org/docs

### Q: La sandbox fonctionne-t-elle hors ligne ?
R: Oui, une fois installée, la sandbox peut fonctionner sans connexion Internet. Cependant, certaines fonctionnalités comme la navigation web et l'installation de packages nécessitent une connexion Internet.

### Q: Comment puis-je mettre à jour la sandbox ?
R: Pour mettre à jour la sandbox, tirez les dernières modifications du dépôt Git et reconstruisez l'image Docker :
```bash
git pull
cd docker
docker-compose build
```
