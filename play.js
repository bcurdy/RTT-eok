"use strict"

let game = null;
let selectedUnitId = null;

function setup(state) {
    console.log("EoK: Setup received");
    game = state;
    render_interface();
}

function on_update(state, last_event) {
    game = state;
    if (window.view && window.view.selected) {
        selectedUnitId = window.view.selected;
    } else {
        selectedUnitId = null;
    }
    render_interface();
}

// Added on_log handler (Missing in your upload)
function on_log(text) {
    let p = document.createElement("div");
    p.innerHTML = text; 
    let log = document.getElementById("log");
    if (log) {
        log.appendChild(p);
        log.scrollTop = log.scrollHeight;
    }
}

function render_interface() {
    if (!window.view) return;

    render_map_spaces();
    render_units();
    
    if (window.view.cef !== undefined) {
        let el = document.getElementById("german_cef");
        if (el) el.textContent = "CEF: " + window.view.cef;
    }

    if (window.view.actions) {
        if (window.view.actions.end_setup) action_button("end_setup", "End Setup");
        if (window.view.actions.undo) action_button("undo", "Undo");
        
        if (window.view.actions.roll_event) action_button("roll_event", "Roll Event");
        if (window.view.actions.choose_navy) action_button("choose_navy", "German Navy");
        if (window.view.actions.choose_shipping) action_button("choose_shipping", "German Shipping");
        if (window.view.actions.roll_evacuation) action_button("roll_evacuation", "Roll Evacuation");
        
        if (window.view.actions.end_movement) action_button("end_movement", "End Movement");
        if (window.view.actions.stop) action_button("stop", "Stop Moving");

        if (window.view.actions.eliminate) action_button("eliminate", "Eliminate Selected");
        if (window.view.actions.end_elimination) action_button("end_elimination", "End Elimination");
    }
}

function render_map_spaces() {
    const map = document.getElementById("map");
    if (!map || !data.spaces) return;
    
    map.querySelectorAll('.space-hitbox').forEach(e => e.remove());

    data.spaces.forEach(space => {
        if (space.x !== undefined) {
            let el = document.createElement("div");
            el.className = "space-hitbox";
            
            let isAction = false;
            if (window.view.actions) {
                if (window.view.actions.place && window.view.actions.place.includes(space.id)) isAction = true;
                if (window.view.actions.set_stance && window.view.actions.set_stance.includes(space.id)) isAction = true;
                if (window.view.actions.move && window.view.actions.move.includes(space.id)) isAction = true;
            }

            if (isAction) {
                el.classList.add("action");
                el.style.backgroundColor = "rgba(0, 255, 0, 0.2)"; 
                el.style.border = "2px solid lime";
                el.style.cursor = "pointer";
            }

            if (window.view.overstacked && window.view.overstacked.includes(space.id)) {
                el.style.backgroundColor = "rgba(255, 0, 0, 0.3)";
                el.style.border = "2px solid red";
                el.style.zIndex = 200; 
            }
            
            el.style.left = space.x + "px";
            el.style.top = space.y + "px";
            el.title = `${space.name} (${space.id})`;
            
            el.addEventListener("click", () => on_space_click(space.id));
            map.appendChild(el);
        }
    });
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

    if (data.units && window.view.pieces) {
        data.units.forEach(u => {
            let currentSpace = window.view.pieces[u.id];
            let el = document.createElement("div");
            el.id = u.id;
            el.className = `unit ${u.side} ${u.class}`;
            
            if (window.view.selected === u.id) el.classList.add("selected");

            if (window.view.actions && window.view.actions.select && window.view.actions.select.includes(u.id)) {
                el.classList.add("action");
                el.style.cursor = "pointer";
            }
            if (window.view.selected === u.id) {
                 el.style.cursor = "pointer";
            }

            el.addEventListener("click", (e) => {
                e.stopPropagation();
                on_unit_click(u.id);
            });

            if (u.type !== 'chit') {
                let unitNumHtml = (u.unit !== null) ? `<div class="unit-num">${u.unit}</div>` : '';
                el.innerHTML = `<div class="army">${u.army}</div>${unitNumHtml}<div class="combat">${u.combat}</div><div class="cohesion">${u.cohesion}</div>`;
            } else {
                el.innerHTML = `<div class="name">${u.name}</div>`;
            }
            
            if (currentSpace) {
                const space = data.spaces.find(s => s.id === currentSpace);
                if (space) {
                    el.classList.add("on-map");
                    let count = mapStackCounts[currentSpace] || 0;
                    mapStackCounts[currentSpace] = count + 1;
                    
                    el.style.left = (space.x + (count * 5)) + "px";
                    el.style.top = (space.y + (count * 5)) + "px";
                    
                    if (u.type === 'fort') el.style.zIndex = 10;
                    else el.style.zIndex = 100 + count;
                    
                    map.appendChild(el);
                }
            } else {
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
    if (window.view.selected === unitId) {
        if (window.view.actions.stop) {
             send_action('stop');
        } else {
             send_action('deselect');
        }
        return;
    }
    
    if (window.view.pieces[unitId]) {
        if (window.view.actions.eliminate || window.view.actions.select) {
            send_action('select', unitId);
            return;
        }
        let targetSpace = window.view.pieces[unitId];
        if (window.view.actions.move && window.view.actions.move.includes(targetSpace)) {
             send_action('move', targetSpace);
             return;
        }
        if (window.view.actions.place && window.view.actions.place.includes(targetSpace)) {
             send_action('place', targetSpace);
             return;
        }
    }
    
    send_action('select', unitId);
}

function on_space_click(spaceId) {
    if (window.view.actions && window.view.actions.set_stance && window.view.actions.set_stance.includes(spaceId)) {
        send_action('set_stance', spaceId);
        return;
    }
    if (window.view.actions && window.view.actions.move && window.view.actions.move.includes(spaceId)) {
        send_action('move', spaceId);
        return;
    }
    send_action('place', spaceId);
}

document.addEventListener("keydown", function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (window.view.actions && window.view.actions.undo) {
            send_action('undo');
            e.preventDefault();
        }
    }
});