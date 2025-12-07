"use strict"

/**
 * EVACUATION OF KÖNIGSBERG - Client-side Game Logic
 * 
 * This file handles the specific view logic for the "Evacuation of Königsberg" module.
 * It interacts with the generic client framework (client.js) and the server-side rules (rules.js).
 * 
 * Key Responsibilities:
 * 1. Rendering the game state (Map, Units, Interface).
 * 2. Handling user input (Clicks on units/spaces).
 * 3. Sending actions to the server.
 */

// Global reference to the current game state received from the server.
// This matches the 'game' object in rules.js.
let game = null;

// Tracks the currently selected unit ID on the client side.
// This mirrors window.view.selected but is kept locally for immediate feedback if needed.
let selectedUnitId = null;

/**
 * Called once when the game page is loaded and the initial state is received.
 * @param {Object} state - The initial game state.
 */
function setup(state) {
    console.log("EoK: Setup received");
    game = state;
    render_interface();
}

/**
 * Called whenever the server sends a state update (e.g., after a move or event).
 * @param {Object} state - The new game state.
 * @param {Object} last_event - The last event that triggered the update (optional).
 */
function on_update(state, last_event) {
    game = state;

    // Sync local selection with the server's view of the selection.
    // window.view is the view object constructed by rules.js:view()
    if (window.view && window.view.selected) {
        selectedUnitId = window.view.selected;
    } else {
        selectedUnitId = null;
    }
    render_interface();
}

// --- STANDARD RTT LOG MANAGEMENT ---

/**
 * Formats log messages for the game log panel.
 * Handles special prefixes for indentation/styling.
 * @param {string} text - The log message text.
 * @returns {HTMLElement} The formatted log entry element.
 */
function on_log(text) {
    let p = document.createElement("div");

    if (text.match(/^>>/)) {
        text = text.substring(2);
        p.className = "ii"; // Indented level 2
    }
    if (text.match(/^>/)) {
        text = text.substring(1);
        p.className = "i";  // Indented level 1
    }

    p.innerHTML = text;
    return p;
}

// --- ROBUST TOOLBAR CLEANUP ---

/**
 * Clears the toolbar actions while preserving the "Tools" menu.
 * This ensures we don't duplicate buttons or lose the main menu.
 */
function clear_toolbar() {
    // Clear the actions container where buttons are added
    const actions = document.getElementById("actions");
    if (actions) {
        actions.replaceChildren(); // Removes all children
    }
}

/**
 * Main rendering loop.
 * Orchestrates the drawing of the entire game interface based on the current view.
 */
function render_interface() {
    if (!window.view) return;

    // 1. Clean up old interface elements
    clear_toolbar();

    // 2. Draw the game board elements
    render_map_spaces(); // Draw hitboxes for spaces
    render_units();      // Draw units on map or in reserves

    // 3. Update Status Display
    // Shows the current Cumulative Evacuation Force (CEF) for the German player.
    if (window.view.cef !== undefined) {
        let el = document.getElementById("german_cef");
        if (el) el.textContent = "CEF: " + window.view.cef;
    }

    // 4. Generate Action Buttons
    // These buttons correspond to available actions in window.view.actions
    // The 'action_button' helper is defined in client.js.
    if (window.view.actions) {
        // Setup Phase Actions
        if (window.view.actions.end_setup) action_button("end_setup", "End Setup");
        if (window.view.actions.undo) action_button("undo", "Undo");

        // Event Phase Actions
        if (window.view.actions.roll_event) action_button("roll_event", "Roll Event");
        if (window.view.actions.choose_navy) action_button("choose_navy", "German Navy");
        if (window.view.actions.choose_shipping) action_button("choose_shipping", "German Shipping");

        // Evacuation Phase Actions
        if (window.view.actions.roll_evacuation) action_button("roll_evacuation", "Roll Evacuation");

        // Russian Reaction Phase Actions
        if (window.view.actions.roll_reaction) action_button("roll_reaction", "Roll Reaction");

        // Movement Phase Actions
        if (window.view.actions.end_movement) action_button("end_movement", "End Movement");

        // NOTE: The "Stop Moving" button is intentionally omitted here.
        // The 'stop' action is handled via clicking the unit itself in on_unit_click.

        // Elimination Phase Actions
        if (window.view.actions.eliminate) action_button("eliminate", "Eliminate Selected");
        if (window.view.actions.end_elimination) action_button("end_elimination", "End Elimination");

        // Combat Phase Actions
        if (window.view.actions.end_combat_setup) action_button("end_combat_setup", "End Attack Designations");
        if (window.view.actions.roll_combat) action_button("roll_combat", "Roll Combat");
        if (window.view.actions.next_attack) action_button("next_attack", "Next Attack");
        if (window.view.actions.end_combat) action_button("end_combat", "End Combat Phase");

        // Advance Actions
        if (window.view.actions.advance_to) action_button("advance_to", "Advance Unit");
        if (window.view.actions.done_advance) action_button("done_advance", "Done Advancing");
    }
}

