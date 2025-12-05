"use strict";

/**
 * EVACUATION OF KÖNIGSBERG - Server-side Rules
 * 
 * This file contains the core game logic, state management, and view generation.
 * It is executed on the server (Node.js) but shares data definitions with the client.
 * 
 * Key Responsibilities:
 * 1. Initializing the game state (setup).
 * 2. Processing player actions (action).
 * 3. Generating the player-specific view (view).
 */

const data = require("./data.js");

exports.scenarios = ["Standard Game"];
exports.roles = ["Soviet", "German"];

// --- ADJACENCY GRAPH ---
// Build a bi-directional adjacency list from the 'ways' defined in data.js.
// This allows for O(1) lookups of neighbors for any given space.
let adj = {};
if (data.ways) {
    data.ways.forEach(row => {
        let source = String(row[0]);

        if (!adj[source]) adj[source] = [];

        for (let i = 1; i < row.length; i++) {
            let target = String(row[i]);

            if (!adj[source].includes(target)) {
                adj[source].push(target);
            }

            // Ensure bidirectionality
            if (!adj[target]) adj[target] = [];
            if (!adj[target].includes(source)) {
                adj[target].push(source);
            }
        }
    });
}

/**
 * Initializes the game state.
 * @param {number} seed - Random seed for the game.
 * @param {string} scenario - Selected scenario name.
 * @param {Object} options - Game options.
 * @returns {Object} The initial game state.
 */
exports.setup = function (seed, scenario, options) {
    let game = {
        seed: seed,
        scenario: scenario,
        options: options,
        log: [],       // Game history log
        undo: [],      // Undo stack

        // Turn & Phase Tracking
        active: "German",
        state: "setup_german",
        turn: 1,

        // Game Specific State
        stance: null,        // German Stance (Land or Naval)
        cef: 0,              // Cumulative Evacuation Force (Score)
        major_exodus: false, // Event flag
        russian_halt: false, // Event flag
        major_sinking: false,// Event flag

        // Unit State
        selected: null, // Currently selected unit ID (server-side tracking)
        pieces: {},     // Map: unitId -> spaceId (or null if off-map)
        moved: {},      // Map: unitId -> movement points used this turn
    };

    // Initialize all units to off-map (null)
    data.units.forEach(u => {
        game.pieces[u.id] = u.space || null;
    });

    return game;
};

// --- HELPER FUNCTIONS ---

/**
 * Checks if a space is occupied by enemy units.
 * @param {Object} game - Current game state.
 * @param {string} spaceId - Space to check.
 * @param {string} friendlySide - The side checking (to identify enemies).
 * @returns {boolean} True if enemy units are present.
 */
