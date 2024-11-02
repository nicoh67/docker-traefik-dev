const Docker = require('dockerode');
const express = require("express");
const axios = require("axios");
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

const docker = new Docker();  // Assurez-vous que Docker est accessible sans sudo

const sitesPath = '/var/www/sites'; // Remplace par le chemin correct vers ton dossier des sites
const nginxConfigPath = '/etc/nginx/nginx.conf'; // Chemin vers votre fichier nginx.conf
const outputDir = '/etc/nginx/conf.d';

// Configure EJS comme moteur de vue
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));



function writeNginxConf(path, phpVersion, serviceName, confFile) {
  if(typeof confFile == "undefined")
    confFile = serviceName;

  const conf = `
server {
    listen 80;
    server_name ~^(?<subdomain>.+)\.devphp${phpVersion}.localhost$;

    root /var/www/html/$subdomain;
    index index.php;

    location ~ \\.php$ {
        include fastcgi_params;
        fastcgi_pass ${serviceName}:9000;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }
}`;

  // Écrire la configuration dans un fichier
  const confPath = path.join(outputDir, `nginx_${confFile}.conf`);
  fs.writeFileSync(confPath, conf, 'utf8');
  console.log(`Configuration NGINX générée pour ${confFile} dans ${confPath}`);

}

// Fonction générant les configs de nginx à partir des versions de PHP isntallées
async function generateConfigsFromDocker() {
  const versions = await getPhpVersionsFromDocker();
  let latestVersion = versions[versions.length-1];
  

  try {
    const containers = await docker.listContainers();

    containers.forEach(async (containerInfo) => {
      const container = docker.getContainer(containerInfo.Id);
      const data = await container.inspect();
      
      // Vérifier si l'image du conteneur est PHP
      if (data.Config.Image.startsWith('php:')) {
        const phpVersion = (data.Config.Image.split(':')[1] || 'default').replace('-fpm', '').replace('.', '');
        const serviceName = data.Name.replace(/^\//, '');  // Retirer le slash du début
        
        // Si c'est la dernière version PHP installée, on la choisi par défaut
        if(phpVersion == latestVersion)
          writeNginxConf(path, "", serviceName, "");

        writeNginxConf(path, phpVersion, serviceName);
      }
    });
  } catch (error) {
    console.error("Erreur lors de la génération des configurations NGINX:", error);
  }
}


// Fonction pour extraire les versions de PHP de nginx.conf
async function getPhpVersionsFromDocker() {
  let versions = [];

  try {
    const containers = await docker.listContainers();

    // Utiliser Promise.all pour attendre que toutes les promesses soient résolues
    const versionPromises = containers.map(async (containerInfo) => {
      const container = docker.getContainer(containerInfo.Id);
      const data = await container.inspect();

      // Vérifier si l'image du conteneur est PHP
      if (data.Config.Image.startsWith('php:')) {
        let version = data.Config.Image.split(':')[1] ? (data.Config.Image.split(':')[1] || 'default').replace('-fpm', '').replace('.', '') : "";
        return version; // Retourner la version pour cet élément
      }
      return null; // Retourner null si ce n'est pas une image PHP
    });

    // Récupérer les résultats des promesses, puis filtrer les nulls
    const results = await Promise.all(versionPromises);
    versions = results.filter(version => version !== null);
  } catch (error) {
    console.error("Erreur lors de la récupération des versions PHP :", error);
  }

  return [...new Set(versions)].sort((a, b) => a - b); // Rendre unique et trier
}


// Fonction pour lire les dossiers de nginx
function getNginxSites() {
  return fs.readdirSync(sitesPath).filter(file => {
    const filePath = path.join(sitesPath, file);
    return fs.statSync(filePath).isDirectory();
  });
}

// Fonction pour extraire les versions de PHP de nginx.conf
function getPhpVersionsFromNginxConfig() {
  const config = fs.readFileSync(nginxConfigPath, 'utf-8');
  const regex = /fastcgi_pass\s+php-fpm(\d+)\:9000;/g;
  const versions = [];
  let match;

  while ((match = regex.exec(config)) !== null) {
    versions.push(match[1]);
  }

  return [...new Set(versions)]; // Rendre unique
}

// Fonction pour obtenir les routes Traefik
async function fetchTraefikRoutes() {
  try {
    const response = await axios.get("http://traefik:8080/api/http/routers");
    const routers = response.data;
    let ret = [];

    for (const router in routers) {
      if (routers[router].rule) {
        const hostRule = routers[router].rule.match(/Host\(`([^`]+)`\)/);
        if (hostRule && hostRule[1]) {
          ret.push(hostRule[1]);
        }
      }
    }
    return ret;
  } catch (error) {
    console.error("Erreur lors de la récupération des routes de Traefik:", error);
    return [];
  }
}


// Générer la commande mkcert
async function generateMkcertCommand() {
  const nginxDomains = getNginxSites();
  const phpVersions = await getPhpVersionsFromDocker();
  phpVersions.unshift("");
  const traefikDomains = await fetchTraefikRoutes();

  const mkcertDomains = ['localhost', 'dev.localhost', '"*.dev.localhost"'];

  // Ajouter les domaines php versions NGINX
  // mkcertDomains.push(`"*.devphp.localhost"`);
  phpVersions.forEach(version => {
    mkcertDomains.push(`"*.devphp${version}.localhost"`);

    // Ajouter les sous-domaines NGINX
    nginxDomains.forEach(domain => {
      const subsubDomainsPath = path.join(sitesPath, domain);
      if (fs.existsSync(subsubDomainsPath)) {
        const subsubDomains = fs.readdirSync(subsubDomainsPath).filter(file => 
          fs.statSync(path.join(subsubDomainsPath, file)).isDirectory()
        );
        subsubDomains.forEach(subsubDomain => {
          mkcertDomains.push(`"${subsubDomain}.${domain}.devphp${version}.localhost"`);
        });
      }
     
      // mkcertDomains.push(`"*.${domain}.devphp.localhost"`);
      // phpVersions.forEach(version => mkcertDomains.push(`"*.${domain}.devphp${version}.localhost"`));
    });

  });
  


  // Ajouter les domaines Traefik
  mkcertDomains.push(...traefikDomains.map(domain => `"${domain}"`));

  // Créer la commande
  const mkcertCommand = `mkcert --install -cert-file certs/local-cert.pem -key-file certs/local-key.pem ${mkcertDomains.join(" ")}`;

  // Enregistrer la commande dans un fichier generate_certs.sh
  fs.writeFileSync('/install-certs.sh', `#!/bin/bash\n${mkcertCommand}\n`, { mode: 0o755 });
  console.log("La commande mkcert a été enregistrée dans generate_certs.sh");

}



// Route principale pour afficher les liens
app.get("/", async (req, res) => {
  generateMkcertCommand();
  const routes = await fetchTraefikRoutes();
  const routes_nginx = getNginxSites();
  // const routes2 = getNginxSites().map(site => (`${site}.devphp.localhost`));
  const phpVersions = await getPhpVersionsFromDocker(); // Obtenez les versions de PHP
  // const phpVersions = getPhpVersionsFromNginxConfig(); // Obtenez les versions de PHP
  res.render('index', { routes, routes_nginx, phpVersions }); // Rendre le fichier EJS
});

// Démarrage du serveur
app.listen(port, () => {
  console.log(`Serveur en écoute sur http://localhost:${port}`);
  generateConfigsFromDocker();
  generateMkcertCommand();
});
