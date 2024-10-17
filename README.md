
# Environnement de développement avec Traefik et SSL auto-signé

Ce guide vous permet de configurer un environnement de développement local avec Traefik en utilisant des certificats SSL générés localement avec `mkcert`, pour gérer à la fois les accès HTTP et HTTPS.

## Prérequis

1. **Docker** : Assurez-vous que Docker est installé sur votre machine.
2. **Docker Compose** : Docker Compose doit également être installé.
3. **mkcert** : Installez `mkcert` pour générer des certificats SSL auto-signés.

### Créer un réseau docker 

`docker network create web`

### Installation de `mkcert`

Installez `mkcert` sur votre machine locale :

- **MacOS** :
  ```bash
  brew install mkcert
  brew install nss  # Pour Firefox, si nécessaire
  mkcert -install
  ```

- **Linux** :
  ```bash
  sudo apt install libnss3-tools
  mkcert -install
  ```

- **Windows** :
  - Le fichier mkcert.exe est déjà dans le dossier (téléchargeable sinon à https://github.com/FiloSottile/mkcert).
  - Ouvrez PowerShell (avec les droits administrateur) dans le dossier de votre projet.
  - Exécutez la commande suivante :
    ```Powershell
    .\mkcert.exe -install
    ```

### Générer les certificats SSL pour les domaines locaux

Exécutez la commande suivante pour générer un certificat SSL auto-signé pour les domaines locaux `localhost` et `*.dev.localhost` :

```bash
mkcert --install -cert-file certs/local-cert.pem -key-file certs/local-key.pem localhost dev.localhost "*.dev.localhost" "*.devphp74.localhost" "*.devphp.localhost" "127.0.0.1"
```

Les certificats seront générés dans le dossier `certs/`.


### Démarrer les services

Démarrez Traefik et les services associés avec la commande suivante :

```bash
docker-compose up -d
```

### Accéder aux services

- **HTTPS** : [https://localhost](https://localhost)

Le certificat généré avec `mkcert` sera automatiquement reconnu comme valide dans votre navigateur.
