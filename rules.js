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

        // Combat State
        attacks: [],   // List of declared attacks {attacker, target, source, type}
        battles: [],   // List of unresolved battles (grouped attacks)
        combat_log: [],
        combat_last_active: null, // Stores active player during defensive retreats

        // Game Specific State
        stance: null,        // German Stance (Land or Naval)
        cef: 0,              // Cumulative Evacuation Force (Score)
        major_exodus: false, // Event flag
        russian_halt: false, // Event flag
        major_sinking: false,// Event flag

        // Russian Reaction State
        sea_cef_this_turn: 0,
        major_sinking_last_turn: false,

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

// Helper for Advance Logic
function check_advance_after_combat(game, spaceId) {
    // Check if space is vacated
    let occupants = get_units_in_space(game, spaceId);
    // Ignore chits/markers if any (but 'chit' is a unit type). 
    // Advance condition: "If a point is vacated due to combat"
    // Usually markers don't block.
    if (occupants.some(u => u.type !== 'chit')) {
        // Not vacated (still has units)
        game.state = "combat_resolve";
        game.combat_index++;
        return;
    }

    // Vacated! Identify candidates
    let candidates = [];
    game.attacks.forEach(a => {
        // If attacker targeted something in this space.
        // We don't have the original target location stored in 'a', but we can infer from adjacency?
        // No, target might have retreated out.
        // But we DO know that 'a.target' was targeted.
        // Was 'a.target' in 'spaceId'?
        // We know the current combat just resolved involved 'target' (which was in 'spaceId' at start of roll).
        // So any attacker who targeted a unit that WAS in this space.
        // This effectively means: All attackers who targeted units that were in 'spaceId'.

        // This is tricky because we iterate attacks linearly.
        // Previous attacks might have been against other units in the same space.
        // Future attacks might be against units in the same space.
        // "all attacking units ... that targeted a unit/marker in that point"
        // We should check ALL successful/pending attacks against this point?
        // But some might have been resolved already.
        // Simplified: Any unit that declared an attack against a target that is/was in this space.
        // But we lost track of where targets were.

        // BETTER APPROACH: Check adjacency of ALL attackers in 'game.attacks'.
        // If an attacker is adjacent to 'spaceId' AND declared an attack against a unit that was in 'spaceId'.
        // We can't know for sure where they were.
        // BUT, advance happens immediately after combat in that square.
        // Let's assume candidates are:
        // 1. The unit that just attacked (if successful elimination/retreat).
        // 2. Any other units that attacked THIS SAME target?
        // 3. What about other units attacking other targets in the same space?
        // "Three Russian units in adjacent point 7... decide to attack... 2 vs Fort, 2 vs Unit... Fort eliminated... Unit retreated... advance into vacated point."

        // So ALL units that targeted ANY unit in the hex are eligible.
        // Since we don't store "original target space" in game.attacks, we must rely on:
        // "Is attacker adjacent to the vacated space?" (Yes, required for combat)
        // "Did attacker target something?" (Yes, in game.attacks)
        // Did attacker target something *in this space*?
        // We can assume if attacker is adjacent, and we just vacated this space, it's likely the target space.
        // But it could be adjacent to multiple spaces.

        // To be correct, I SHOULD have stored 'targetSource' in 'game.attacks'.
        // I will assume for now that if the attacker performed an attack on 'target.id' (current target), it's eligible.
        // But what about other targets in the same space?
        // Those targets are also gone (vacated).
        // So any attacker who targeted any unit that is NOT currently on the map (eliminated) or is in the retreat destination?
        // This is getting messy.

        // FIX: I will update 'target' action to store 'targetSpace' in 'game.attacks'.
        // I'll do this by editing the 'target' action I added earlier.
        // Then I can use it here.
    });

    // For now, I'll use a hack: checking if attacker is adjacent to 'spaceId'.
    // And is in 'game.attacks'.
    // Providing this "lenient" advance logic is acceptable for now.

    game.attacks.forEach(a => {
        // Precise check using stored targetSpace
        if (a.targetSpace === spaceId) {
            // Check if attacker is still adjacent (didn't retreat/move)
            let currentSource = game.pieces[a.attacker];
            let neighbors = adj[String(spaceId)] || [];
            if (currentSource && neighbors.includes(currentSource)) {
                candidates.push(a.attacker);
            }
        }
    });

    if (candidates.length > 0) {
        game.state = "combat_advance";
        game.advance_space = spaceId;
        game.advance_candidates = candidates;
    } else {
        game.state = "combat_resolve";
        game.combat_index++;
    }
}

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

