"use strict"

let game = null;

function setup(state) {
    console.log("EoK: Setup state received");
    game = state;
}

window.on_update = function(state, last_event) {
    game = state;
    console.log("EoK: Update received");
};