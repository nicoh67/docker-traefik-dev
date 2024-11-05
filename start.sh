#!/bin/bash

docker network create web

# Vérifie si le fichier .env existe, sinon copie .env.default vers .env
if [ ! -f .env ]; then
    echo "Fichier .env non trouvé, copie de .env.default..."
    cp .env.default .env
fi

# Démarre docker-compose
docker-compose up -d

sleep 5

./install-certs.sh