/**
 * Renders the interactive spaces on the map.
 * Creates hitboxes for movement, placement, and stance selection.
 */
function render_map_spaces() {
    const map = document.getElementById("map");
    if (!map || !data.spaces) return;

    // Remove existing hitboxes to prevent duplicates
    map.querySelectorAll('.space-hitbox').forEach(e => e.remove());

    data.spaces.forEach(space => {
        if (space.x !== undefined) {
            let el = document.createElement("div");
            el.className = "space-hitbox";

            // Check if this space is a valid target for any current action
            let isAction = false;
            if (window.view.actions) {
                if (window.view.actions.place && window.view.actions.place.includes(space.id)) isAction = true;
                if (window.view.actions.set_stance && window.view.actions.set_stance.includes(space.id)) isAction = true;
                if (window.view.actions.move && window.view.actions.move.includes(space.id)) isAction = true;
                if (window.view.actions.retreat && window.view.actions.retreat.includes(space.id)) isAction = true;
                // Highlight Advance Destination
                if (window.view.advance_space === space.id) {
                    isAction = true;
                }
                // Note: We deliberately do NOT highlight empty spaces for 'target' action 
                // based on user feedback that they "should not" be highlighted.
                // However, they remain clickable if the rules allow it (handled in on_space_click).
                // If we wanted to visualize them differently, we could check window.view.actions.target here.
            }

            // Highlight valid action targets
            if (isAction) {
                el.classList.add("action");
                el.style.backgroundColor = "rgba(0, 255, 0, 0.2)";
                el.style.border = "2px solid lime";
                el.style.cursor = "pointer";

                // Specific style for Advance Destination
                if (window.view.advance_space === space.id) {
                    el.style.backgroundColor = "rgba(255, 215, 0, 0.4)"; // Gold
                    el.style.border = "3px dashed gold";
                }
                // Specific style for Retreat Destination
                if (window.view.actions && window.view.actions.retreat && window.view.actions.retreat.includes(space.id)) {
                    el.style.backgroundColor = "rgba(255, 0, 0, 0.2)"; // Red tint
                    el.style.border = "2px solid red";
                }
            }

            // Highlight overstacked spaces (for elimination phase)
            if (window.view.overstacked && window.view.overstacked.includes(space.id)) {
                el.style.backgroundColor = "rgba(243, 247, 9, 0.3)";
                el.style.border = "2px solid red";
                el.style.zIndex = 200;
            }

            // Position the hitbox
            el.style.left = space.x + "px";
            el.style.top = space.y + "px";
            el.title = `${space.name} (${space.id})`;

            // Bind click event
            el.addEventListener("click", () => on_space_click(space.id));
            map.appendChild(el);
        }
    });
}

/**
 * Renders all units, either on the map or in their respective reserve boxes.
 */
