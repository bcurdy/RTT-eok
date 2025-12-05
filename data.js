"use strict"

const data = (typeof module !== 'undefined') ? module.exports : (window.data = {});

/**
 * EVACUATION OF KÖNIGSBERG - Static Data Definitions
 * 
 * This file defines the static data for the game, including:
 * 1. Roles (Factions)
 * 2. Map Spaces (Coordinates and Names)
 * 3. Unit Definitions (Types, Strengths, Counts)
 * 4. Adjacency Graph (Movement paths)
 */

// --- PLAYERS ---
// The two opposing sides in the game.
data.roles = ["Soviet", "German"];

// --- MAP DEFINITIONS ---
// Each space has an ID, X/Y coordinates for the UI, and a descriptive name.
data.spaces = [
    // --- TRACKS & BOXES (Top Left) ---
    // These are special spaces on the board for tracking game state (Stance, Activation, etc.)
    { id: "track_land", x: 106, y: 124, name: "Land Stance" },
    { id: "track_naval", x: 106, y: 244, name: "Naval Stance" },
    { id: "track_ger_ship1", x: 224, y: 124, name: "German Shipping 1" },
    { id: "track_ger_ship2", x: 224, y: 244, name: "German Shipping 2" },
    { id: "track_ger_navy1", x: 342, y: 124, name: "German Navy 1" },
    { id: "track_ger_navy2", x: 342, y: 244, name: "German Navy 2" },
    { id: "track_sov_act1", x: 460, y: 124, name: "Russian Activation 1" },
    { id: "track_sov_act2", x: 460, y: 244, name: "Russian Activation 2" },

    // --- MAP POINTS ---
    // The main playable spaces on the map, numbered 1-52.
    { id: "1", x: 610, y: 723, name: "1" },
    { id: "2", x: 390, y: 695, name: "2" },
    { id: "3", x: 515, y: 594, name: "3" },
    { id: "4", x: 657, y: 486, name: "4" },
    { id: "5", x: 429, y: 427, name: "5" },
    { id: "6", x: 628, y: 267, name: "6" },
    { id: "7", x: 889, y: 263, name: "7" },
    { id: "8", x: 1080, y: 84, name: "8" },
    { id: "9", x: 1273, y: 250, name: "9" },
    { id: "10", x: 1559, y: 187, name: "10" },
    { id: "11", x: 1705, y: 316, name: "11" },
    { id: "12", x: 1628, y: 472, name: "12" },
    { id: "13", x: 1728, y: 631, name: "13" },
    { id: "14", x: 1651, y: 797, name: "14" },
    { id: "15", x: 1714, y: 919, name: "15" },
    { id: "16", x: 1588, y: 1015, name: "16" },
    { id: "17", x: 1657, y: 1228, name: "17" },
    { id: "18", x: 1376, y: 1179, name: "18" },
    { id: "19", x: 1205, y: 1293, name: "19" },
    { id: "20", x: 1029, y: 1190, name: "20" },
    { id: "21", x: 767, y: 1291, name: "21" },
    { id: "22", x: 525, y: 1261, name: "22" },
    { id: "23", x: 496, y: 1082, name: "23" },
    { id: "24", x: 763, y: 1084, name: "24" },
    { id: "25", x: 933, y: 1025, name: "25" },
    { id: "26", x: 1187, y: 1102, name: "26" },
    { id: "27", x: 1443, y: 1002, name: "27" },
    { id: "28", x: 1539, y: 677, name: "28" },
    { id: "29", x: 1396, y: 405, name: "29" },
    { id: "30", x: 1092, y: 322, name: "30" },
    { id: "31", x: 832, y: 417, name: "31" },
    { id: "32", x: 724, y: 641, name: "32" },
    { id: "33", x: 817, y: 763, name: "33" },
    { id: "34", x: 862, y: 563, name: "34" },
    { id: "35", x: 996, y: 446, name: "35" },
    { id: "36", x: 1206, y: 438, name: "36" },
    { id: "37", x: 1403, y: 592, name: "37" },
    { id: "38", x: 1425, y: 822, name: "38" },
    { id: "39", x: 1279, y: 990, name: "39" },
    { id: "40", x: 1071, y: 1002, name: "40" },
    { id: "41", x: 889, y: 919, name: "41" },
    { id: "42", x: 992, y: 879, name: "42" },
    { id: "43", x: 1191, y: 927, name: "43" },
    { id: "44", x: 1342, y: 767, name: "44" },
    { id: "45", x: 1258, y: 541, name: "45" },
    { id: "46", x: 1061, y: 525, name: "46" },
    { id: "47", x: 929, y: 690, name: "47" },
    { id: "48", x: 1059, y: 637, name: "48" },
    { id: "49", x: 1216, y: 651, name: "49" },
    { id: "50", x: 1138, y: 710, name: "50" },
    { id: "51", x: 1206, y: 813, name: "51" },
    { id: "52", x: 1059, y: 813, name: "52" }
];

