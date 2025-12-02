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
                el.title = space.name;
                el.addEventListener("click", () => on_space_click(space.id));
                map.appendChild(el);
            }
        });
    }
}

function render_units() {
    const map = document.getElementById("map");
    
    // Find the 4 reserve boxes
    const boxes = {
        soviet: document.querySelector("#box_soviet .box-content"),
        german: document.querySelector("#box_german .box-content"),
        fort: document.querySelector("#box_fort .box-content"),
        chit: document.querySelector("#box_chit .box-content")
    };

    if (!map || !boxes.soviet) {
        console.error("Elements missing"); 
        return;
    }

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

            el.addEventListener("click", (e) => {
                e.stopPropagation();
                on_unit_click(u.id);
            });

            if (u.type !== 'chit') {
                el.innerHTML = `
                    <div class="army">${u.army}</div>
                    <div class="unit-num">${u.unit}</div>
                    <div class="combat">${u.combat}</div>
                    <div class="cohesion">${u.cohesion}</div>
                `;
            } else {
                el.innerHTML = `<div class="name">${u.name}</div>`;
            }
            
            if (u.space) {
                // --- ON MAP ---
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
                // --- IN RESERVE ---
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

function on_unit_click(unitId) {
    selectedUnitId = (selectedUnitId === unitId) ? null : unitId;
    render_units();
}

function on_space_click(spaceId) {
    if (!selectedUnitId) return;
    const unit = data.units.find(u => u.id === selectedUnitId);
    if (!unit) return;

    const unitsInSpace = data.units.filter(u => u.space === spaceId);
    if (unitsInSpace.length >= 3) {
        alert("Stacking limit (3) reached.");
        return;
    }

    unit.space = spaceId;
    selectedUnitId = null;
    render_units();
}