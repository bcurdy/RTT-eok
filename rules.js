"use strict";

// --- Imports ---
const data = require("./data.js");

// --- Metadata (Required by the "Create Game" page) ---
exports.scenarios = [
    "Standard Game"
];

exports.roles = [
    "Soviet",
    "German"
];

// --- Initial State (Required by the game engine) ---
exports.setup = function (seed, scenario, options) {
    let game = {
        // Game configuration
        seed: seed,
        scenario: scenario,
        options: options,

        // Framework state (REQUIRED to avoid server crashes)
        log: [],
        undo: [],
        active: "Soviet", // First player to act

        // Game specific state
        // Minimal empty state for Map-Only sprint
        pieces: {} 
    };
    return game;
};

// --- View Generation ---
exports.view = function(state, role) {
    // Return a minimal view to the client
    return {
        active: state.active,
        pieces: state.pieces,
        log: state.log,
        prompt: "Map setup complete."
    };
};

// --- Action Handling ---
exports.action = function (state, role, action, args) {
    // No actions implemented yet
    return state;
};