function is_enemy_occupied(game, spaceId, friendlySide) {
    for (let uid in game.pieces) {
        if (game.pieces[uid] === String(spaceId)) {
            let unit = data.units.find(u => u.id === uid);
            if (unit.side !== "neutral" && unit.side !== friendlySide) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Calculates valid move destinations for a unit.
 * @param {Object} game - Current game state.
 * @param {string} unitId - Unit to move.
 * @returns {Array<string>} List of valid destination space IDs.
 */
function get_valid_moves(game, unitId) {
    let unit = data.units.find(u => u.id === unitId);
    let start = game.pieces[unitId];
    if (!start) return [];

    let valid_destinations = [];
    let neighbors = adj[String(start)] || [];

    for (let next of neighbors) {
        // Rule: Units stop adjacent to enemies and fire from a distance.
        // (Simplified for now: Cannot enter enemy occupied spaces directly)
        if (!is_enemy_occupied(game, next, unit.side)) {
            valid_destinations.push(next);
        }
    }
    return valid_destinations;
}

/**
 * Checks for stacking limit violations (Max 3 units per space).
 * @param {Object} game - Current game state.
 * @returns {Array<string>} List of space IDs that are overstacked.
 */
function check_stacking_limits(game) {
    let counts = {};
    let overstacked = [];
    for (let uid in game.pieces) {
        let s = game.pieces[uid];
        if (s && !s.startsWith("track_")) {
            let u = data.units.find(unit => unit.id === uid);
            // Hard limit: Forts and Chits are excluded from the count.
            if (u.type !== 'fort' && u.type !== 'chit') {
                counts[s] = (counts[s] || 0) + 1;
            }
        }
    }
    for (let s in counts) {
        if (counts[s] > 3) overstacked.push(s);
    }
    return overstacked;
}

/**
 * Counts the number of chits in a specific track box.
 */
function count_chits_in_box(game, boxNamePrefix) {
    let count = 0;
    let slots = [`track_${boxNamePrefix}1`, `track_${boxNamePrefix}2`];
    for (let uid in game.pieces) {
        if (slots.includes(game.pieces[uid])) count++;
    }
    return count;
}

function count_russian_activation_chits(game) {
    return count_chits_in_box(game, "sov_act");
}

/**
 * Places a chit into the first available slot of a track.
 */
function place_chit(game, type) {
    let slots = [`track_${type}1`, `track_${type}2`];
    let target = null;
    let occupied1 = Object.values(game.pieces).includes(slots[0]);
    let occupied2 = Object.values(game.pieces).includes(slots[1]);
    if (!occupied1) target = slots[0];
    else if (!occupied2) target = slots[1];

    if (!target) {
        game.log.push(`Track ${type} full: No Effect.`);
        return;
    }

    // Find an unused chit
    let chit = data.units.find(u => u.type === 'chit' && u.id !== "marker_stance" && game.pieces[u.id] === null);
    if (chit) {
        game.pieces[chit.id] = target;
        game.log.push(`Chit added to ${data.spaces.find(s => s.id === target).name}.`);
    }
}

/**
 * Checks if a set of spaces is fully occupied by a specific side.
 * Used for calculating bonuses (e.g., holding the perimeter).
 */
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

// --- VIEW GENERATION ---

/**
 * Generates the view for a specific player.
 * Filters state based on Fog of War (if any) and calculates available actions.
 * @param {Object} state - Current game state.
 * @param {string} role - "German", "Soviet", or "Observer".
 * @returns {Object} The view object sent to the client.
 */
exports.view = function (state, role) {
    let view = {
        active: state.active,
        pieces: state.pieces,
        log: state.log,
        prompt: null,
        actions: {},
        selected: state.selected,
        cef: state.cef,
        overstacked: []
    };

    // Helper: List units that haven't been placed yet
    function get_unplaced_units(side) {
        let list = [];
        data.units.forEach(u => {
            if (state.pieces[u.id] === null && u.side === side && u.type !== 'fort' && u.type !== 'chit') {
                list.push(u.id);
            }
        });
        return list;
    }

    // Helper: List units that can be selected for action
    function list_selectable_units(side) {
        let list = [];
        data.units.forEach(u => {
            let isSetup = state.state.startsWith("setup");
            let isMovement = state.state.startsWith("movement");

            if (state.pieces[u.id] === null && isSetup && u.side === side && u.type !== 'fort' && u.type !== 'chit') {
                list.push(u.id);
            }
            if (state.pieces[u.id] !== null && isMovement && u.side === side && u.type !== 'fort' && u.type !== 'chit') {
                list.push(u.id);
            }
        });
        return list;
    }

    // Helper: List valid setup locations for a unit
    function list_valid_spaces_setup(unitId) {
        let list = [];
        let unit = data.units.find(u => u.id === unitId);
        let current_pieces = state.pieces;
        data.spaces.forEach(space => {
            let s = parseInt(space.id);
            if (isNaN(s)) return;

            // Check stacking limit
            let unitsInSpace = data.units.filter(u => current_pieces[u.id] === space.id);
            let count = unitsInSpace.filter(u => u.type !== 'fort').length;
            if (count >= 3) return;

            // Faction-specific setup zones
            if (unit.side === "german") {
                let valid = (s >= 1 && s <= 4) || s === 20 || (s >= 24 && s <= 52);
                if (!valid) return;
            }
            else if (unit.side === "soviet") {
                let valid = (s >= 2 && s <= 24);
                if (!valid) return;

                // Cannot setup with enemies
                let hasGerman = unitsInSpace.some(u => u.side === "german");
                if (hasGerman) return;

                // Cannot mix armies
                let differentArmy = unitsInSpace.find(u => u.side === "soviet" && u.army !== unit.army);
                if (differentArmy) return;
            }
            list.push(space.id);
        });
        return list;
    }

    // Enable Undo if history exists
    view.actions.undo = (state.undo && state.undo.length > 0) ? 1 : 0;

    // --- STATE MACHINE FOR VIEW GENERATION ---

    if (state.state === "setup_german") {
        if (role === "German") {
            if (!state.stance) {
                view.prompt = "German Setup: Choose your Stance.";
                view.actions.set_stance = ['track_land', 'track_naval'];
            } else {
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
                    view.actions.place = list_valid_spaces_setup(state.selected);
                    view.actions.deselect = 1;
                } else {
                    view.actions.select = list_selectable_units("german");
                }
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
                view.actions.place = list_valid_spaces_setup(state.selected);
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
    else if (state.state === "movement_german") {
        if (role === "German") {
            view.prompt = "German Movement Phase.";
            view.actions.end_movement = 1;
            if (state.selected) {
                let movesTaken = state.moved[state.selected] || 0;
                let movesLeft = 3 - movesTaken;
                view.prompt = `Select destination (${movesLeft} moves left).`;

                if (movesLeft > 0) {
                    view.actions.move = get_valid_moves(state, state.selected);
                }

                if (movesTaken > 0) view.actions.stop = 1;
                else view.actions.deselect = 1;

            } else {
                let list = [];
                data.units.forEach(u => {
                    let m = state.moved[u.id] || 0;
                    if (u.side === "german" && state.pieces[u.id] && m < 3) {
                        list.push(u.id);
                    }
                });
                view.actions.select = list;
            }
        } else {
            view.prompt = "German Movement...";
        }
    }
    else if (state.state === "movement_soviet") {
        if (role === "Soviet") {
            view.prompt = "Soviet Movement Phase.";
            view.actions.end_movement = 1;
            if (state.selected) {
                let movesTaken = state.moved[state.selected] || 0;
                let movesLeft = 3 - movesTaken;
                view.prompt = `Select destination (${movesLeft} moves left).`;

                if (movesLeft > 0) {
                    view.actions.move = get_valid_moves(state, state.selected);
                }

                if (movesTaken > 0) view.actions.stop = 1;
                else view.actions.deselect = 1;

            } else {
                let list = [];
                data.units.forEach(u => {
                    let m = state.moved[u.id] || 0;
                    if (u.side === "soviet" && state.pieces[u.id] && m < 3) {
                        list.push(u.id);
                    }
                });
                view.actions.select = list;
            }
        } else {
            view.prompt = "Soviet Movement...";
        }
    }
    else if (state.state.startsWith("elimination")) {
        let activeRole = (state.state === "elimination_german") ? "German" : "Soviet";
        let activeSide = activeRole.toLowerCase();
        view.overstacked = check_stacking_limits(state);

        if (role === activeRole) {
            if (view.overstacked.length === 0) {
                view.prompt = "Stacking resolved. Click End Elimination.";
                view.actions.end_elimination = 1;
            } else {
                view.prompt = "Stacking limit exceeded! Select a unit to eliminate.";
                if (state.selected) {
                    view.actions.eliminate = 1;
                    view.actions.deselect = 1;
                } else {
                    let list = [];
                    view.overstacked.forEach(spaceId => {
                        data.units.forEach(u => {
                            if (state.pieces[u.id] === spaceId && u.side === activeSide && u.type !== 'fort') {
                                list.push(u.id);
                            }
                        });
                    });
                    view.actions.select = list;
                }
            }
        } else {
            view.prompt = `${activeRole} is eliminating units...`;
        }
    }
    else if (state.state === "combat_phase") {
        view.prompt = "Combat Phase (Placeholder).";
    }

    return view;
};

// --- ACTION HANDLING ---

/**
 * Saves the current state to the undo stack.
 */
function push_undo(game) {
    let copy = Object.assign({}, game);
    delete copy.undo;
    delete copy.log;
    delete copy.seed;
    delete copy.scenario;
    delete copy.options;
    game.undo.push(JSON.parse(JSON.stringify(copy)));
}

/**
 * Processes a player action.
 * @param {Object} state - Current game state.
 * @param {string} role - Role performing the action.
 * @param {string} action - Action name (e.g., "move").
 * @param {any} args - Action arguments.
 * @returns {Object} The new game state.
 */
exports.action = function (state, role, action, args) {
    let game = state;

    // --- SELECTION ACTIONS ---
    if (action === "select") {
        let unit = data.units.find(u => u.id === args);
        if (unit.side.toLowerCase() !== role.toLowerCase()) return game;
        game.selected = args;
    }
    if (action === "deselect") game.selected = null;

    // --- UNDO ACTION ---
    if (action === "undo") {
        if (game.undo.length > 0) {
            let prev = game.undo.pop();
            game.pieces = prev.pieces;
            game.stance = prev.stance;
            game.moved = prev.moved || {};
            game.selected = null;
        }
    }

    // --- SETUP ACTIONS ---
    if (action === "set_stance") {
        push_undo(game);
        game.pieces["marker_stance"] = args;
        game.stance = (args === "track_land") ? "Land" : "Naval";
    }
    if (action === "place") {
        if (!game.selected) return game;
        push_undo(game);
        game.pieces[game.selected] = args;
        game.selected = null;
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
        }
    }

    // --- EVENT PHASE ACTIONS ---
    if (action === "roll_event") {
        let die = Math.floor(Math.random() * 6) + 1;
        let modifiers = 0;
        let sov_chits = count_russian_activation_chits(game);
        if (sov_chits === 0) modifiers += 1;
        if (sov_chits === 2) modifiers -= 1;
        let final_roll = Math.max(1, Math.min(6, die + modifiers));
        game.log.push(`Event Roll: ${die} (${modifiers >= 0 ? '+' : ''}${modifiers}) = ${final_roll}`);
        game.major_exodus = false;
        game.russian_halt = false;
        switch (final_roll) {
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

    // --- EVACUATION PHASE ACTIONS ---
    if (action === "roll_evacuation") {
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
        game.log.push(`Sea: rolled ${die} (${mod >= 0 ? '+' : ''}${mod}) = ${final_roll} -> ${sea_cef} CEF${msg}`);
        game.cef += sea_cef;

        game.state = "movement_german";
        game.active = "German";
        game.undo = [];
    }

    // --- MOVEMENT ACTIONS ---
    if (action === "move") {
        if (!game.selected) throw new Error("No selection");
        let unitId = game.selected;
        let dest = args;
        let validMoves = get_valid_moves(game, unitId);
        if (!validMoves.includes(dest)) throw new Error("Invalid move");

        push_undo(game);

        game.pieces[unitId] = dest;
        game.moved[unitId] = (game.moved[unitId] || 0) + 1;

        if (game.moved[unitId] >= 3) {
            game.selected = null;
        }
    }

    if (action === "stop") {
        if (!game.selected) throw new Error("No selection");
        game.moved[game.selected] = 3; // Cap movement
        game.selected = null;
    }

    if (action === "end_movement") {
        let issues = check_stacking_limits(game);
        if (issues.length > 0) {
            game.state = (game.active === "German") ? "elimination_german" : "elimination_soviet";
            game.log.push(`Stacking limits exceeded. Eliminate units.`);
            game.selected = null;
            return game;
        }
        game.selected = null;
        game.undo = [];
        game.moved = {};
        if (game.state === "movement_german") {
            game.state = "movement_soviet";
            game.active = "Soviet";
            game.log.push("German Movement ended.");
        } else if (game.state === "movement_soviet") {
            game.state = "combat_phase";
            game.active = "German";
            game.log.push("Soviet Movement ended. Combat Phase.");
        }
    }

    // --- ELIMINATION ACTIONS ---
    if (action === "eliminate") {
        if (!game.selected) throw new Error("No unit selected");
        push_undo(game);
        game.pieces[game.selected] = null;
        game.log.push(`${data.units.find(u => u.id === game.selected).name} eliminated.`);
        game.selected = null;
    }

    if (action === "end_elimination") {
        let issues = check_stacking_limits(game);
        if (issues.length > 0) throw new Error("Still overstacked.");

        // FIX: Clear undo stack before passing turn to prevent cross-turn undo
        game.undo = [];

        if (game.state === "elimination_german") {
            game.state = "movement_soviet";
            game.active = "Soviet";
            game.log.push("German Elimination ended. Turn passes to Soviet.");
        } else {
            game.state = "combat_phase";
            game.active = "German";
            game.log.push("Soviet Elimination ended. Combat Phase begins.");
        }
    }

    return game;
};