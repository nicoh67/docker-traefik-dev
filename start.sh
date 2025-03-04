#!/bin/bash

docker network create web

touch ./certs/certs.sh
chmod +xw ./certs/certs.sh
chmod +xw ./install-certs.sh

# Vérifie si le fichier .env existe, sinon copie .env.default vers .env
if [ ! -f .env ]; then
    echo "Fichier .env non trouvé, copie de .env.default..."
    cp .env.default .env
fi

# Démarre docker-compose
docker-compose up -d --build

sleep 5

./install-certs.sh