function render_units() {
    const map = document.getElementById("map");
    // Reserve boxes defined in play.html
    const boxes = {
        soviet: document.querySelector("#box_soviet .box-content"),
        german: document.querySelector("#box_german .box-content"),
        fort: document.querySelector("#box_fort .box-content"),
        chit: document.querySelector("#box_chit .box-content")
    };

    if (!map || !boxes.soviet) return;

    // Clear existing units
    document.querySelectorAll('.unit').forEach(e => e.remove());
    document.querySelectorAll('.unit-stack').forEach(e => e.remove());

    let mapStackCounts = {}; // Track number of units in each map space for stacking offset
    let reserveStacks = {};  // Track reserve stacks by class

    if (data.units && window.view.pieces) {
        data.units.forEach(u => {
            let currentSpace = window.view.pieces[u.id]; // Where is the unit? (Space ID or null/box)
            let el = document.createElement("div");
            el.id = u.id;
            el.className = `unit ${u.side} ${u.class}`;

            // Highlight selected unit
            if (window.view.selected === u.id) el.classList.add("selected");

            // Highlight selectable units (for 'select' action)
            if (window.view.actions && window.view.actions.select && window.view.actions.select.includes(u.id)) {
                el.classList.add("action");
                el.style.cursor = "pointer";
            }
            // Highlight valid targets
            if (window.view.actions && window.view.actions.target && window.view.actions.target.includes(u.id)) {
                el.classList.add("action");
                el.classList.add("target"); // Optional styling hook
                el.style.cursor = "pointer";
                el.style.outline = "2px solid red"; // Visual cue for enemy/target
            }
            if (window.view.selected === u.id) {
                el.style.cursor = "pointer";
            }

            // Check if designated attacker (Combat Setup)
            if (window.view.attacks && window.view.attacks.some(a => a.attacker === u.id)) {
                el.classList.add("attacker");
                el.style.filter = "grayscale(100%) opacity(0.8)"; // Visual cue for "used"
            }

            // Check if advance candidate (Combat Advance)
            if (window.view.actions && window.view.actions.select && window.view.actions.select.includes(u.id)) {
                // Differentiate based on phase ideally, but 'select' is generic.
                // However, "advance candidates" are usually the only things selectable in combat_advance.
                // We can infer or just let 'action' class handle it, but user asked for visibility.
                // Since we don't store phase here efficiently, we can check if 'done_advance' exists?
                if (window.view.actions.done_advance) {
                    el.style.boxShadow = "0 0 10px gold";
                    el.classList.add("advance-candidate");
                }
            }

            // Bind click event
            el.addEventListener("click", (e) => {
                e.stopPropagation(); // Prevent clicking through to the map space
                on_unit_click(u.id);
            });

            // Render unit content based on type
            if (u.type !== 'chit') {
                // Combat units: Army, Unit ID (if any), Combat, Cohesion
                let unitNumHtml = (u.unit !== null) ? `<div class="unit-num">${u.unit}</div>` : '';
                el.innerHTML = `<div class="army">${u.army}</div>${unitNumHtml}<div class="combat">${u.combat}</div><div class="cohesion">${u.cohesion}</div>`;
            } else {
                // Chits/Markers: Name only
                el.innerHTML = `<div class="name">${u.name}</div>`;
            }

            // Place unit on Map or in Reserve
            if (currentSpace) {
                // Unit is on the map (or a track)
                const space = data.spaces.find(s => s.id === currentSpace);
                if (space) {
                    el.classList.add("on-map");
                    let count = mapStackCounts[currentSpace] || 0;
                    mapStackCounts[currentSpace] = count + 1;

                    // Stack offset logic
                    el.style.left = (space.x + (count * 10)) + "px";
                    el.style.top = (space.y + (count * 10)) + "px";

                    // Z-Index layering
                    if (u.type === 'fort') el.style.zIndex = 10; // Forts at bottom
                    else el.style.zIndex = 100 + count;          // Units stack upwards

                    map.appendChild(el);
                }
            } else {
                // Unit is in reserve/box
                let targetBox;
                if (u.type === "fort") targetBox = boxes.fort;
                else if (u.type === "chit") targetBox = boxes.chit;
                else if (u.side === "soviet") targetBox = boxes.soviet;
                else targetBox = boxes.german;

                // Group units in reserve by class to save space
                let stackKey = u.class;
                if (!reserveStacks[stackKey]) {
                    let stackEl = document.createElement("div");
                    stackEl.className = "unit-stack";
                    targetBox.appendChild(stackEl);
                    reserveStacks[stackKey] = { element: stackEl, count: 0 };
                }
                let stack = reserveStacks[stackKey];

                // Visual offset in reserve stack
                el.style.top = (stack.count * 2) + "px";
                el.style.left = (stack.count * 2) + "px";
                el.style.zIndex = stack.count;

                stack.element.appendChild(el);
                stack.count++;
            }
        });
    }
}

