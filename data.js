"use strict"

const data = {
    // Les rôles (camps)
    roles: [ "Soviet", "German" ],

    // La carte (structure minimale)
    spaces: [
        { id: "Konigsberg", x: 1000, y: 1000, name: "Königsberg" }
    ],
    
    // Les unités (vide pour l'instant pour éviter les erreurs)
    units: [] 
}

// Cette ligne magique à la fin permet la compatibilité Serveur/Navigateur
if (typeof module !== 'undefined') module.exports = data