// --- FORTIFICATION SPACES ---
// List of space IDs that start with a Fortification.
data.fortification_spaces = [
    25, 26, 27, 28, 29, 30, 31, 32,
    42, 43, 44, 45, 46, 47,
    50
];

// --- ADJACENCY LIST (WAYS) ---
// Defines the connections between spaces.
// Format: [Source, Target1, Target2, ...]
// This is used by rules.js to build the full graph.
data.ways = [
    // Example: Point 1 connects to 2, 3, 4, and 32
    ["1", "2", "3", "4", "32"],
    ["2", "1", "3", "5"],
    ["3", "1", "2", "4", "5"],
    ["4", "1", "3", "5", "6", "31", "32"],
    ["5", "2", "3", "4", "6"],
    ["6", "4", "5", "7", "8"],
    ["7", "4", "6", "8", "9", "30", "31"],
    ["8", "6", "7", "9", "10"],
    ["9", "7", "8", "10", "12", "29", "30"],
    ["10", "8", "9", "11", "12"],
    ["11", "10", "12", "13"],
    ["12", "9", "10", "11", "13", "14", "28", "29"],
    ["13", "11", "12", "14", "15", "28"],
    ["14", "12", "13", "15", "16", "28"],
    ["15", "13", "14", "16", "17"],
    ["16", "14", "15", "17", "18", "27"],
    ["17", "15", "16", "18", "19"],
    ["18", "16", "17", "19", "20", "26", "27"],
    ["19", "17", "18", "20", "26"],
    ["20", "18", "19", "21", "24", "25", "26"],
    ["21", "19", "20", "22", "24"],
    ["22", "21", "23"],
    ["23", "22", "24"],
    ["24", "20", "21", "23", "25"],
    ["25", "20", "24", "26", "40", "41"],
    ["26", "18", "20", "25", "27", "39", "40"],
    ["27", "16", "18", "26", "28", "38", "39"],
    ["28", "12", "14", "27", "29", "37", "38"],
    ["29", "9", "12", "28", "30", "36", "37"],
    ["30", "7", "9", "29", "31", "35", "36"],
    ["31", "4", "7", "30", "32", "34", "35"],
    ["32", "1", "4", "31", "33", "34"],
    ["33", "32", "34", "47"],
    ["34", "31", "32", "33", "35", "46", "47", "48"],
    ["35", "30", "31", "34", "36", "46"],
    ["36", "29", "30", "35", "37", "45", "46"],
    ["37", "28", "29", "36", "38", "44", "45"],
    ["38", "27", "28", "37", "39", "44"],
    ["39", "26", "27", "38", "40", "43"],
    ["40", "25", "26", "39", "41", "42", "43"],
    ["41", "25", "40", "42"],
    ["42", "40", "41", "43", "51", "52"],
    ["43", "39", "40", "42", "44", "51", "52"],
    ["44", "38", "43", "45", "49"],
    ["45", "36", "37", "44", "46", "48", "49"],
    ["46", "35", "36", "45", "47", "48"],
    ["47", "33", "34", "46", "48"],
    ["48", "45", "46", "47", "49", "50"],
    ["49", "44", "45", "46", "48", "50"],
    ["50", "48", "49", "51", "52"],
    ["51", "42", "43", "50", "52"],
    ["52", "42", "43", "50", "51"]
];