/**
 * Handles clicks on units.
 * Logic depends on the current state and available actions.
 * @param {string} unitId - The ID of the clicked unit.
 */
function on_unit_click(unitId) {
    // Case 1: Clicking the ALREADY selected unit
    if (window.view.selected === unitId) {
        // If 'stop' action is available (unit has moved at least once), this click stops movement.
        if (window.view.actions.stop) {
            send_action('stop');
        } else {
            // Otherwise, just deselect it.
            send_action('deselect');
        }
        return;
    }

    // Case 2: Clicking a DIFFERENT unit
    if (window.view.pieces[unitId]) {
        // Target Action (Combat)
        if (window.view.actions.target && window.view.actions.target.includes(unitId)) {
            send_action('target', unitId);
            return;
        }

        // If we are in elimination mode or just selecting a unit to move/setup
        if (window.view.actions.eliminate || window.view.actions.select) {
            send_action('select', unitId);
            return;
        }

        // Special Case: Clicking a unit that occupies a valid destination space.
        // This allows "moving to a unit" (e.g., stacking or attacking).
        let targetSpace = window.view.pieces[unitId];

        // Check if the unit's space is a valid move destination
        if (window.view.actions.move && window.view.actions.move.includes(targetSpace)) {
            send_action('move', targetSpace);
            return;
        }
        // Check if the unit's space is a valid placement destination
        if (window.view.actions.place && window.view.actions.place.includes(targetSpace)) {
            send_action('place', targetSpace);
            return;
        }
    }

    // Default: Try to select the unit
    send_action('select', unitId);
}

/**
 * Handles clicks on map spaces (hitboxes).
 * @param {string} spaceId - The ID of the clicked space.
 */
function on_space_click(spaceId) {
    // Case 1: Setting Stance (German Setup)
    if (window.view.actions && window.view.actions.set_stance && window.view.actions.set_stance.includes(spaceId)) {
        send_action('set_stance', spaceId);
        return;
    }
    // Case 2: Moving a selected unit to this space
    if (window.view.actions && window.view.actions.move && window.view.actions.move.includes(spaceId)) {
        send_action('move', spaceId);
        return;
    }
    // Case 3: Targeting an empty space (Combat)
    if (window.view.actions && window.view.actions.target && window.view.actions.target.includes(spaceId)) {
        send_action('target', spaceId);
        return;
    }
    // Case 4: Placing a unit during setup
    send_action('place', spaceId);
}

// Global keyboard shortcuts
document.addEventListener("keydown", function (e) {
    // Ctrl+Z or Meta+Z for Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (window.view.actions && window.view.actions.undo) {
            send_action('undo');
            e.preventDefault();
        }
    }
});

// --- OVERRIDE SEND_ACTION ---
// We override the generic client.js send_action to force an immediate re-render.
// This makes buttons disappear instantly when clicked, providing better feedback.
const original_send_action = window.send_action;
window.send_action = function (verb, noun) {
    if (typeof original_send_action === 'function') {
        if (original_send_action(verb, noun)) {
            // Only hide buttons immediately for specific "terminating" actions.
            // This allows other actions (like Undo) to remain visible until the server update.
            const terminating_actions = ['roll_event', 'roll_evacuation', 'roll_reaction', 'end_elimination'];
            if (terminating_actions.includes(verb)) {
                render_interface();
            }
            return true;
        }
    }
    return false;
};