/**
 * Calculates attack limits for the current turn/player.
 * @returns {Object} { maxPoints: number, maxUnitsPerPoint: number }
 */
function get_combat_limits(game, side) {
    if (side === "soviet") {
        if (game.russian_halt) return { maxPoints: 0, maxUnitsPerPoint: 3 };
        let chits = count_russian_activation_chits(game);
        let points = 2; // Default (0 chits)
        if (chits === 1) points = 4;
        if (chits === 2) points = 6;
        return { maxPoints: points, maxUnitsPerPoint: 3 };
    } else {
        // German
        return { maxPoints: 2, maxUnitsPerPoint: 2 };
    }
}

/**
 * Validates if a unit can attack.
 * Returns null if valid, or reason string if not.
 */
function can_unit_attack(game, unitId) {
    let unit = data.units.find(u => u.id === unitId);
    let spaceId = game.pieces[unitId];
    if (!spaceId) return "Off-map";
    if (unit.type === 'fort' || unit.type === 'chit') return "Cannot attack";

    // Check if already attacking
    if (game.attacks.some(a => a.attacker === unitId)) return "Already attacking";

    // Check adjacency to enemies
    let neighbors = adj[String(spaceId)] || [];
    let hasEnemy = false;
    for (let next of neighbors) {
        if (is_enemy_occupied(game, next, unit.side)) {
            hasEnemy = true;
            break;
        }
    }
    if (!hasEnemy) return "No adjacent enemies";

    // Check Limits
    let limits = get_combat_limits(game, unit.side);

    // Count used points and units
    let usedPoints = new Set();
    let unitsFromSpace = 0;

    game.attacks.forEach(a => {
        let u = data.units.find(x => x.id === a.attacker);
        if (u.side === unit.side) {
            usedPoints.add(a.source);
            if (a.source === spaceId) unitsFromSpace++;
        }
    });

    if (unitsFromSpace >= limits.maxUnitsPerPoint) return "Max units from this point used";

    // If this point is not yet used, check if we can add a new point
    if (!usedPoints.has(spaceId)) {
        if (usedPoints.size >= limits.maxPoints) return "Max attack points used";
    }

    return null;
}


/**
 * Returns list of unit objects in a space.
 */
function get_units_in_space(game, spaceId) {
    let list = [];
    let sid = String(spaceId);
    for (let uid in game.pieces) {
        if (game.pieces[uid] === sid) {
            let u = data.units.find(x => x.id === uid);
            if (u) list.push(u);
        }
    }
    return list;
}

/**
 * Calculates valid retreat options.
 * Priority: 1. Empty Spaces. 2. Non-Enemy Spaces.
 */
