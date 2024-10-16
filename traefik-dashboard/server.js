const express = require("express");
const axios = require("axios");
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

const sitesPath = '/var/www/sites'; // Remplace par le chemin correct vers ton dossier des sites
const nginxConfigPath = '/etc/nginx/nginx.conf'; // Chemin vers votre fichier nginx.conf

// Configure EJS comme moteur de vue
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

// Route principale pour afficher les liens
app.get("/", async (req, res) => {
  const routes = await fetchTraefikRoutes();
  const routes_nginx = getNginxSites();
  // const routes2 = getNginxSites().map(site => (`${site}.devphp.localhost`));
  const phpVersions = getPhpVersionsFromNginxConfig(); // Obtenez les versions de PHP
  res.render('index', { routes, routes_nginx, phpVersions }); // Rendre le fichier EJS
});

// Démarrage du serveur
app.listen(port, () => {
  console.log(`Serveur en écoute sur http://localhost:${port}`);
});
