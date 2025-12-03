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
        
        // Game State
        turn: 1,
        stance: null,
        cef: 0, // Civilian Evacuation Factors (VP)
        major_exodus: false,
        russian_halt: false,
        major_sinking: false, 

        selected: null, 
        pieces: {}, 
    };

    data.units.forEach(u => {
        game.pieces[u.id] = u.space || null;
    });

    return game;
};

// --- HELPERS ---

function count_chits_in_box(game, boxNamePrefix) {
    let count = 0;
    let slots = [`track_${boxNamePrefix}1`, `track_${boxNamePrefix}2`];
    for(let uid in game.pieces) {
        if (slots.includes(game.pieces[uid])) count++;
    }
    return count;
}

function is_fully_occupied_by(game, spaces, side) {
    for (let spaceId of spaces) {
        let occupied = false;
        let sid = String(spaceId);
        for (let uid in game.pieces) {
            if (game.pieces[uid] === sid) {
                let unit = data.units.find(u => u.id === uid);
                if (unit.side === side) {
                    occupied = true;
                    break;
                }
            }
        }
        if (!occupied) return false; 
    }
    return true;
}

// --- VIEW ---

exports.view = function(state, role) {
    let view = {
        active: state.active,
        pieces: state.pieces,
        log: state.log,
        prompt: null,
        actions: {},
        selected: state.selected,
        cef: state.cef
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
            if (isNaN(s)) return;
            let unitsInSpace = data.units.filter(u => current_pieces[u.id] === space.id);
            let count = unitsInSpace.filter(u => u.type !== 'fort').length;
            if (count >= 3) return;
            if (unit.side === "german") {
                let valid = (s >= 1 && s <= 4) || s === 20 || (s >= 24 && s <= 52);
                if (!valid) return;
            } 
            else if (unit.side === "soviet") {
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

    view.actions.undo = (state.undo && state.undo.length > 0) ? 1 : 0;

    if (state.state === "setup_german") {
        if (role === "German") {
            if (!state.stance) {
                view.prompt = "German Setup: Choose your Stance.";
                view.actions.set_stance = ['track_land', 'track_naval'];
                return view; 
            }
            let unplaced = get_unplaced_units("german");
            if (unplaced.length === 0) {
                view.prompt = "All units placed. End Setup to continue.";
                view.actions.end_setup = 1; 
            } else {
                view.prompt = `German Setup: ${unplaced.length} units remaining.`;
                view.actions.end_setup = 0; 
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
    else if (state.state === "event_phase") {
        view.prompt = "Event Phase: German to roll.";
        if (role === "German") view.actions.roll_event = 1;
    }
    else if (state.state === "event_choice") {
        view.prompt = "Event Result 2: Choose effect.";
        if (role === "German") {
            view.actions.choose_navy = 1;
            view.actions.choose_shipping = 1;
        }
    }
    else if (state.state === "evacuation_phase") {
        view.prompt = "Evacuation Phase: German to roll for CEF.";
        if (role === "German") view.actions.roll_evacuation = 1;
    }
    else {
        view.prompt = "Next Phase (Not implemented).";
    }

    return view;
};

// Helper to push current state to undo stack
function push_undo(game) {
    let state = {
        pieces: JSON.parse(JSON.stringify(game.pieces)),
        stance: game.stance,
    };
    game.undo.push(state);
}

exports.action = function (state, role, action, args) {
    let game = state;

    // --- SETUP ACTIONS ---
    if (action === "set_stance") {
        // FIXED: Save state including 'stance'
        push_undo(game); 
        game.pieces["marker_stance"] = args;
        game.stance = (args === "track_land") ? "Land" : "Naval";
    }

    if (action === "select") {
        let unit = data.units.find(u => u.id === args);
        if (unit.side.toLowerCase() !== role.toLowerCase()) return game; 
        game.selected = args;
    }

    if (action === "deselect") {
        game.selected = null;
    }

    if (action === "place") {
        if (!game.selected) return game;
        // FIXED: Save state including 'stance'
        push_undo(game);
        game.pieces[game.selected] = args;
        game.selected = null;
    }

    if (action === "undo") {
        if (game.undo.length > 0) {
            let prev = game.undo.pop();
            // FIXED: Restore both pieces and stance
            game.pieces = prev.pieces;
            game.stance = prev.stance;
            game.selected = null;
        }
    }

    if (action === "end_setup") {
        game.selected = null;
        game.undo = [];
        if (game.state === "setup_german") {
            game.active = "Soviet";
            game.state = "setup_soviet";
            game.log.push("German setup finished.");
        } else if (game.state === "setup_soviet") {
            game.active = "German";
            game.state = "event_phase"; 
            game.log.push("Soviet setup finished.");
            game.log.push("--- Turn " + game.turn + " Event Phase ---");
        }
    }

    // --- EVENT & EVACUATION ACTIONS ---
    // (Keep existing event logic, it doesn't need undo as it involves dice)
    // ... [Previous Event/Evacuation Logic] ...
    // For brevity, I am re-including the critical parts below
    
    if (action === "roll_event") {
        let die = Math.floor(Math.random() * 6) + 1;
        let modifiers = 0;
        let sov_chits = count_russian_activation_chits(game);
        if (sov_chits === 0) modifiers += 1;
        if (sov_chits === 2) modifiers -= 1;

        let final_roll = Math.max(1, Math.min(6, die + modifiers));
        game.log.push(`Event Roll: ${die} (${modifiers>=0?'+':''}${modifiers}) = ${final_roll}`);

        game.major_exodus = false;
        game.russian_halt = false;

        switch(final_roll) {
            case 1: 
                game.log.push("Result: Major Exodus");
                game.major_exodus = true;
                game.state = "evacuation_phase";
                break;
            case 2:
                game.log.push("Result: German Navy OR Shipping");
                game.state = "event_choice";
                return game;
            case 3:
                if (game.stance === "Naval") {
                    game.log.push("Result: German Navy");
                    place_chit(game, "ger_navy");
                } else {
                    game.log.push("Result: Russian Halt");
                    game.russian_halt = true;
                }
                game.state = "evacuation_phase";
                break;
            case 4:
                game.log.push("Result: German Shipping");
                place_chit(game, "ger_ship");
                game.state = "evacuation_phase";
                break;
            case 5:
                game.log.push("Result: Russian Halt");
                game.russian_halt = true;
                game.state = "evacuation_phase";
                break;
            case 6:
                game.log.push("Result: Russian Activation");
                place_chit(game, "sov_act");
                game.state = "evacuation_phase";
                break;
        }
    }

    if (action === "choose_navy") {
        game.log.push("German chose: German Navy");
        place_chit(game, "ger_navy");
        game.state = "evacuation_phase";
    }
    if (action === "choose_shipping") {
        game.log.push("German chose: German Shipping");
        place_chit(game, "ger_ship");
        game.state = "evacuation_phase";
    }

    if (action === "roll_evacuation") {
        // ... (Keep existing evacuation logic) ...
        // Re-pasting for completeness to avoid breaking the file
        game.log.push("--- Evacuation Phase ---");
        let land_cef = 0;
        if (game.major_exodus) {
            let d1 = Math.floor(Math.random() * 6) + 1;
            let d2 = Math.floor(Math.random() * 6) + 1;
            land_cef = d1 + d2;
            game.log.push(`Land (Major Exodus): rolled ${d1}+${d2} = ${land_cef} CEF`);
        } else {
            let die = Math.floor(Math.random() * 6) + 1;
            let base_cef = (die <= 2) ? 1 : (die <= 5) ? 2 : 3;
            if (is_fully_occupied_by(game, [20, 21, 22, 23, 24, 25], "german")) {
                base_cef *= 2;
                game.log.push(`Land: rolled ${die} (Bonus x2) = ${base_cef} CEF`);
            } else {
                game.log.push(`Land: rolled ${die} = ${base_cef} CEF`);
            }
            land_cef = base_cef;
        }
        game.cef += land_cef;

        let die = Math.floor(Math.random() * 6) + 1;
        let mod = 0;
        mod += count_chits_in_box(game, "ger_navy");
        mod += count_chits_in_box(game, "ger_ship");
        if (game.major_sinking) mod -= 5;
        if (is_fully_occupied_by(game, [33, 41], "soviet")) mod -= 1;
        if (is_fully_occupied_by(game, [1, 2, 23, 24], "soviet")) mod -= 1;

        let final_roll = Math.max(1, die + mod);
        let sea_cef = (final_roll === 1) ? 0 : (final_roll >= 10) ? 9 : final_roll - 1;

        let msg = "";
        if (game.major_exodus && game.stance === "Naval") {
            sea_cef *= 3;
            msg = " (x3 Major Exodus/Naval)";
        }

        game.log.push(`Sea: rolled ${die} (${mod>=0?'+':''}${mod}) = ${final_roll} -> ${sea_cef} CEF${msg}`);
        game.cef += sea_cef;
        game.log.push(`Total CEF: ${game.cef}`);
        game.state = "next_phase_placeholder"; 
    }

    return game;
};

function place_chit(game, type) {
    let slots = [`track_${type}1`, `track_${type}2`];
    let target = null;
    let occupied1 = Object.values(game.pieces).includes(slots[0]);
    let occupied2 = Object.values(game.pieces).includes(slots[1]);
    
    if (!occupied1) target = slots[0];
    else if (!occupied2) target = slots[1];

    if (!target) {
        game.log.push(`Track ${type} full.`);
        return;
    }

    let chit = data.units.find(u => u.type === 'chit' && u.id !== "marker_stance" && game.pieces[u.id] === null);
    if (chit) {
        game.pieces[chit.id] = target;
        game.log.push(`Chit added to ${data.spaces.find(s=>s.id===target).name}.`);
    }
}

function count_russian_activation_chits(game) {
    let count = 0;
    let slots = ["track_sov_act1", "track_sov_act2"];
    for(let uid in game.pieces) {
        if (slots.includes(game.pieces[uid])) count++;
    }
    return count;
}

function is_fully_occupied_by(game, spaces, side) {
    for (let spaceId of spaces) {
        let occupied = false;
        let sid = String(spaceId);
        for (let uid in game.pieces) {
            if (game.pieces[uid] === sid) {
                let unit = data.units.find(u => u.id === uid);
                if (unit.side === side) {
                    occupied = true;
                    break;
                }
            }
        }
        if (!occupied) return false;
    }
    return true;
}