function get_retreat_options(game, unitId) {
    let unit = data.units.find(u => u.id === unitId);
    let spaceId = game.pieces[unitId];
    if (!spaceId) return [];

    let neighbors = adj[String(spaceId)] || [];
    let empty = [];
    let friendly = [];

    for (let next of neighbors) {
        // Check contents
        let occupants = get_units_in_space(game, next);
        if (occupants.length === 0) {
            empty.push(next);
        } else {
            // Check for enemy
            let hasEnemy = occupants.some(u => u.side !== "neutral" && u.side !== unit.side);
            // Check if overstacked? retreat rules say "does not violate stacking limits"
            let count = occupants.filter(u => u.type !== 'fort' && u.type !== 'chit').length;
            if (unit.type !== 'fort' && unit.type !== 'chit') {
                if (count >= 3) hasEnemy = true; // Treat full stack as invalid
            }

            if (!hasEnemy) {
                friendly.push(next);
            }
        }
    }

    if (empty.length > 0) return empty;
    return friendly;
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

    // Enable Undo if history exists and player is active
    view.actions.undo = (state.undo && state.undo.length > 0 && role === state.active) ? 1 : 0;

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
    else if (state.state === "russian_reaction_phase") {
        view.prompt = "Russian Reaction Phase: Roll for Major Sinking.";
        if (role === "Soviet") view.actions.roll_reaction = 1;
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
    else if (state.state === "combat_setup") {
        let side = state.active.toLowerCase();
        let limits = get_combat_limits(state, side);

        let usedPoints = new Set();
        let attackCount = 0;
        state.attacks.forEach(a => {
            let u = data.units.find(x => x.id === a.attacker);
            if (u.side === side) {
                usedPoints.add(a.source);
                attackCount++;
            }
        });

        if (role === state.active) {
            view.prompt = `Combat Phase: Designate Attacks. (Points: ${usedPoints.size}/${limits.maxPoints})`;
            view.actions.end_combat_setup = 1;

            if (state.selected) {
                view.prompt = "Select target.";
                let attacker = data.units.find(u => u.id === state.selected);
                let source = state.pieces[state.selected];
                let neighbors = adj[source] || [];
                let targets = [];

                // Get all valid targets in adjacent spaces
                // Get all valid targets in adjacent spaces
                neighbors.forEach(nid => {
                    let unitsInSpace = get_units_in_space(state, nid);
                    let hasEnemy = unitsInSpace.some(u => u.side !== "neutral" && u.side !== side && u.type !== 'chit');

                    if (hasEnemy) {
                        unitsInSpace.forEach(u => {
                            if (u.side !== "neutral" && u.side !== side && u.type !== 'chit') targets.push(u.id);
                            if (u.type === 'fort') targets.push(u.id);
                        });
                    } else if (unitsInSpace.length === 0) {
                        // Target empty space
                        targets.push(nid);
                    }
                });
                view.actions.target = targets;
                view.actions.deselect = 1;
            } else {
                let list = [];
                data.units.forEach(u => {
                    if (u.side === side && can_unit_attack(state, u.id) === null) {
                        list.push(u.id);
                    }
                });
                view.actions.select = list;
            }

            // Show declarations? They are in view.attacks (if we add it to view)
            // But usually we want to see lines or highlights. 
            // We can add declared attacks to view so client can draw arrows.
            view.attacks = state.attacks;

        } else {
            view.prompt = state.active + " is designating attacks...";
            view.attacks = state.attacks;
        }
    }


    else if (state.state === "combat_resolve") {
        if (state.combat_index < state.attacks.length) {
            let attack = state.attacks[state.combat_index];
            let attUnit = data.units.find(u => u.id === attack.attacker);
            let defUnit = data.units.find(u => u.id === attack.target);

            // Validate existence
            if (state.pieces[attack.target] === null) {
                view.prompt = `${defUnit.name} already eliminated. Attack skipped.`;
                if (role === state.active) view.actions.next_attack = 1;
            } else if (state.pieces[attack.target] !== state.pieces[attack.target]) { // Logic error in thought? Check if moved?
                // Wait, we need to know where it WAS.
                // Attack stores 'target' ID.
                // If target moved, it's not there.
                // "If a targeted unit has been retreated... attacking unit... may not attack anything else".
                // So we check if target is still adjacent/in-place?
                // Actually, if it retreated, it is likely NOT adjacent to some attackers or simply "retreated".
                // A simple check: Is target still adjacent to attacker?
                // Or better: Is target still in the space it was targeted in?
                // But we didn't store original target space in Declared Attack (we stored source).
                // We should have stored target space? Yes but we can assume if it moved it retreated.
                // Let's just check if they are adjacent.
                let attSpace = state.pieces[attack.attacker];
                let defSpace = state.pieces[attack.target];
                let neighbors = adj[attSpace] || [];
                if (!neighbors.includes(defSpace)) {
                    view.prompt = `${defUnit.name} retreated/moved. Attack skipped.`;
                    if (role === state.active) view.actions.next_attack = 1;
                } else {
                    view.prompt = `Combat Resolution: ${attUnit.name} attacks ${defUnit.name}.`;
                    if (role === state.active) view.actions.roll_combat = 1;
                }
            } else {
                view.prompt = `Combat Resolution: ${attUnit.name} attacks ${defUnit.name}.`;
                if (role === state.active) view.actions.roll_combat = 1;
            }
        } else {
            view.prompt = "Combat finished.";
            if (role === state.active) view.actions.end_combat = 1;
        }
    }
    else if (state.state === "combat_retreat") {
        view.prompt = `Retreat ${state.retreat_unit} to where?`;
        if (role === state.active) {
            view.actions.retreat = state.retreat_options;
            view.retreat_unit = state.retreat_unit; // Export for UI highlighting
        }
    }
    else if (state.state === "combat_advance") {
        view.prompt = "Advance After Combat: Select units to advance.";
        if (role === state.active) {
            view.actions.done_advance = 1;
            view.advance_space = state.advance_space; // Export for UI highlighting
            view.actions.select = state.advance_candidates; // Allow selection of candidates
            view.actions.select = state.advance_candidates;
            if (state.selected) {
                view.actions.advance_to = 1; // Enable button
                view.actions.deselect = 1;
            }
        }
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
            game.attacks = prev.attacks || [];
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

        // Apply modifier from PREVIOUS turn's Major Sinking
        if (game.major_sinking_last_turn) {
            mod -= 5;
            game.log.push("Modifier: -5 (Major Sinking last turn)");
        }

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

        // Store for Russian Reaction
        game.sea_cef_this_turn = sea_cef;

        // Reset flags for current turn tracking
        game.major_sinking = false;
        game.major_sinking_last_turn = false;

        if (game.sea_cef_this_turn > 0) {
            game.state = "russian_reaction_phase";
            game.active = "Soviet";
        } else {
            game.state = "movement_german";
            game.active = "German";
        }
        game.undo = [];
    }

    // --- RUSSIAN REACTION PHASE ACTIONS ---
    if (action === "roll_reaction") {
        let die = Math.floor(Math.random() * 6) + 1;
        game.log.push(`Russian Reaction: rolled ${die}`);

        if (die === 6) {
            game.log.push("Rolled 6: Roll again for Major Sinking.");
            let die2 = Math.floor(Math.random() * 6) + 1;
            let mod = count_chits_in_box(game, "ger_navy");
            let final = die2 + mod;
            game.log.push(`Second Roll: ${die2} + ${mod} (German Navy) = ${final}`);

            if (final <= 5) {
                game.log.push("Result: Major Sinking! (-1 Sea CEF)");
                game.cef = Math.max(0, game.cef - 1);
                game.major_sinking_last_turn = true;
            } else {
                game.log.push("Result: No Effect (6+)");
            }
        } else {
            game.log.push("Result: No Effect (1-5)");
        }

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
            game.state = "combat_setup";
            game.active = "German";
            game.moved = {};
            if (!game.attacks) game.attacks = [];
            game.log.push("Soviet Movement ended. Combat Phase begins (German).");
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
            game.state = "combat_setup";
            game.active = "German";
            game.moved = {};
            if (!game.attacks) game.attacks = [];
            game.log.push("Soviet Elimination ended. Combat Phase begins (German).");
        }
    }

    // --- COMBAT SETUP ACTIONS ---
    if (action === "target") {
        if (!game.selected) throw new Error("No attacker selected");
        let targetId = args;
        let attackerId = game.selected;
        let attacker = data.units.find(u => u.id === attackerId);
        let source = game.pieces[attackerId];

        // Verify adjacency
        let targetSpace = game.pieces[targetId]; // Works if target is unit
        if (!targetSpace) targetSpace = targetId; // Works if target is space ID

        let neighbors = adj[source] || [];
        if (!neighbors.includes(targetSpace)) throw new Error("Target not adjacent");

        push_undo(game);
        game.attacks.push({
            attacker: attackerId,
            target: targetId,
            source: source,
            targetSpace: targetSpace // Key for accurate advance logic
        });
        game.selected = null;
    }

    if (action === "end_combat_setup") {
        game.selected = null;
        game.undo = [];
        if (game.attacks.length === 0) {
            game.log.push("No attacks declared.");
            if (game.active === "Soviet") {
                game.turn++;
                game.active = "German";
                game.state = "event_phase";
                game.log.push("Turn " + (game.turn) + " begins.");
                game.attacks = []; // Clear for next turn
                game.moved = {};
            } else {
                game.active = "Soviet";
                game.state = "combat_setup"; // Soviet Setup
                game.attacks = [];
                game.moved = {};
                game.log.push("German Combat ended. Soviet Combat begins.");
            }
        } else {
            game.state = "combat_resolve";
            game.combat_index = 0; // Start with first attack
            game.log.push("Attacks declared. Starting Resolution.");
        }
    }

    // --- COMBAT RESOLUTION ACTIONS ---
    if (action === "roll_combat") {
        let attack = game.attacks[game.combat_index];
        let attacker = data.units.find(u => u.id === attack.attacker);

        // Handle Space Target (Empty Space)
        if (data.spaces.some(s => s.id === attack.target)) {
            // Check if space (attack.target) is empty?
            // "You may “target” an empty point... automatically move into such an “attacked” point"
            // We just trigger advance check on it.
            game.log.push(`${attacker.name} attacks empty point ${attack.target}.`);
            check_advance_after_combat(game, attack.target);
        }

        let target = data.units.find(u => u.id === attack.target);

        // Check if attack is still valid (Target present in adjacent space)
        let targetSpace = game.pieces[target.id];
        let attackerSpace = game.pieces[attacker.id];
        if (!targetSpace || !attackerSpace) {
            game.log.push("Invalid attack (unit missing). Skipped.");
            game.combat_index++;
            return game;
        }

        // Check for Fort protection
        // "if a unit is in a fort and the fort has not been eliminated, the Russian attack against the unit in a fort are not happening."
        // We assume this applies to ANY attack on a unit sharing space with a Fort (unless the target IS the fort).
        if (target.type !== 'fort') {
            let unitsInSpace = get_units_in_space(game, targetSpace);
            if (unitsInSpace.some(u => u.type === 'fort')) {
                game.log.push(`Attack on ${target.name} ineffective: Protected by Fort.`);
                game.combat_index++;
                return game;
            }
        }

        // Execute Attack
        let die = Math.floor(Math.random() * 6) + 1;
        game.log.push(`${attacker.name} attacks ${target.name}. Rolled ${die} (Combat ${attacker.combat}).`);

        if (die <= attacker.combat) {
            let defDie = Math.floor(Math.random() * 6) + 1;
            game.log.push(`Hit! ${target.name} cohesion roll: ${defDie} (Cohesion ${target.cohesion}).`);

            if (defDie <= target.cohesion) {
                game.log.push("No Effect (Saved).");
                game.combat_index++;
            } else {
                let isEliminated = (defDie >= target.cohesion + 2);
                let isRetreat = (defDie === target.cohesion + 1);

                if (target.type === 'fort' && isRetreat) {
                    game.log.push("Fort cannot retreat. Eliminated.");
                    isEliminated = true;
                    isRetreat = false;
                }

                if (isEliminated) {
                    game.log.push("Result: Eliminated.");
                    game.pieces[target.id] = null;
                    check_advance_after_combat(game, targetSpace);
                } else if (isRetreat) {
                    game.log.push("Result: Retreat.");
                    let retreats = get_retreat_options(game, target.id);
                    if (retreats.length === 0) {
                        game.log.push("No retreat path. Eliminated.");
                        game.pieces[target.id] = null;
                        check_advance_after_combat(game, targetSpace);
                    } else if (retreats.length === 1) {
                        game.pieces[target.id] = retreats[0];
                        game.log.push(`${target.name} retreats to ${retreats[0]}.`);
                        check_advance_after_combat(game, targetSpace);
                    } else {
                        game.state = "combat_retreat";
                        game.retreat_unit = target.id;
                        game.retreat_options = retreats;
                        game.retreat_original_space = targetSpace; // Store for advance check

                        // Switch active player if defender is not active
                        let defenderSide = (target.side === "soviet") ? "Soviet" : "German";
                        if (game.active !== defenderSide) {
                            game.combat_last_active = game.active;
                            game.active = defenderSide;
                            game.log.push(`Control passes to ${defenderSide} for retreat.`);
                        }

                        return game;
                    }
                }
            }
        } else {
            game.log.push("Miss.");
            game.combat_index++;
        }
    }

    if (action === "next_attack") {
        game.combat_index++;
    }

    if (action === "retreat") {
        if (!game.retreat_unit) throw new Error("No retreat unit");
        let dest = args;
        if (!game.retreat_options.includes(dest)) throw new Error("Invalid retreat");

        let unit = data.units.find(u => u.id === game.retreat_unit);
        game.pieces[game.retreat_unit] = dest;
        game.log.push(`${unit.name} retreats to ${dest}.`);

        // Check advance
        let originalSpace = game.retreat_original_space;
        game.retreat_unit = null;
        game.retreat_options = null;
        game.retreat_original_space = null;

        // Restore active player
        if (game.combat_last_active) {
            game.active = game.combat_last_active;
            game.combat_last_active = null;
        }

        check_advance_after_combat(game, originalSpace);
    }

    if (action === "done_advance") {
        game.state = "combat_resolve";
        game.combat_index++;
        game.advance_space = null;
        game.advance_candidates = null;
    }

    if (action === "advance_to") {
        if (!game.selected) throw new Error("No unit selected");
        let unitId = game.selected;
        if (!game.advance_candidates.includes(unitId)) throw new Error("Invalid advance unit");

        game.pieces[unitId] = game.advance_space;
        game.log.push(`${data.units.find(u => u.id === unitId).name} advances.`);
        game.selected = null;
        // Stay in advance state to allow more units
    }

    if (action === "end_combat") {
        if (game.active === "Soviet") {
            // Turn End / New Turn
            game.turn++;
            game.active = "German";
            game.state = "event_phase";
            game.log.push("Turn " + game.turn + " begins.");
            game.attacks = [];
            game.moved = {};
        } else {
            // German -> Soviet
            if (game.russian_halt) {
                game.log.push("Russian Halt is active. Soviet Combat skipped.");
                game.turn++;
                game.active = "German";
                game.state = "event_phase";
                game.log.push("Turn " + game.turn + " begins.");
                game.attacks = [];
                game.moved = {};
            } else {
                game.active = "Soviet";
                game.state = "combat_setup"; // Soviet Setup
                game.attacks = [];
                game.moved = {};
                game.log.push("German Combat ended. Soviet Combat begins.");
            }
        }
        game.combat_index = 0;
    }

    return game;
};