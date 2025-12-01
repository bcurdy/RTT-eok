"use strict"

let game = null;

// This function is optional for RTT, but if used, it must be called manually or by on_update
function setup(state) {
    game = state;
}

// --- RTT HOOK ---
// This is the main entry point called by client.js every time the state changes
window.on_update = function(state, last_event) {
    game = state;
    console.log("EoK: Update received");

    // RENDER DEBUG VISUALS
    // We call these here to ensure they appear as soon as the game loads
    render_debug_points();
    render_map_units(); 
};

// --- DEBUG: Render Map Points (Red Dots) ---
function render_debug_points() {
    const map = document.getElementById("map");
    
    // Safety check: ensure data exists
    if (!map || typeof data === 'undefined' || !data.spaces) return;

    // Clean up old markers to avoid duplicates on re-render
    document.querySelectorAll('.debug-marker, .debug-label').forEach(e => e.remove());

    data.spaces.forEach(space => {
        if (space.x !== undefined && space.y !== undefined) {
            // 1. Create the dot
            let marker = document.createElement("div");
            marker.className = "debug-marker";
            marker.style.left = space.x + "px";
            marker.style.top = space.y + "px";
            map.appendChild(marker);

            // 2. Create the label
            let label = document.createElement("div");
            label.className = "debug-label";
            label.style.left = space.x + "px";
            label.style.top = space.y + "px";
            label.textContent = space.id;
            map.appendChild(label);
        }
    });
}

/* --- DEBUG: Render Units on Map (for Testing) --- */
function render_map_units() {
    const map = document.getElementById("map");
    
    // Clean up existing units
    document.querySelectorAll('.unit').forEach(e => e.remove());

    if (!data.units || !data.spaces) return;

    console.log(`Rendering ${data.units.length} units on map...`);

    data.units.forEach(u => {
        // Find the space object in data.spaces matching the unit's assigned space ID
        const space = data.spaces.find(s => s.id === u.space);

        if (space) {
            let el = document.createElement("div");
            el.id = u.id;
            el.className = `unit ${u.side} ${u.type}`; // Standard classes
            
            // Inject the four numbers
            el.innerHTML = `
                <div class="army">${u.army}</div>
                <div class="unit-num">${u.unit}</div>
                <div class="combat">${u.combat}</div>
                <div class="cohesion">${u.cohesion}</div>
            `;

            // Set position based on the map space coordinates
            el.style.left = space.x + "px";
            el.style.top = space.y + "px";
            
            map.appendChild(el);
        } else {
            console.warn(`Unit ${u.id} has unknown space: ${u.space}`);
        }
    });
}