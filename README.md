
# Environnement de développement avec Traefik et SSL auto-signé

Ce guide vous permet de configurer un environnement de développement local avec Traefik en utilisant des certificats SSL générés localement avec `mkcert`, pour gérer à la fois les accès HTTP et HTTPS.

## Prérequis

1. **Docker** : Assurez-vous que Docker est installé sur votre machine.
2. **Docker Compose** : Docker Compose doit également être installé.
3. **mkcert** : Installez `mkcert` pour générer des certificats SSL auto-signés.

## Installation de `mkcert`

Installez `mkcert` sur votre machine LOCALE (si vous êtes sous Windows avec WSL, **lancez mkcert sous Windows**, pas sous WSL) :

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


## Démarrer les services

Démarrez l'environnement de dév avec la commande suivante (vous aurez peut-être besoin de faire un `chmod +x start.sh` ):

```bash
./start.sh
```

Cela créera le réseau docker et le fichier .env s'ils n'existent pas, démarrera le docker-compose, et installera les certificats sur la machine locale (mkcert).

## Générer les certificats SSL pour les domaines locaux

Exécutez la commande suivante pour générer un certificat SSL auto-signé pour tous les domaines locaux et redémarrer le docker traefik pour la prise en compte :

```bash
./install-certs.sh
```

Les certificats seront générés dans le dossier `certs/`.
Les certificats générés avec `mkcert` seront automatiquement reconnus comme valides dans votre navigateur.


## Accéder aux services

Accéder aux domaines configurés dans Traefix et dans NGINX à partir de :

[https://localhost](https://localhost)


### Détection des sites NGINX

Le listing affiche tous les domaines et les sous-domaines, dès lors qu'un fichier "index.[php|html]" existe dans le dossier.


## Accéder en HTTP (port 80)

Pour pouvoir utiliser le port 80 avec Traefik, il suffit de décommenter les lignes du fichier `traefik/traefik.yml` :
```yml
entryPoints:
  # http:
  #   address: ":80"
```


