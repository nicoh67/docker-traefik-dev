const Docker = require('dockerode');
const express = require("express");
const axios = require("axios");
const fs = require('fs');
const path = require('path');
const { version } = require('os');
const app = express();
const port = 3000;

const docker = new Docker();  // Assurez-vous que Docker est accessible sans sudo

const sitesPath = '/var/www/sites'; // Remplace par le chemin correct vers ton dossier des sites
const nginxConfigPath = '/etc/nginx/nginx.conf'; // Chemin vers votre fichier nginx.conf
const nginxDefaultSiteConfigPath = '/etc/nginx/default-site.conf'; // Chemin vers le fichier default-site.conf
const nginxConfsDir = '/etc/nginx/conf.d';

// Configure EJS comme moteur de vue
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


// Fonction pour vider le dossier conf.d avant de recréer les fichiers
function cleanConfDir() {
  if (fs.existsSync(nginxConfsDir)) {
      fs.readdirSync(nginxConfsDir).forEach(file => {
          const filePath = path.join(nginxConfsDir, file);
          if (fs.statSync(filePath).isFile()) {
              fs.unlinkSync(filePath);
          }
      });
  }
}


function writeNginxConf(path, phpVersion, serviceName, confFile) {
  if(typeof confFile == "undefined")
    confFile = serviceName;
  const confContent = fs.readFileSync(nginxDefaultSiteConfigPath, 'utf-8');
  const variables = {
    "phpVersion"  : phpVersion,
    "serviceName" : serviceName,
  };

  // On ajoute les varaibles d'environnement dans les variables de champ de fusion pour la config nginx
  Object.keys(process.env).forEach(key => {
    variables[key] = process.env[key];
  });

  const conf = confContent.replace(/\${(\w+)}/g, (match, variableName) => {
    if(variables.hasOwnProperty(variableName))
      return variables[variableName];
    return match; // Laisser le placeholder intact si la variable n'est pas définie
  });

  // Écrire la configuration dans un fichier
  const confPath = path.join(nginxConfsDir, `nginx_${confFile}.conf`);
  fs.writeFileSync(confPath, conf, 'utf8');
  console.log(`Configuration NGINX générée pour ${confFile} dans ${confPath}`);

}

// Fonction générant les configs de nginx à partir des versions de PHP isntallées
async function generateConfigsFromDocker() {
  cleanConfDir();
  const versions = await getPhpVersionsFromDocker();
  let latestVersion = process.env.DEFAULT_PHP_VERSION ?? versions[versions.length-1];

  versions.forEach( phpVersion => {
    const serviceName = "php-fpm"+ phpVersion;
    if(phpVersion == latestVersion)
      writeNginxConf(path, "", serviceName, "");
    writeNginxConf(path, phpVersion, serviceName);
  });
}


// Fonction pour extraire les versions de PHP de nginx.conf
/*
async function getPhpVersionsFromDocker() {
  let versions = [];

  try {
    const containers = await docker.listContainers();

    // Utiliser Promise.all pour attendre que toutes les promesses soient résolues
    const versionPromises = containers.map(async (containerInfo) => {
      const container = docker.getContainer(containerInfo.Id);
      const data = await container.inspect();

      // Vérifier si l'image du conteneur est PHP
      if (data.Config.Image.startsWith('PHP_VERSION:')) {
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
*/
async function getPhpVersionsFromDocker() {
  let versions = [];

  try {
    const containers = await docker.listContainers({ all: true });
    // console.log("Containers trouvés :", containers.map(c => c.Image));

    const versionPromises = containers.map(async (containerInfo) => {
      
      const containerName = containerInfo.Names[0] || ""; // Premier nom du conteneur
      const match = containerName.match(/php-fpm(\d+)/); // Regex pour extraire la version
      if(match && match.length > 1)
        return match[1];
      return null;
    });

    // Attendre toutes les promesses et filtrer les valeurs nulles
    const results = await Promise.all(versionPromises);
    versions = results.filter(version => version !== null);
  } catch (error) {
    console.error("Erreur lors de la récupération des versions PHP :", error);
  }

  return [...new Set(versions)].sort((a, b) => parseFloat(a) - parseFloat(b)); // Trie numériquement
}


// Fonction pour lire les dossiers de nginx
function getNginxSites() {
  return fs.readdirSync(sitesPath).filter(file => {
    const filePath = path.join(sitesPath, file);
    return fs.statSync(filePath).isDirectory();
  });
}


// function getNginxSitesAndSubsites() {
//   const sites = fs.readdirSync(sitesPath).flatMap(subdomain => {
//     const subdomainPath = path.join(sitesPath, subdomain);

//     if (fs.statSync(subdomainPath).isDirectory()) {
//       const subsubdomains = fs.readdirSync(subdomainPath)
//         .filter(subsubdomain => {
//           const subsubdomainPath = path.join(subdomainPath, subsubdomain);
//           return fs.statSync(subsubdomainPath).isDirectory();
//         })
//         .map(subsubdomain => `${subsubdomain}.${subdomain}`);

