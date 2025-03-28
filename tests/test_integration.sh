#!/bin/bash

# Script de test modifié pour l'intégration de Cline dans la sandbox

echo "=== Démarrage des tests d'intégration de Cline ==="

# Créer le répertoire de test
mkdir -p /home/ubuntu/cline_sandbox/tests
cd /home/ubuntu/cline_sandbox/tests

# Fonction pour afficher les résultats
print_result() {
  if [ $1 -eq 0 ]; then
    echo "✅ $2"
  else
    echo "❌ $2"
    exit 1
  fi
}

# Test 1: Vérifier la structure des répertoires
echo "Test 1: Vérification de la structure des répertoires"
directories=(
  "/home/ubuntu/cline_sandbox/docker"
  "/home/ubuntu/cline_sandbox/extension"
  "/home/ubuntu/cline_sandbox/api"
  "/home/ubuntu/cline_sandbox/mcp"
  "/home/ubuntu/cline_sandbox/docker/config/.clinerules"
)

for dir in "${directories[@]}"; do
  if [ -d "$dir" ]; then
    echo "  - $dir existe"
  else
    echo "  - $dir n'existe pas"
    print_result 1 "Test 1: Vérification de la structure des répertoires"
  fi
done

print_result 0 "Test 1: Vérification de la structure des répertoires"

# Test 2: Vérifier les fichiers essentiels
echo "Test 2: Vérification des fichiers essentiels"
files=(
  "/home/ubuntu/cline_sandbox/docker/Dockerfile"
  "/home/ubuntu/cline_sandbox/docker/docker-compose.yml"
  "/home/ubuntu/cline_sandbox/api/package.json"
  "/home/ubuntu/cline_sandbox/api/src/index.js"
  "/home/ubuntu/cline_sandbox/extension/package.json"
  "/home/ubuntu/cline_sandbox/extension/src/extension.ts"
  "/home/ubuntu/cline_sandbox/mcp/package.json"
  "/home/ubuntu/cline_sandbox/mcp/index.js"
  "/home/ubuntu/cline_sandbox/mcp/cline-integration/index.js"
  "/home/ubuntu/cline_sandbox/docker/config/.clinerules/index.json"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "  - $file existe"
  else
    echo "  - $file n'existe pas"
    print_result 1 "Test 2: Vérification des fichiers essentiels"
  fi
done

print_result 0 "Test 2: Vérification des fichiers essentiels"

# Test 3: Vérifier la syntaxe des fichiers JavaScript
echo "Test 3: Vérification de la syntaxe des fichiers JavaScript"
js_files=(
  "/home/ubuntu/cline_sandbox/api/src/index.js"
  "/home/ubuntu/cline_sandbox/mcp/index.js"
  "/home/ubuntu/cline_sandbox/mcp/cline-integration/index.js"
)

for file in "${js_files[@]}"; do
  echo "  - Vérification de $file"
  node -c "$file" 2>/dev/null
  print_result $? "Syntaxe de $file"
done

# Test 4: Vérifier la validité du fichier .clinerules
echo "Test 4: Vérification de la validité du fichier .clinerules"
clinerules_file="/home/ubuntu/cline_sandbox/docker/config/.clinerules/index.json"

# Utiliser jq directement pour valider le JSON
if jq . "$clinerules_file" > /dev/null 2>&1; then
  echo "  - Format JSON valide"
  
  # Vérifier les champs obligatoires avec jq
  if jq -e '.tools' "$clinerules_file" > /dev/null 2>&1; then
    echo "  - Champ 'tools' présent"
    
    # Vérifier que les outils ont les champs requis
    tool_count=$(jq '.tools | length' "$clinerules_file")
    echo "  - $tool_count outils trouvés"
    
    valid_tools=true
    for i in $(seq 0 $(($tool_count - 1))); do
      tool_name=$(jq -r ".tools[$i].name" "$clinerules_file")
      
      # Vérifier chaque champ requis
      if ! jq -e ".tools[$i].description" "$clinerules_file" > /dev/null 2>&1; then
        echo "  - Outil '$tool_name': description manquante"
        valid_tools=false
      fi
      
      if ! jq -e ".tools[$i].parameters" "$clinerules_file" > /dev/null 2>&1; then
        echo "  - Outil '$tool_name': parameters manquant"
        valid_tools=false
      fi
      
      if ! jq -e ".tools[$i].endpoint" "$clinerules_file" > /dev/null 2>&1; then
        echo "  - Outil '$tool_name': endpoint manquant"
        valid_tools=false
      fi
    done
    
    if [ "$valid_tools" = true ]; then
      print_result 0 "Test 4: Vérification de la validité du fichier .clinerules"
    else
      print_result 1 "Test 4: Vérification de la validité du fichier .clinerules"
    fi
  else
    echo "  - Champ 'tools' manquant"
    print_result 1 "Test 4: Vérification de la validité du fichier .clinerules"
  fi
else
  echo "  - Format JSON invalide"
  print_result 1 "Test 4: Vérification de la validité du fichier .clinerules"
fi

# Test 5: Vérifier la configuration Docker
echo "Test 5: Vérification de la configuration Docker"
docker_compose="/home/ubuntu/cline_sandbox/docker/docker-compose.yml"
if [ -f "$docker_compose" ]; then
  echo "  - Fichier docker-compose.yml trouvé"
  
  # Vérifier que le service principal est défini
  if grep -q "cline-sandbox:" "$docker_compose"; then
    echo "  - Service cline-sandbox défini"
    print_result 0 "Test 5: Vérification de la configuration Docker"
  else
    echo "  - Service cline-sandbox non défini"
    print_result 1 "Test 5: Vérification de la configuration Docker"
  fi
else
  echo "  - Fichier docker-compose.yml non trouvé"
  print_result 1 "Test 5: Vérification de la configuration Docker"
fi

echo "=== Tests d'intégration de Cline terminés avec succès ==="
