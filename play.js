"use strict"

let game = null;
let selectedUnitId = null;

function setup(state) {
    console.log("EoK: Setup received");
    game = state;
    render_interface();
}

window.on_update = function(state, last_event) {
    game = state;
    render_interface();
};

function render_interface() {
    render_map_spaces();
    render_units();
}

function render_map_spaces() {
    const map = document.getElementById("map");
    if (!map || !data.spaces) return;
    
    if (map.querySelectorAll('.space-hitbox').length === 0) {
        data.spaces.forEach(space => {
            if (space.x !== undefined) {
                let el = document.createElement("div");
                el.className = "space-hitbox";
                el.style.left = space.x + "px";
                el.style.top = space.y + "px";
                el.title = `${space.name} (${space.id})`;
                el.addEventListener("click", () => on_space_click(space.id));
                map.appendChild(el);
            }
        });
    }
}

function render_units() {
    const map = document.getElementById("map");
    const boxes = {
        soviet: document.querySelector("#box_soviet .box-content"),
        german: document.querySelector("#box_german .box-content"),
        fort: document.querySelector("#box_fort .box-content"),
        chit: document.querySelector("#box_chit .box-content")
    };

    if (!map || !boxes.soviet) return;

    document.querySelectorAll('.unit').forEach(e => e.remove());
    document.querySelectorAll('.unit-stack').forEach(e => e.remove());

    let mapStackCounts = {};
    let reserveStacks = {};

    if (data.units) {
        data.units.forEach(u => {
            let el = document.createElement("div");
            el.id = u.id;
            el.className = `unit ${u.side} ${u.class}`;
            
            if (selectedUnitId === u.id) el.classList.add("selected");

            // Always bind click, even for forts (so they can be targets)
            el.addEventListener("click", (e) => {
                e.stopPropagation();
                on_unit_click(u.id);
            });

            if (u.type !== 'chit' && u.type !== 'fort') {
                let unitNumHtml = (u.unit !== null) ? `<div class="unit-num">${u.unit}</div>` : '';
                
                el.innerHTML = `
                    <div class="army">${u.army}</div>
                    ${unitNumHtml}
                    <div class="combat">${u.combat}</div>
                    <div class="cohesion">${u.cohesion}</div>
                `;
            } else {
                el.innerHTML = `<div class="name">${u.name}</div>`;
            }
            
            if (u.space) {
                // ON MAP
                const space = data.spaces.find(s => s.id === u.space);
                if (space) {
                    el.classList.add("on-map");
                    let count = mapStackCounts[u.space] || 0;
                    mapStackCounts[u.space] = count + 1;
                    el.style.left = (space.x + (count * 5)) + "px";
                    el.style.top = (space.y + (count * 5)) + "px";
                    el.style.zIndex = 100 + count;
                    map.appendChild(el);
                }
            } else {
                // IN RESERVE
                let targetBox;
                if (u.type === "fort") targetBox = boxes.fort;
                else if (u.type === "chit") targetBox = boxes.chit;
                else if (u.side === "soviet") targetBox = boxes.soviet;
                else targetBox = boxes.german;

                let stackKey = u.class; 
                if (!reserveStacks[stackKey]) {
                    let stackEl = document.createElement("div");
                    stackEl.className = "unit-stack";
                    targetBox.appendChild(stackEl);
                    reserveStacks[stackKey] = { element: stackEl, count: 0 };
                }

                let stack = reserveStacks[stackKey];
                el.style.top = (stack.count * 2) + "px";
                el.style.left = (stack.count * 2) + "px";
                el.style.zIndex = stack.count;
                
                stack.element.appendChild(el);
                stack.count++;
            }
        });
    }
}

// --- CORE LOGIC ---

function on_unit_click(clickedUnitId) {
    const clickedUnit = data.units.find(u => u.id === clickedUnitId);
    if (!clickedUnit) return;

    // CASE 1: We already have a unit selected
    if (selectedUnitId) {
        // If clicking the same unit, deselect
        if (selectedUnitId === clickedUnitId) {
            selectedUnitId = null;
            render_units();
            return;
        }

        // If the clicked unit is ON THE MAP, treat this as a move to its space
        if (clickedUnit.space) {
            attempt_move_to_space(clickedUnit.space);
            return;
        }

        // Otherwise, change selection to the new unit (unless it's a fort/chit which can't move)
        if (clickedUnit.type !== 'fort' && clickedUnit.type !== 'chit') {
            selectedUnitId = clickedUnitId;
            render_units();
        }
        return;
    }

    // CASE 2: No unit selected yet
    // Forts and Chits cannot be selected/moved
    if (clickedUnit.type === 'fort' || clickedUnit.type === 'chit') {
        return; 
    }
    
    // Select the unit
    selectedUnitId = clickedUnitId;
    render_units();
}

function on_space_click(spaceId) {
    if (selectedUnitId) {
        attempt_move_to_space(spaceId);
    }
}

function attempt_move_to_space(spaceId) {
    const unit = data.units.find(u => u.id === selectedUnitId);
    if (!unit) return;

    const spaceNum = parseInt(spaceId);
    const unitsInSpace = data.units.filter(u => u.space === spaceId);

    // --- RULE CHECKING ---

    // 1. Stacking Limit
    // Count units, ignoring forts
    let stackingCount = unitsInSpace.filter(u => u.type !== 'fort').length;
    if (stackingCount >= 3) {
        alert("Stacking limit (3 units) reached. Forts do not count.");
        return;
    }

    // 2. German Setup Rules
    // Allowed: 1-4, 20, 24-50
    if (unit.side === "german") {
        let allowed = false;
        if (spaceNum >= 1 && spaceNum <= 4) allowed = true;
        else if (spaceNum === 20) allowed = true;
        else if (spaceNum >= 24 && spaceNum <= 50) allowed = true;

        if (!allowed) {
            alert("Invalid German setup location. Allowed: 1-4, 20, 24-50.");
            return;
        }
    }

    // 3. Soviet Setup Rules
    // Allowed: 2-24
    if (unit.side === "soviet") {
        if (spaceNum < 2 || spaceNum > 24) {
            alert("Invalid Soviet setup location. Allowed: 2-24.");
            return;
        }

        // Check for German occupation
        let hasGerman = unitsInSpace.some(u => u.side === "german");
        if (hasGerman) {
            alert("Cannot place Soviet unit in a space occupied by Germans.");
            return;
        }

        // Check for Army Homogeneity
        // "39th Army may not stack with units belonging to any other Russian Army"
        let differentArmy = unitsInSpace.find(u => u.side === "soviet" && u.army !== unit.army);
        if (differentArmy) {
            alert(`Cannot mix armies. Space contains ${differentArmy.army}th Army.`);
            return;
        }
    }

    // --- EXECUTE MOVE ---
    unit.space = spaceId;
    selectedUnitId = null;
    render_units();
}