// --- UNIT GENERATION ---
data.units = [];

/**
 * Helper to generate multiple units of the same type.
 * @param {number} count - Number of units to create.
 * @param {string} side - "soviet" or "german".
 * @param {string} type - "infantry", "armor", "chit", etc.
 * @param {string} name - Display name (e.g., "5th Pz").
 * @param {number} combat - Combat strength.
 * @param {number} cohesion - Cohesion/Health.
 * @param {string} className - CSS class for styling.
 */
function add_unit(count, side, type, name, combat, cohesion, className) {
    for (let i = 1; i <= count; i++) {
        data.units.push({
            id: `${side}_${className}_${i}`,
            side: side,
            type: type,
            class: className,
            army: get_army_number(name),
            unit: i,
            combat: combat,
            cohesion: cohesion,
            name: name,
            space: null // Initially in reserve/off-map
        });
    }
}

/**
 * Helper to generate a Fort unit.
 * @param {number} spaceId - The space where the fort is located.
 */
function add_fort(spaceId) {
    data.units.push({
        id: `fort_${spaceId}`,
        side: "neutral",
        type: "fort",
        class: "fort",
        army: "",
        unit: null,
        combat: 0,
        cohesion: 4,
        name: "Fort",
        space: String(spaceId) // Pre-placed on map
    });
}

/**
 * Extracts the army number from the unit name for display.
 */
function get_army_number(name) {
    let match = name.match(/\d+/);
    return match ? match[0] : "";
}

// --- GERMAN FORCES ---
// Stance Marker (Special Unit for German Player to indicate strategy)
data.units.push({
    id: "marker_stance",
    side: "german",   // Owned by German player so they can move it
    type: "chit",     // Visual style
    class: "chit",
    name: "Stance",
    combat: 0,
    cohesion: 0,
    army: "",
    unit: null,
    space: null       // Starts in reserve
});

// German Combat Units
add_unit(1, "german", "infantry", "56th Inf", 4, 3, "ger_56");
add_unit(1, "german", "infantry", "62nd Inf", 4, 3, "ger_62");
add_unit(1, "german", "infantry", "69th Inf", 4, 3, "ger_69");
add_unit(1, "german", "infantry", "367th Inf", 4, 3, "ger_367");
add_unit(1, "german", "infantry", "561st Inf", 4, 3, "ger_561");
add_unit(1, "german", "armor", "5th Pz", 3, 2, "ger_pz5");

// --- SOVIET FORCES ---
add_unit(1, "soviet", "infantry", "39th Army", 4, 4, "sov_39");
add_unit(1, "soviet", "infantry", "43rd Army", 4, 4, "sov_43");
add_unit(1, "soviet", "infantry", "50th Army", 4, 4, "sov_50");
add_unit(1, "soviet", "infantry", "11th Gds", 4, 4, "sov_11");

// --- MARKERS ---
// 7 Generic Chits for tracking various game states
add_unit(7, "neutral", "chit", "Chit", 0, 0, "chit");

// --- PRE-PLACED FORTS ---
// Forts are static units placed on specific spaces at start.
const forts1 = [25, 26, 27, 28, 29, 30, 31, 32];
forts1.forEach(id => add_fort(id));
const forts2 = [42, 43, 44, 45, 46, 47, 50];
forts2.forEach(id => add_fort(id));

if (typeof module !== 'undefined') module.exports = data;