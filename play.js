"use strict"

let game = null;

function setup(state) {
    console.log("EoK: Setup received");
    game = state;
    // On lance l'affichage des points dès que le jeu est prêt
    render_debug_points();
}

window.on_update = function(state, last_event) {
    game = state;
};

// --- FONCTION DE VISUALISATION ---

function render_debug_points() {
    const map = document.getElementById("map");
    
    // Sécurité : si la carte ou les données n'existent pas encore
    if (!map || typeof data === 'undefined' || !data.spaces) {
        console.log("EoK Debug: Pas de données 'spaces' à afficher.");
        return;
    }

    console.log(`EoK Debug: Affichage de ${data.spaces.length} points...`);

    // Nettoyage (au cas où on ré-exécute la fonction)
    document.querySelectorAll('.debug-marker, .debug-label').forEach(e => e.remove());

    // Boucle sur chaque lieu défini dans data.js
    data.spaces.forEach(space => {
        if (space.x !== undefined && space.y !== undefined) {
            // 1. Créer le point rouge
            let marker = document.createElement("div");
            marker.className = "debug-marker";
            marker.style.left = space.x + "px";
            marker.style.top = space.y + "px";
            // Affiche les coordonnées au survol de la souris
            marker.title = `${space.name} [${space.id}]\nX: ${space.x}, Y: ${space.y}`;
            map.appendChild(marker);

            // 2. Créer l'étiquette (Nom)
            let label = document.createElement("div");
            label.className = "debug-label";
            label.style.left = space.x + "px";
            label.style.top = space.y + "px";
            label.textContent = space.id; // Ou space.name selon votre préférence
            map.appendChild(label);
        }
    });
}

// Lance aussi au chargement de la page pour être sûr
window.addEventListener("load", render_debug_points);