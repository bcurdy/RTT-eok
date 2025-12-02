"use strict"

const data = (typeof module !== 'undefined') ? module.exports : (window.data = {});

// Players
data.roles = [ "Soviet", "German" ]; 

// Map
data.spaces = [
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

// --- UNIT DEFINITIONS ---
data.units = [];

// Helper to add army units (Reserve)
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
            space: null 
        });
    }
}

// Helper to add Pre-Placed Forts (Fixed on map)
function add_fort(spaceId) {
    data.units.push({
        id: `fort_${spaceId}`,
        side: "neutral",
        type: "fort",
        class: "fort",
        army: "", 
        unit: null, // No unit number for forts
        combat: 0,
        cohesion: 4,
        name: "Fort",
        space: String(spaceId) // Pre-placed on map
    });
}

function get_army_number(name) {
    let match = name.match(/\d+/);
    return match ? match[0] : "";
}

// --- ARMIES (In Reserve) ---
add_unit(9, "soviet", "infantry", "39th Army", 4, 4, "sov_39");
add_unit(9, "soviet", "infantry", "43rd Army", 4, 4, "sov_43");
add_unit(9, "soviet", "infantry", "50th Army", 4, 4, "sov_50");
add_unit(9, "soviet", "infantry", "11th Gds",  4, 4, "sov_11");

add_unit(4, "german", "infantry", "56th Inf",  4, 3, "ger_56");
add_unit(4, "german", "infantry", "62nd Inf",  4, 3, "ger_62");
add_unit(4, "german", "infantry", "69th Inf",  4, 3, "ger_69");
add_unit(4, "german", "infantry", "367th Inf", 4, 3, "ger_367");
add_unit(4, "german", "infantry", "561st Inf", 4, 3, "ger_561");
add_unit(3, "german", "armor",    "5th Pz",    3, 2, "ger_pz5");

// --- MARKERS ---
add_unit(7, "neutral", "chit",    "Chit",      0, 0, "chit");

// --- PRE-PLACED FORTS ---
// Spaces 25-32
const forts1 = [25, 26, 27, 28, 29, 30, 31, 32];
forts1.forEach(id => add_fort(id));

// Spaces 42-47 and 50
const forts2 = [42, 43, 44, 45, 46, 47, 50];
forts2.forEach(id => add_fort(id));

if (typeof module !== 'undefined') module.exports = data;