//       return [subdomain, ...subsubdomains];
//     }

//     return [];
//   });

//   return sites;
// }

function getNginxSitesAndSubsites() {
  return [ ['phpinfo'], ...fs.readdirSync(sitesPath).flatMap(subdomain => {
    const subdomainPath = path.join(sitesPath, subdomain);

    if (fs.statSync(subdomainPath).isDirectory()) {
      const validPublicDirs = ['public', 'public_html'];
      const hasPublicDir = validPublicDirs.some(dir => fs.existsSync(path.join(subdomainPath, dir)));

      if (hasPublicDir) {
        return [subdomain]; // Ajoute le sous-domaine s'il contient un "public" ou "public_html"
      }

      const subsubdomains = fs.readdirSync(subdomainPath)
        .filter(subsubdomain => {
          const subsubdomainPath = path.join(subdomainPath, subsubdomain);

          // Vérifie si le sous-sous-domaine est un dossier et qu'il contient un fichier index.php ou index.html
          if (fs.statSync(subsubdomainPath).isDirectory()) {
            const hasPublicDir = validPublicDirs.some(dir => fs.existsSync(path.join(subsubdomainPath, dir)));
            return hasPublicDir;
            // const hasIndexFile = fs.existsSync(path.join(subsubdomainPath, 'index.php')) ||
            //                      fs.existsSync(path.join(subsubdomainPath, 'index.html'));
            // return hasIndexFile;
          }

          return false;
        })
        .map(subsubdomain => `${subsubdomain}.${subdomain}`);

      // Ajoute le sous-domaine et les sous-sous-domaines valides
      return [subdomain, ...subsubdomains];
    }

    return [];
  })];
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
  phpVersions.forEach(version => {
    mkcertDomains.push(`"*.${process.env.NGINX_DOMAIN}${version}.localhost"`);

    // Ajouter les sous-domaines NGINX
    nginxDomains.forEach(domain => {
      const subsubDomainsPath = path.join(sitesPath, domain);
      if (fs.existsSync(subsubDomainsPath)) {
        const subsubDomains = fs.readdirSync(subsubDomainsPath).filter(file => 
          fs.statSync(path.join(subsubDomainsPath, file)).isDirectory() &&
          !file.startsWith(".") // Ignore les dossiers commençant par "."
        );
        subsubDomains.forEach(subsubDomain => {
          mkcertDomains.push(`"${subsubDomain}.${domain}.${process.env.NGINX_DOMAIN}${version}.localhost"`);
        });
      }
     
      // mkcertDomains.push(`"*.${domain}.${process.env.NGINX_DOMAIN}.localhost"`);
      // phpVersions.forEach(version => mkcertDomains.push(`"*.${domain}.${process.env.NGINX_DOMAIN}${version}.localhost"`));
    });

  });
  


  // Ajouter les domaines Traefik
  mkcertDomains.push(...traefikDomains.map(domain => `"${domain}"`));

  // Créer la commande
  const mkcertCommand = `mkcert --install -cert-file certs/local-cert.pem -key-file certs/local-key.pem ${mkcertDomains.join(" ")}\n\ndocker restart traefik nginx`;

  // Enregistrer la commande dans un fichier install-certs.sh
  fs.writeFileSync('/install-certs.sh', `#!/bin/bash\n${mkcertCommand}\n`, { mode: 0o755 });
  console.log("La commande mkcert a été enregistrée dans install-certs.sh");

}



// Route principale pour afficher les liens
app.get("/", async (req, res) => {
  generateMkcertCommand();
  const routes = await fetchTraefikRoutes();
  const routes_nginx = getNginxSites();
  const routes_nginx_with_subsubdomains = getNginxSitesAndSubsites();
  // const routes2 = getNginxSites().map(site => (`${site}.${process.env.NGINX_DOMAIN}.localhost`));
  const phpVersions = await getPhpVersionsFromDocker(); // Obtenez les versions de PHP
  const nginxDomain = process.env.NGINX_DOMAIN; // Obtenez les versions de PHP
  const sitesFolderSystem = process.env.SITES_FOLDER_SYSTEM; // Dossier des SITES
  // console.log(sitesFolderSystem);
  
  // const phpVersions = getPhpVersionsFromNginxConfig(); // Obtenez les versions de PHP
  res.render('index', { routes, routes_nginx, routes_nginx_with_subsubdomains, phpVersions, nginxDomain, sitesFolderSystem }); // Rendre le fichier EJS
});

// Démarrage du serveur
app.listen(port, () => {
  console.log(`Serveur en écoute sur http://localhost:${port}`);
  generateConfigsFromDocker();
  generateMkcertCommand();
});
