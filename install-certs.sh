
# Récupérer le dossier du script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_TO_RUN="$SCRIPT_DIR/certs.sh"

# Détection de l'environnement
if grep -qi microsoft /proc/version; then
    echo "✅ Exécution sous WSL"

    # Vérifier si Git Bash est installé sous Windows
    GIT_BASH="/mnt/c/Program Files/Git/bin/bash.exe"
    if [ -f "$GIT_BASH" ]; then
        echo "🟢 Git Bash détecté, exécution avec : $GIT_BASH"

        # Convertir le chemin WSL en chemin Windows compatible avec Git Bash
        SCRIPT_TO_RUN_WIN=$(wslpath -w "$SCRIPT_TO_RUN" | sed 's/\\/\//g')

        # Exécuter le script avec Git Bash en lui indiquant un chemin Windows
        "$GIT_BASH" -c "bash '$SCRIPT_TO_RUN_WIN'"
    else
        echo "⚠️ Git Bash non trouvé, exécution avec cmd.exe"

        # Convertir le chemin WSL en format Windows pour cmd.exe
        SCRIPT_TO_RUN_WIN=$(wslpath -w "$SCRIPT_TO_RUN")

        cmd.exe /c "C:\Windows\System32\bash.exe '$SCRIPT_TO_RUN_WIN'"
    fi
else
    echo "✅ Exécution sous Linux natif, lancement direct du script"
    "$SCRIPT_TO_RUN"
fi
