FROM ubuntu:22.04

# Éviter les interactions utilisateur pendant l'installation
ENV DEBIAN_FRONTEND=noninteractive

# Installer uniquement les dépendances essentielles
RUN apt-get update && apt-get install -y \
    curl \
    python3 \
    python3-pip \
    git \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Installer Node.js (LTS)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update \
    && apt-get install -y -o Dpkg::Options::="--force-overwrite" nodejs \
    && rm -rf /var/lib/apt/lists/*

# Installer les dépendances Python minimales
RUN pip3 install fastapi uvicorn pydantic requests websockets

# Installer les outils essentiels Node.js
RUN npm install -g typescript ts-node

# Configurer l'utilisateur et les répertoires
RUN useradd -m -s /bin/bash clineuser \
    && mkdir -p /home/clineuser/workspace \
    && mkdir -p /home/clineuser/.cline/mcp \
    && mkdir -p /home/clineuser/workspace/.clinerules \
    && chown -R clineuser:clineuser /home/clineuser

# Passer à l'utilisateur non-root
USER clineuser
WORKDIR /home/clineuser/workspace

# Copier les fichiers de configuration essentiels
COPY --chown=clineuser:clineuser ./docker/config/.clinerules /home/clineuser/workspace/.clinerules/

# Exposer les ports nécessaires
EXPOSE 3000 8000 8080

# Commande par défaut
CMD ["/bin/bash"]
