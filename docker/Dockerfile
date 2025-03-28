FROM ubuntu:22.04

# Éviter les interactions utilisateur pendant l'installation
ENV DEBIAN_FRONTEND=noninteractive

# Installer les dépendances de base
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    python3 \
    python3-pip \
    sudo \
    vim \
    nano \
    zip \
    unzip \
    build-essential \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# Installer une version plus récente de Node.js (LTS recommandée)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y -o Dpkg::Options::="--force-overwrite" nodejs

# Installer Chrome pour le navigateur headless
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Créer un utilisateur non-root
RUN useradd -m -s /bin/bash clineuser \
    && echo "clineuser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Créer les répertoires nécessaires
RUN mkdir -p /home/clineuser/workspace \
    && mkdir -p /home/clineuser/.cline/mcp \
    && mkdir -p /home/clineuser/.vscode-server/extensions \
    && chown -R clineuser:clineuser /home/clineuser

# Installer les dépendances Python pour les serveurs MCP
RUN pip3 install fastapi uvicorn pydantic requests websockets

# Installer les outils globaux Node.js
RUN npm install -g typescript ts-node nodemon

# Passer à l'utilisateur non-root
USER clineuser
WORKDIR /home/clineuser/workspace

# Configurer le répertoire .clinerules
RUN mkdir -p /home/clineuser/workspace/.clinerules

# Copier les fichiers de configuration
COPY --chown=clineuser:clineuser ./docker/config/.clinerules /home/clineuser/workspace/.clinerules/

# Exposer les ports pour l'API et les serveurs MCP
EXPOSE 3000 8000 8080

# Commande par défaut
CMD ["/bin/bash"]
