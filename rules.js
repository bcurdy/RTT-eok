"use strict";

const data = require("./data.js");

exports.scenarios = [ "Standard Game" ];
exports.roles = [ "Soviet", "German" ];

exports.setup = function (seed, scenario, options) {
    let game = {
        seed: seed,
        scenario: scenario,
        options: options,
        log: [],
        undo: [],
        active: "German", 
        state: "setup_german",
        selected: null, 
        pieces: {}, 
    };

    data.units.forEach(u => {
        game.pieces[u.id] = null;
    });

    data.units.forEach(u => {
        if (u.type === 'fort' && u.space) {
            game.pieces[u.id] = u.space;
        }
    });

    return game;
};

exports.view = function(state, role) {
    let view = {
        active: state.active,
        pieces: state.pieces,
        log: state.log,
        prompt: null,
        actions: {},
        selected: state.selected 
    };

    function get_unplaced_units(side) {
        let list = [];
        data.units.forEach(u => {
            if (state.pieces[u.id] === null && u.side === side && u.type !== 'fort' && u.type !== 'chit') {
                list.push(u.id);
            }
        });
        return list;
    }

    // Helper pour lister les unités "sélectionnables" (en réserve)
    function list_selectable_units(side) {
        let list = [];
        data.units.forEach(u => {
            if (state.pieces[u.id] === null && u.side === side && u.type !== 'fort' && u.type !== 'chit') {
                list.push(u.id);
            }
        });
        return list;
    }

    function list_valid_spaces(unitId) {
        let list = [];
        let unit = data.units.find(u => u.id === unitId);
        let current_pieces = state.pieces;

        data.spaces.forEach(space => {
            let s = parseInt(space.id);
            let unitsInSpace = data.units.filter(u => current_pieces[u.id] === space.id);
            let count = unitsInSpace.filter(u => u.type !== 'fort').length;

            if (count >= 3) return;

            if (unit.side === "german") {
                // 1-4, 20, 24-52
                let valid = (s >= 1 && s <= 4) || s === 20 || (s >= 24 && s <= 52);
                if (!valid) return;
            } 
            else if (unit.side === "soviet") {
                // 2-24
                let valid = (s >= 2 && s <= 24);
                if (!valid) return;

                let hasGerman = unitsInSpace.some(u => u.side === "german");
                if (hasGerman) return;

                let differentArmy = unitsInSpace.find(u => u.side === "soviet" && u.army !== unit.army);
                if (differentArmy) return;
            }

            list.push(space.id);
        });
        return list;
    }

    // --- GESTION DU BOUTON UNDO (Grisé ou Actif) ---
    // RTT affiche le bouton si la clé existe. Si valeur 0 => Disabled.
    if (state.undo && state.undo.length > 0) {
        view.actions.undo = 1; 
    } else {
        view.actions.undo = 0; // Grisé
    }

    // --- LOGIQUE SETUP ---
    if (state.state === "setup_german") {
        if (role === "German") {
            let unplaced = get_unplaced_units("german");
            
            // Bouton End Setup (Grisé tant qu'il reste des unités)
            if (unplaced.length === 0) {
                view.prompt = "All units placed. End Setup to continue.";
                view.actions.end_setup = 1; // Actif
            } else {
                view.prompt = `German Setup: ${unplaced.length} units remaining.`;
                view.actions.end_setup = 0; // Grisé
            }

            if (state.selected) {
                view.prompt = "Select destination.";
                view.actions.place = list_valid_spaces(state.selected);
                view.actions.deselect = 1; 
            } else {
                view.actions.select = list_selectable_units("german");
            }
        } else {
            view.prompt = "German is setting up...";
        }
    } 
    else if (state.state === "setup_soviet") {
        if (role === "Soviet") {
            let unplaced = get_unplaced_units("soviet");

            if (unplaced.length === 0) {
                view.prompt = "All units placed. End Setup to continue.";
                view.actions.end_setup = 1;
            } else {
                view.prompt = `Soviet Setup: ${unplaced.length} units remaining.`;
                view.actions.end_setup = 0; 
            }

            if (state.selected) {
                view.prompt = "Select destination.";
                view.actions.place = list_valid_spaces(state.selected);
                view.actions.deselect = 1;
            } else {
                view.actions.select = list_selectable_units("soviet");
            }
        } else {
            view.prompt = "Soviet is setting up...";
        }
    } 
    else {
        view.prompt = "Game Started.";
    }

    return view;
};

exports.action = function (state, role, action, args) {
    let game = state;

    if (action === "select") {
        let unit = data.units.find(u => u.id === args);
        // Security check
        if (unit.side.toLowerCase() !== role.toLowerCase()) return game; 
        game.selected = args;
    }

    if (action === "deselect") {
        game.selected = null;
    }

    if (action === "place") {
        let spaceId = args;
        if (!game.selected) return game;

        // SAUVEGARDE UNDO (Deep Copy pieces)
        game.undo.push(JSON.parse(JSON.stringify(game.pieces)));

        game.pieces[game.selected] = spaceId;
        game.selected = null;
    }

    if (action === "undo") {
        if (game.undo.length > 0) {
            game.pieces = game.undo.pop();
            game.selected = null;
        }
    }

    if (action === "end_setup") {
        // On vérifie si on a le droit de finir (par sécurité)
        // Mais l'UI gère le grisé.
        game.selected = null;
        game.undo = [];
        
        if (game.state === "setup_german") {
            game.active = "Soviet";
            game.state = "setup_soviet";
            game.log.push("German setup finished.");
        } else if (game.state === "setup_soviet") {
            game.active = "German";
            game.state = "game_start";
            game.log.push("Soviet setup finished.");
        }
    }

    return game;
};