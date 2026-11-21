/* MORPHOS: one pond, one life, and a field guide that remembers your discoveries. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id), clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const families=['venomist','predator','riptide','summoner','stalker'];
 const familyNames={venomist:'Venomist',predator:'Predator',riptide:'Riptide',summoner:'Brood',stalker:'Stalker'};
 const familyDescriptions={venomist:'Trains when your venom does damage: Spit, Venom volley and ruptures.',predator:'Trains when your Jab, Bite and Pounce land and kill.',riptide:'Trains on rams, near misses and escapes while swimming fast, and on creatures held in your Whirlpool.',summoner:'Trains when your broodlings fight. Swarm buds a broodling at any rank.',stalker:'Trains on ambushes: strike real threats before they notice you.'};
 // Key bindings: every keyboard action reads from here so players can remap them on the Controls screen.
 // Mouse buttons are fixed: left click always strikes, right click always swims fast.
 const DEFAULT_BINDINGS={strike:'',block:'q',fastSwim:'',hold:'shift',sneak:' ',up:'arrowup',down:'arrowdown',left:'arrowleft',right:'arrowright',venomist:'w',predator:'e',riptide:'a',summoner:'s',stalker:'d',body:'u',research:'r',navigate:'tab',pause:'p',sound:'m',fullscreen:'f'};
 const BINDING_NAMES={strike:'Strike',block:'Block',fastSwim:'Fast swim',hold:'Hold position',sneak:'Sneak',up:'Swim up',down:'Swim down',left:'Swim left',right:'Swim right',venomist:'Venom volley',predator:'Pounce',riptide:'Whirlpool',summoner:'Swarm',stalker:'Decoy',body:'Mutations',research:'Colony screen',navigate:'Map',pause:'Pause',sound:'Sound on / off',fullscreen:'Fullscreen'};
 const BINDING_NOTES={strike:'Also left click',fastSwim:'',hold:'Stay put while you aim',venomist:'Venomist ability',predator:'Predator ability',riptide:'Riptide ability',summoner:'Brood ability',stalker:'Stalker ability',pause:'Esc also pauses'};
 const BINDING_GROUPS=[['Combat',['strike','block','fastSwim','hold','sneak']],['Organs',['venomist','predator','riptide','summoner','stalker']],['Movement',['up','down','left','right']],['Menus',['body','research','navigate','pause','sound','fullscreen']]];
 const RESERVED_KEYS=['escape','tab','enter','?','+','=','-','0'];
 let bindings={...DEFAULT_BINDINGS};
 try{const saved=JSON.parse(localStorage.getItem('morphos.keys.v1')||'null');if(saved&&typeof saved==='object')for(const k of Object.keys(DEFAULT_BINDINGS))if(typeof saved[k]==='string'&&saved[k].length<=24&&(!RESERVED_KEYS.includes(saved[k])||(k==='navigate'&&saved[k]==='tab')))bindings[k]=saved[k];if((bindings.navigate==='n'&&bindings.sound==='m')||(bindings.navigate==='m'&&bindings.sound==='n')){bindings.navigate='tab';bindings.sound='m';}}catch{}
 function saveBindings(){try{localStorage.setItem('morphos.keys.v1',JSON.stringify(bindings));}catch{}}
 // Mouse mode: 'steer' (default) swims towards the cursor when no movement key is held; 'aim' never moves the cell,
 // so movement comes only from the keys and the cursor just aims Strikes and abilities.
 let mouseAimOnly=false;
 try{mouseAimOnly=localStorage.getItem('morphos.mouse.v1')==='aim';}catch{}
 function saveMouseMode(){try{localStorage.setItem('morphos.mouse.v1',mouseAimOnly?'aim':'steer');}catch{}}
 const WASD_PRESET={up:'w',left:'a',down:'s',right:'d',fastSwim:'shift',hold:'',sneak:' ',block:'c',venomist:'q',predator:'1',riptide:'2',summoner:'3',stalker:'e'};
 const held=action=>!!bindings[action]&&keys.has(bindings[action]);
 const actionFor=key=>key?Object.keys(bindings).find(a=>bindings[a]===key)||'':'';
 const MOUSE_KEYS={rmb:2,mmb:4,mb4:8,mb5:16},MOUSE_BY_BUTTON={1:'mmb',2:'rmb',3:'mb4',4:'mb5'};
 function keyName(k){if(!k)return'';return({rmb:'RMB',mmb:'MMB',mb4:'Mouse 4',mb5:'Mouse 5',' ':'Space',arrowup:'↑',arrowdown:'↓',arrowleft:'←',arrowright:'→',shift:'Shift',capslock:'Caps',backspace:'Backspace',delete:'Del'})[k]||(k.length===1?k.toUpperCase():k.charAt(0).toUpperCase()+k.slice(1));}
 // Controller button names (standard mapping). When a controller is the last thing used, every hint names its buttons.
 const PAD_LABELS={strike:'RT',fastSwim:'LT',block:'LB',sneak:'RB',hold:'Right stick',venomist:'A',predator:'X',riptide:'L3',summoner:'Y',stalker:'B',body:'Start',pause:'Start',navigate:'View'};
 let padActive=false;
 const keyLabel=action=>padActive?(PAD_LABELS[action]||''):keyName(bindings[action]);
 const saveVersion=20,checkpointKey='morphos.checkpoint.v13';
 const mutationSlotStages=MorphosGame.MUTATION_SLOT_STAGES||[2,4,6];
 const buildTabs={evolution:['buildEvolutionTab','evolutionPanel'],stats:['buildStatsTab','statsPanel'],mutations:['buildMutationsTab','mutationsPanel'],map:['buildMapTab','mapPanel']};
 const guideTabs={adaptations:['guideAdaptationsTab','guideAdaptations'],species:['guideSpeciesTab','guideSpecies'],elders:['guideEldersTab','guideElders'],places:['guidePlacesTab','guidePlaces'],legend:['guideLegendTab','guideLegend']};
 const helpTabs={controls:['helpControlsTab','helpControls'],growth:['helpGrowthTab','helpGrowth'],journey:['helpJourneyTab','helpJourney']};
 const MUTATION_ICONS={"dartFlagellum": "<path d=\"M3 12h11\"/><path d=\"M14 7l6 5-6 5\"/><path d=\"M3 8l3 4-3 4\"/>", "gorgerStomach": "<path d=\"M6 7c0-2 12-2 12 0v6a6 6 0 0 1-12 0z\"/><path d=\"M8 11h8\"/>", "wanderingEddy": "<path d=\"M12 12m-2 0a2 2 0 1 0 4 0a4 4 0 1 0-8 0a6 6 0 1 0 12 0\"/><path d=\"M19 19l2 2\"/>", "glassSkin": "<path d=\"M12 3l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V7z\"/><path d=\"M9 9l2 2M13 13l2 2\"/>", "ramJaw": "<path d=\"M3 12h7\"/><path d=\"M10 7l5 5-5 5\"/><path d=\"M16 8l4 4-4 4\"/>", "packFeeding": "<circle cx=\"7\" cy=\"8\" r=\"2\"/><circle cx=\"17\" cy=\"8\" r=\"2\"/><circle cx=\"12\" cy=\"15\" r=\"3\"/>", "toxicWake": "<path d=\"M3 15c3 0 3-3 6-3s3 3 6 3 3-3 6-3\"/><circle cx=\"7\" cy=\"7\" r=\"1.5\"/><circle cx=\"13\" cy=\"6\" r=\"1.5\"/>", "numbingVenom": "<path d=\"M12 4c-3 5-5 7-5 10a5 5 0 0 0 10 0c0-3-2-5-5-10z\"/><path d=\"M9 14h6\"/>", "phantomBrood": "<circle cx=\"12\" cy=\"10\" r=\"5\" stroke-dasharray=\"2 2\"/><circle cx=\"8\" cy=\"18\" r=\"1.8\"/><circle cx=\"16\" cy=\"18\" r=\"1.8\"/>", "bileSac": "<path d=\"M7 9a5 5 0 0 1 10 0c0 4-2.5 7-5 7s-5-3-5-7z\"/><path d=\"M12 19v2M9 18l-1 2M15 18l1 2\"/>", "clingingSlime": "<path d=\"M4 8h16\"/><path d=\"M7 8v4a1.5 1.5 0 0 0 3 0V8M14 8v6a1.5 1.5 0 0 0 3 0V8\"/>", "tailFlick": "<path d=\"M20 12c-4 0-6-4-10-4S5 10 5 12\"/><path d=\"M5 12l-2 2M5 12l-2-2M5 12H2\"/>", "echoNucleus": "<circle cx=\"12\" cy=\"12\" r=\"3\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M7 12a5 5 0 0 1 5-5M17 12a5 5 0 0 1-5 5M4 12a8 8 0 0 1 8-8M20 12a8 8 0 0 1-8 8\"/>", "pitOrgan": "<path d=\"M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5z\"/><path d=\"M12 9.5c1.2 1.4 1.8 2.3 1.8 3a1.8 1.8 0 0 1-3.6 0c0-.7.6-1.6 1.8-3z\" fill=\"currentColor\" stroke=\"none\"/>", "rendingPounce": "<path d=\"M6 18L14 6M10 19l8-12M4 14l6-9\"/>", "clingingVenom": "<ellipse cx=\"12\" cy=\"17\" rx=\"7\" ry=\"2.5\"/><path d=\"M12 4c2 2.6 3 4.2 3 5.5a3 3 0 0 1-6 0c0-1.3 1-2.9 3-5.5z\"/>", "lastBreath": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6\"/>", "toxicHusk": "<path d=\"M12 3c4 0 7 3.5 7 8.5S16 21 12 21s-7-4.5-7-9.5S8 3 12 3z\"/><path d=\"M12 3l-1.5 5 3 2-2 4 1.5 3\"/>", "venomEddy": "<path d=\"M12 12a2 2 0 1 1 2-2 4 4 0 1 1-4-4 6 6 0 1 1 6 6\"/>", "jaws": "<path d=\"M3.5 10C5 5.5 19 5.5 20.5 10\"/><path d=\"M6 9l1.6 3.2L9.2 9l1.6 3.2L12.4 9l1.6 3.2L15.6 9l1.6 3.2L18.4 9\"/><path d=\"M3.5 14C5 18.5 19 18.5 20.5 14\"/><path d=\"M6 15l1.6-3.2L9.2 15l1.6-3.2L12.4 15l1.6-3.2L15.6 15l1.6-3.2L18.4 15\"/>", "serratedJaws": "<path d=\"M3.5 6.5c2.5 9.5 14.5 9.5 17 0\"/><path d=\"M5 8.5l2.3 1.2-.2-2.4 2.4 1.9.2-2.6 2.3 2.4L12 6.3l.9 2.7 2.3-2.4.2 2.6 2.4-1.9-.2 2.4L19 8.5\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M8 17.5l1.3-1.8 1.4 1.8 1.3-1.8 1.3 1.8 1.4-1.8 1.3 1.8\"/>", "spitGland": "<path d=\"M15.5 4.5c2.6 3 4 5.3 4 7.2a4 4 0 0 1-8 0c0-1.9 1.4-4.2 4-7.2z\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"7\" cy=\"14\" r=\"1.6\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"4.2\" cy=\"18\" r=\"1.1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"9\" cy=\"19.5\" r=\".9\" fill=\"currentColor\" stroke=\"none\"/>", "needleSpine": "<path d=\"M4.5 19.5L18 6\"/><path d=\"M20.5 3.5l-1.2 5-3.8-3.8z\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M6 15.5l-2.5-.5M8.5 18l.5 2.5\"/>", "spikeBattery": "<path d=\"M4 8h11M4 12h13M4 16h11\"/><path d=\"M15 6.5 18.5 8 15 9.5M17 10.5l3.5 1.5-3.5 1.5M15 14.5l3.5 1.5-3.5 1.5\" fill=\"currentColor\" stroke=\"none\"/>", "sporeSac": "<circle cx=\"9\" cy=\"12\" r=\"3.2\"/><circle cx=\"14.5\" cy=\"8\" r=\"1.8\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"16.5\" cy=\"12.5\" r=\"1.5\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"14\" cy=\"16.5\" r=\"1.7\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"19.5\" cy=\"9\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"19.5\" cy=\"16\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/>", "chainPulse": "<circle cx=\"4.5\" cy=\"6\" r=\"2\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"12\" cy=\"17.5\" r=\"2\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"19.5\" cy=\"7\" r=\"2\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M5.5 8l2.4 3.2-1.4.6 3.4 3.9M13.3 15.6l1.6-3.9 1.4.6 1.6-3.6\"/>", "photosynthesis": "<circle cx=\"12\" cy=\"12\" r=\"3.6\"/><path d=\"M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7\"/><path d=\"M10.4 13.6c.2-2.2 1.4-3.2 3.4-3.4-.2 2-1.2 3.2-3.4 3.4z\" fill=\"currentColor\" stroke=\"none\"/>", "undertow": "<path d=\"M12 12.3c0-.9.8-1.4 1.5-1 .9.5.8 2-.2 2.6-1.4.8-3.2-.2-3.4-1.8-.3-2.3 1.9-4 4.1-3.6 3 .5 4.4 3.8 3.3 6.4-1.3 3.2-5.5 4.3-8.4 2.6-3.6-2.1-4-7.2-1.4-10.3 2.6-3.1 7.2-3.6 10.5-1.4\"/>", "shadowMetabolism": "<path d=\"M15.5 3.8A8.5 8.5 0 1 0 20.2 15 7 7 0 0 1 15.5 3.8z\" fill=\"currentColor\" stroke=\"none\" opacity=\".35\"/><path d=\"M15.5 3.8A8.5 8.5 0 1 0 20.2 15 7 7 0 0 1 15.5 3.8z\"/><path d=\"M18 5.5l.5 1.2 1.3.3-1 .9.2 1.3-1-.7-1.2.6.3-1.3-.9-.9 1.3-.2z\" fill=\"currentColor\" stroke=\"none\"/>", "engulfingMembrane": "<path d=\"M20 9.5A8.5 8.5 0 1 0 20 14.5\"/><path d=\"M20 9.5l-4 2.5 4 2.5\"/><circle cx=\"10.5\" cy=\"12\" r=\"2.4\" fill=\"currentColor\" stroke=\"none\"/>", "devourerGullet": "<ellipse cx=\"12\" cy=\"7\" rx=\"8.5\" ry=\"3\"/><path d=\"M3.5 7c.5 6 4.5 8 6.5 13h4c2-5 6-7 6.5-13\"/><path d=\"M8 11c1.5 1 6.5 1 8 0\"/>", "regrowingOrgans": "<path d=\"M19 12a7 7 0 1 1-2.1-5\"/><path d=\"M17.5 3.2l-.4 3.9-3.9-.4\"/><path d=\"M12 16v-4.5\"/><path d=\"M12 13c-2.2 0-3.3-1.2-3.4-3 2 .1 3.2 1 3.4 3zM12 11.5c.3-1.9 1.4-2.8 3.3-2.8-.1 1.9-1.2 2.8-3.3 2.8z\" fill=\"currentColor\" stroke=\"none\"/>", "fissionHeart": "<path d=\"M11 20L4.2 13.2A4.3 4.3 0 0 1 10.3 7l.7.7\"/><path d=\"M13 20l6.8-6.8A4.3 4.3 0 0 0 13.7 7l-.7.7\"/><path d=\"M12 6.5l-1 3.5 2 2-1.5 4\" opacity=\".9\"/>", "storedImpact": "<path d=\"M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6z\"/><path d=\"M13 7.5l-3.5 5H12l-1 4.5 3.5-5.5H12z\" fill=\"currentColor\" stroke=\"none\"/>", "chitinPlates": "<path d=\"M8 3.5l3.5 2v4l-3.5 2-3.5-2v-4zM16 3.5l3.5 2v4l-3.5 2-3.5-2v-4zM12 11.5l3.5 2v4l-3.5 2-3.5-2v-4z\"/><path d=\"M8 7.5l1.5.9M16 7.5l1.5.9M12 15.5l1.5.9\" opacity=\".6\"/>", "mirrorMembrane": "<path d=\"M18 4.5a10 10 0 0 1 0 15\"/><path d=\"M15.3 7a6.5 6.5 0 0 1 0 10\" opacity=\".5\"/><path d=\"M3.5 7l9 5-9 5\"/><path d=\"M5.4 14.8L3.5 17l2.9.3\"/>", "whipFlagellum": "<circle cx=\"4.5\" cy=\"12\" r=\"2.2\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M6.7 12c2-3 3.5-3 5 0s3 3 4.5 0 2.5-3 3.3-1.3c.4.8.6 1.6 1 2.3\"/>", "jetSac": "<ellipse cx=\"14\" cy=\"8\" rx=\"5\" ry=\"2.8\"/><ellipse cx=\"14\" cy=\"16\" rx=\"5\" ry=\"2.8\"/><path d=\"M9 8l-3-1.5v3zM9 16l-3-1.5v3z\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M2.5 8h1.5M2.5 16h1.5\"/>", "keelFin": "<path d=\"M4 18h16\"/><path d=\"M6.5 18C8 12 11 6.5 17 4c-1.5 4-1.5 9.5 1.5 14\" fill=\"currentColor\" stroke=\"none\" opacity=\".35\"/><path d=\"M6.5 18C8 12 11 6.5 17 4c-1.5 4-1.5 9.5 1.5 14\"/><path d=\"M11 18c.5-3.5 2-6.5 4.5-9\"/>", "secondWind": "<path d=\"M3 9h10.5a2.5 2.5 0 1 0-2.5-2.5\"/><path d=\"M3 13h14.5a2.5 2.5 0 1 1-2.5 2.5\"/><path d=\"M3 17h6\"/>", "staticCharge": "<circle cx=\"12\" cy=\"12\" r=\"8.5\" stroke-dasharray=\"2.5 2.6\"/><path d=\"M13.2 5.5l-4.4 7h3.4l-1.4 6 4.5-7.5h-3.4z\" fill=\"currentColor\" stroke=\"none\"/>", "sporeGland": "<circle cx=\"12\" cy=\"12\" r=\"3.4\"/><circle cx=\"12\" cy=\"12\" r=\"1.2\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"5\" cy=\"7.5\" r=\"1.8\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"18.5\" cy=\"6.5\" r=\"1.5\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"19\" cy=\"16.5\" r=\"1.9\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"6\" cy=\"17.5\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"12\" cy=\"3.8\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"12.5\" cy=\"20.5\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/>", "twinNucleus": "<circle cx=\"9\" cy=\"12\" r=\"5.2\"/><circle cx=\"15\" cy=\"12\" r=\"5.2\"/><circle cx=\"9\" cy=\"12\" r=\"1.9\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"15\" cy=\"12\" r=\"1.9\" fill=\"currentColor\" stroke=\"none\"/>", "fedHeart": "<path d=\"M12 20L5 13a4.4 4.4 0 0 1 7-5.4A4.4 4.4 0 0 1 19 13z\"/><path d=\"M12 10.5v5M9.5 13h5\"/>", "abyssalHeart": "<path d=\"M12 20L5 13a4.4 4.4 0 0 1 7-5.4A4.4 4.4 0 0 1 19 13z\" fill=\"currentColor\" stroke=\"none\" opacity=\".85\"/><circle cx=\"12\" cy=\"12\" r=\"1.8\" fill=\"#0b1a16\" stroke=\"none\"/><path d=\"M12 3.2v1.8M5.5 4.5l1 1.3M18.5 4.5l-1 1.3\"/>", "eyespot": "<path d=\"M2.5 12c2.6-4.4 6-6.5 9.5-6.5s6.9 2.1 9.5 6.5c-2.6 4.4-6 6.5-9.5 6.5S5.1 16.4 2.5 12z\"/><circle cx=\"12\" cy=\"12\" r=\"3.3\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"13.2\" cy=\"10.8\" r=\"1\" fill=\"#0b1a16\" stroke=\"none\"/>", "lateralLine": "<path d=\"M3 12c3-4.5 11-5.5 15-1.5l3-2.5v8l-3-2.5c-4 4-12 3-15-1.5z\"/><path d=\"M6 12h10\" stroke-dasharray=\"1.2 1.6\"/><circle cx=\"6.5\" cy=\"10.6\" r=\".9\" fill=\"currentColor\" stroke=\"none\"/>", "leechLining": "<path d=\"M5 17c-1.5-4 1-9 5.5-10 4.5-1 8.5 2 8.5 5.5 0 2.5-2 4-4 3.5-2-.4-2.2-2.8-.5-3.2\"/><circle cx=\"5.2\" cy=\"17.8\" r=\"1.8\"/><path d=\"M8.5 8.5l.6 1.2M12 7l.2 1.3M15.3 7.6l-.4 1.2\" opacity=\".7\"/>", "bloodScent": "<path d=\"M12 6c2.7 3.1 4.2 5.4 4.2 7.3a4.2 4.2 0 0 1-8.4 0C7.8 11.4 9.3 9.1 12 6z\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M4 7c1-1 2-1 3 0M3 11c1-1 2-1 3 0M17 7c1-1 2-1 3 0M18 11c1-1 2-1 3 0\"/>", "causticGland": "<path d=\"M9.5 3.5h5M10.5 3.5v5L5.5 18a2 2 0 0 0 1.8 2.8h9.4A2 2 0 0 0 18.5 18l-5-9.5v-5\"/><path d=\"M7.8 14.5h8.4\" opacity=\".7\"/><circle cx=\"10.5\" cy=\"17\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"13.8\" cy=\"16.2\" r=\".8\" fill=\"currentColor\" stroke=\"none\"/>", "broodPheromone": "<circle cx=\"12\" cy=\"12\" r=\"2.3\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"12\" cy=\"12\" r=\"5.5\" stroke-dasharray=\"1.4 2.2\"/><circle cx=\"12\" cy=\"3.5\" r=\"1.6\"/><circle cx=\"19.4\" cy=\"16.2\" r=\"1.6\"/><circle cx=\"4.6\" cy=\"16.2\" r=\"1.6\"/>", "mimicSkin": "<path d=\"M12 3.5c4.7 0 8.5 3.6 8.5 8.5S16.7 20.5 12 20.5 3.5 16.9 3.5 12 7.3 3.5 12 3.5z\" stroke-dasharray=\"3 1.6\"/><path d=\"M8 8.5c1.2-1.4 3.2-1 3.3.4.1 1.2-1.6 2-2.7 1.5-.7-.4-1-1.3-.6-1.9zM13.6 7c1.4-.5 2.8.4 2.6 1.6-.2 1.1-1.9 1.4-2.6.7-.6-.6-.6-2 0-2.3zM12.2 13c1.7-.8 3.9.3 3.8 1.9-.1 1.5-2.4 2.1-3.6 1.2-.9-.7-1-2.6-.2-3.1zM7.5 14.2c.9-.6 2.3-.2 2.4.8.1.9-1.1 1.6-2 1.2-.8-.4-.9-1.5-.4-2z\" fill=\"currentColor\" stroke=\"none\" opacity=\".8\"/>", "echoChamber": "<circle cx=\"5.5\" cy=\"12\" r=\"1.8\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M9 8.5a5 5 0 0 1 0 7M12.5 5.5a9.2 9.2 0 0 1 0 13M16 3a12.8 12.8 0 0 1 0 18\"/>", "barbedShell": "<circle cx=\"12\" cy=\"12\" r=\"5.5\"/><path d=\"M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M5.3 18.7l2.8-2.8M15.9 8.1l2.8-2.8\"/><circle cx=\"12\" cy=\"12\" r=\"1.6\" fill=\"currentColor\" stroke=\"none\"/>", "keenEdge": "<path d=\"M4 20L14.5 6.5l3 3z\" fill=\"currentColor\" stroke=\"none\" opacity=\".9\"/><path d=\"M14.5 6.5l3-3 3 3-3 3\"/><path d=\"M4 20l3.5-1.2\"/>", "scavenger": "<path d=\"M3.5 12h14\"/><path d=\"M17.5 12l3-3v6z\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M6 8.5v7M9 7.5v9M12 8v8M15 9v6\"/><circle cx=\"3.8\" cy=\"12\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/>", "phaseMembrane": "<circle cx=\"14\" cy=\"12\" r=\"6.5\" stroke-dasharray=\"2.2 2.4\"/><circle cx=\"14\" cy=\"12\" r=\"2.6\" fill=\"currentColor\" stroke=\"none\" opacity=\".55\"/><path d=\"M2.5 8.5h4M2 12h3.5M2.5 15.5h4\"/>"};
 function mutationIconSvg(key){const body=MUTATION_ICONS[key];return body?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+body+'</svg>':'';}
 function setMutationIcon(el,key){const svg=key&&mutationIconSvg(key);if(svg)el.innerHTML=svg;else el.textContent=key?(mutationSymbols[key]||''):'+';}
 const mutationSymbols={dartFlagellum:'➤',gorgerStomach:'◍',wanderingEddy:'↻',glassSkin:'◇',ramJaw:'⪢',packFeeding:'⁂',toxicWake:'∿',numbingVenom:'◌',phantomBrood:'⦾',bileSac:'◒',clingingSlime:'≋',tailFlick:'⤺',echoNucleus:'◎',pitOrgan:'◉',rendingPounce:'⫽',clingingVenom:'◓',lastBreath:'✳',toxicHusk:'⬯',venomEddy:'@',jaws:'⋏',spitGland:'❍',needleSpine:'➶',spikeBattery:'⫶',sporeSac:'⁘',serratedJaws:'⋎',devourerGullet:'◍',chitinPlates:'⬡',mirrorMembrane:'◌',whipFlagellum:'∿',jetSac:'≫',staticCharge:'ϟ',sporeGland:'⁂',twinNucleus:'⦿',fedHeart:'❦',abyssalHeart:'●',eyespot:'◉',lateralLine:'┅',barbedShell:'✧',keenEdge:'✦',scavenger:'◒',secondWind:'≈',chainPulse:'⌁',photosynthesis:'❋',undertow:'◎',fissionHeart:'♡',storedImpact:'◇',phaseMembrane:'◈',shadowMetabolism:'◐',engulfingMembrane:'◯',regrowingOrgans:'✣',leechLining:'❍',bloodScent:'⁘',causticGland:'☌',broodPheromone:'❁',keelFin:'⌇',mimicSkin:'▦',echoChamber:'◠'};
 const mutationAnatomy={dartFlagellum:'Your flagellum is short and coiled, like a spring.',gorgerStomach:'A deep, folded stomach fills half your body.',wanderingEddy:'Ring-shaped cilia circle your whole body.',glassSkin:'Your outer membrane is clear and hard as glass.',ramJaw:'Jaws sit at the very front of your body, where you strike when you ram.',packFeeding:'Fine ducts let your broodlings share what they eat.',toxicWake:'Venom pores line your flagellum.',numbingVenom:'Your venom glands make a slow nerve toxin.',phantomBrood:'Buds sit ready under the skin your decoy sheds.',bileSac:'A swollen sac of digestive acid sits behind your mouth.',clingingSlime:'Your membrane weeps a thin, sticky slime.',tailFlick:'Your flagellum ends in a stiff, quick blade.',echoNucleus:'Your nucleus pulses twice where it once pulsed once.',pitOrgan:'Two pits at your front taste the water for poison.',rendingPounce:'Your nucleus grows hooked edges along your pouncing jaws.',clingingVenom:'Your venom glands make a thick, clinging venom.',lastBreath:'Your broodlings carry stinging cells under their skin.',toxicHusk:'Your nucleus fills each shed husk with toxin.',venomEddy:'Your venom glands open into the water as you spin.',jaws:'A pair of hooked jaws opens ahead of you.',spitGland:'A swollen gland at your front holds a bead of venom.',needleSpine:'A long, hollow spine lies along your body, tip forward.',spikeBattery:'A short battery of spike tubes points forward from your front.',sporeSac:'A cluster of swollen spore sacs bulges at your front.',leechLining:'A ring of small hooked teeth lines the inside of your mouth.',bloodScent:'Two fine antennae with beaded tips reach ahead of you.',causticGland:'A bubbling acid sac sits behind your mouth.',broodPheromone:'Dotted scent rings drift outward from your nucleus.',keelFin:'Two swept fins stand at your rear.',mimicSkin:'Mottled patches drift across your membrane.',echoChamber:'Resonant arcs pulse behind your nucleus.',serratedJaws:'A crescent of small teeth lines your front edge.',devourerGullet:'A wide, folded gullet opens at the front of your body.',chitinPlates:'Amber chitin plates overlap around your membrane.',mirrorMembrane:'A thin reflective layer shimmers around your body.',whipFlagellum:'A long whip flagellum trails behind you.',jetSac:'Two pale jet sacs sit at your rear.',staticCharge:'Three charge nodes orbit your core and light up as you strike.',sporeGland:'Two spore glands swell on your flanks.',twinNucleus:'A second nucleus sits beside the first.',fedHeart:'A green storage heart glows inside you.',abyssalHeart:'A small, dark heart pulses at your centre.',eyespot:'A bright eyespot forms at your front.',lateralLine:'Dotted sensory lines run along both sides.',barbedShell:'Amber barbs grow around your membrane.',keenEdge:'Three forward blades form a cutting edge.',scavenger:'Three digestive vesicles glow inside your body.',secondWind:'Four cyan reserve sacs form around your core.',chainPulse:'Three violet nodes are linked by fine conductive threads.',photosynthesis:'Three veined chloroplasts gather around your core.',undertow:'Paired feeding tendrils curl out from your body.',shadowMetabolism:'Violet metabolic vesicles connect through fine veins.',fissionHeart:'Two rose-coloured chambers form a second heart.',storedImpact:'Three amber reservoirs hold absorbed energy.',phaseMembrane:'A split turquoise membrane forms around five luminous pearls.'};
 const seenMutations=new Set(),lessons=new Set();
 const romans=['·','I','II','III','IV','V'];
 // Each Strike shape has its own glyph on the attack button.
 const strikeGlyphs={pulse:'<path d="M8 6a6 6 0 1 0 0 12"/><path d="M8 9.500h9a2.500 2.500 0 0 1 0 5H8"/>',venomist:'<path d="M3 12h8"/><path d="M15 7c2.5 2.5 4 4 4 6a4 4 0 0 1-8 0c0-2 1.5-3.5 4-6z"/>',predator:'<path d="M4 5c8 0 13 2.500 16 7M4 19c8 0 13-2.500 16-7"/><path d="M10 6.500l1 2.500M14 8.500l.5 2M10 17.500l1-2.500M14 15.500l.5-2"/>',riptide:'<path d="M2 12h9m3-6 7 6-7 6M8 7l4 5-4 5"/>',summoner:'<path d="M5 4a11 11 0 0 1 0 16M9 7a7 7 0 0 1 0 10"/><circle cx="17" cy="12" r="2.5"/><circle cx="21" cy="7" r="1.5"/><circle cx="21" cy="17" r="1.5"/>',stalker:'<path d="M4 20 19 5m-4 0h5v5"/><circle cx="6" cy="18" r="1.5"/>'};
 let shownStrike='';
 // What you are, in one line: every grown family, strongest first, with its rank (and mastery).
 function identityText(p){const parts=families.map(f=>[f,p.traits?.[f]||0,p.mastery?.[f]||0]).filter(x=>x[1]>0).sort((a,b)=>(b[1]+b[2])-(a[1]+a[2])||((p.evidence?.[b[0]]||0)-(p.evidence?.[a[0]]||0)));return parts.length?parts.map(([f,r,m])=>familyNames[f]+' '+romans[r]+(m?' +'+m:'')).join(' · '):'Unformed cell';}
 const canvas=$('pond'), keys=new Set(), pointer={x:innerWidth*.5,y:innerHeight*.5,active:false,aimed:false,held:false,id:null};
 const touch={active:false,id:null,x:0,y:0};
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let game,renderer,audio,mode='menu',soundOn=true,soundAttempt=0,failed=false;
 let venomPress=null,abilityAim=null,lastGrowth=null,growthUnseen=false,pendingPulse=false,pendingBlock=false,blockButtonHeld=false,sprintPointer=false,sprintButtonHeld=false,sneakToggle=false,sneakPress=null,lastConceal=0,tapAim=null,buildTab='stats',compassMode='auto',assistedAim=null;
 let selectedMutation=null,previewMode='current',previewReplacement=0,specimenRenderer=null,specimenSize='',journalTab='adaptations',helpTab='controls',selectedElder='brood';
 const pendingAbilities=[];
 let refreshEstimate=1/60;
 let time=0,last=performance.now(),accumulator=0,uiTimer=0,audioTimer=0,renderAverage=16.7,qualityTimer=0,pixelScale=1;
 let playArea=null,playAreaDirty=true,renderWarmup=0,viewZoom=1,zoomNoticeTime=0;
 let activeNotice=null,noticeQueue=[],resultRecorded=false;
 let activeDialog='',growthShownAt=0,loadBusy=false,rewardContext=null;const dialogReturns=new Map();
 let checkpoint=null,checkpointStored=false;
 let best=0,guide={},recordsSaved=true,lifeNewDiscoveries=0;
 const read=(key,fallback)=>{try{const s=localStorage.getItem(key);return s?JSON.parse(s):fallback;}catch{recordsSaved=false;return fallback;}};
 const storedBest=read('morphos.best.v1',0);best=Number.isSafeInteger(storedBest)&&storedBest>=0&&storedBest<1e15?storedBest:0;
 const storedGuide=read('morphos.guide.v1',{});guide=validatedRecords({guide:storedGuide}).guide;
 const save=()=>{try{localStorage.setItem('morphos.best.v1',JSON.stringify(best));localStorage.setItem('morphos.guide.v1',JSON.stringify(guide));}catch{recordsSaved=false;}};
 // The collection: every creature type and rare find met in any life, kept in this browser.
 let collection={species:{},finds:{},legend:{}};
 try{const raw=JSON.parse(localStorage.getItem('morphos.collection.v1')||'null');if(raw&&typeof raw==='object'){for(const [k,v] of Object.entries(raw.species||{}))if(typeof k==='string'&&k.length<40&&v&&typeof v==='object')collection.species[k]={defeated:Number.isSafeInteger(v.defeated)&&v.defeated>=0?v.defeated:0};for(const k of Object.keys(raw.finds||{}))if(['fossil','shell','sealed','trail','silent','nursery'].includes(k))collection.finds[k]=true;for(const k of Object.keys(raw.legend||{}))if(typeof k==='string'&&k.length<=24)collection.legend[k]=1;}}catch{}
 function saveCollection(){try{localStorage.setItem('morphos.collection.v1',JSON.stringify(collection));}catch{}}
 function recordSpecies(key){if(!key)return false;const isNew=!collection.species[key];if(isNew){collection.species[key]={defeated:0};saveCollection();}return isNew;}
 const BASE_CREATURES={
   prey:{name:'Ciliate prey',rarity:'common',blurb:'Small, quick and harmless. Swim into it to eat it.',hint:'Everywhere.'},
   grazer:{name:'Grazer',rarity:'common',blurb:'A gentle algae eater. Edible once you outgrow it.',hint:'Everywhere.'},
   hunter:{name:'Hunter',rarity:'common',blurb:'The everyday predator. It winds up, lunges, then needs a moment to recover.',hint:'Open water.'},
   armoured:{name:'Armoured scavenger',rarity:'uncommon',blurb:'Plated and slow to anger. Strike while it recovers from a bite.',hint:'Open water.'},
   swarmer:{name:'Swarmer',rarity:'uncommon',blurb:'Small barbed darts that hunt in packs.',hint:'The bloom, away from the start.'},
   sentinel:{name:'Reef sentinel',rarity:'uncommon',blurb:'A rooted diatom that fires rings of silica shards.',hint:'The diatom reef, away from the start.'},
   jelly:{name:'Stinging jelly',rarity:'uncommon',blurb:'Drifts near its anchor. Its trailing tentacles sting.',hint:'The nutrient shallows, away from the start.'},
   apex:{name:'Apex organism',rarity:'rare',blurb:'The largest native predator. It lobs spores from range and bites hard up close.',hint:'Far out in the bloom.'},
   lancer:{name:'Lancer',rarity:'rare',blurb:'An elite hunter with a long, fast lance.',hint:'Among hunters in open water.'}
 };
 function guideEntries(){
   const out=[];for(const [key,def] of Object.entries(BASE_CREATURES))out.push({key,...def});
   const habitat=['the nutrient shallows','the diatom reef','the bloom'];
   for(const [key,sp] of Object.entries(MorphosGame.SPECIES||{})){const where=sp.biomes?' in '+sp.biomes.map(b=>habitat[b]).join(' and '):'';
     const hint=key==='wanderer'?'Drifts through the pond now and then.':key==='hatchling'?'Released by another creature.':sp.rarity==='legendary'?'Arrives from beyond view once your colony reaches '+(sp.minStage*3+1)+' cells.':'Lives in water of level '+(sp.minStage*3+1)+' and deeper'+where+(sp.rarity==='rare'?', and is rare':'')+'.';
     out.push({key,name:sp.name,rarity:sp.rarity,blurb:sp.blurb,hint});}
   const sources=MorphosGame.MUTATION_SOURCE;for(const e of out)e.drops=Object.keys(sources).filter(k=>sources[k]===e.key);
   return out;
 }
 function speciesCount(){const all=guideEntries();return{found:all.filter(e=>collection.species[e.key]).length,total:all.length};}
 function renderSpecies(){
   const target=$('speciesRows');target.replaceChildren();const all=guideEntries(),count=speciesCount(),finds=Object.keys(collection.finds).length;
   $('speciesSummary').textContent=count.found+' of '+count.total+' creatures recorded · '+finds+' of 2 rare places found';
   const tiers=[['common','Common','#a9c9a0'],['uncommon','Uncommon','#9fd0d6'],['rare','Rare','#f0c98a'],['legendary','Legendary','#d8b4fb']];
   for(const [rarity,title,colour] of tiers){const list=all.filter(e=>e.rarity===rarity);if(!list.length)continue;
     const sec=document.createElement('section');sec.className='species-tier';sec.style.setProperty('--tier',colour);const h=document.createElement('h3');h.textContent=title+' · '+list.filter(e=>collection.species[e.key]).length+' / '+list.length;sec.append(h);
     const grid=document.createElement('div');grid.className='species-grid';
     for(const e of list){const rec=collection.species[e.key],card=document.createElement('div');card.className='species-card'+(rec?' found':'');
       const name=document.createElement('strong');name.textContent=rec?e.name:'Undiscovered';if(rec&&rec.defeated){const d=document.createElement('small');d.textContent=rec.defeated+' defeated';name.append(d);}card.append(name);
       const text=document.createElement('p');text.textContent=rec?e.blurb:e.hint;card.append(text);
       if(rec)for(const k of e.drops||[]){const best=tierOf(k);if(best<0)continue;const d=document.createElement('p');d.className='drop';d.textContent='Dropped: '+MorphosGame.MUTATIONS[k].name+' · best '+tierName(best);d.style.color=TIER_COLOURS[best];card.append(d);}
       grid.append(card);}
     sec.append(grid);target.append(sec);}
   const sec=document.createElement('section');sec.className='species-tier';sec.style.setProperty('--tier','#f0c98a');const h=document.createElement('h3');h.textContent='Rare places · '+finds+' / 6';sec.append(h);const grid=document.createElement('div');grid.className='species-grid';
   for(const [key,name,blurb,hint] of [['fossil','Ancient fossil','Rest at its centre to draw out a mutation you have not found.','A rare place in open water.'],['shell','Abandoned shell','Shelter inside it and predators cannot see you.','A rare place in open water.'],['sealed','Sealed shell','It opened for a colony that stayed perfectly still.','A secret of the dark water.'],['trail','Hidden garden','Untouched algae at the end of a trail of lights.','A secret of the deep water.'],['silent','Silent current','A current almost too faint to see, running out of the known water.','A secret of the deep water.'],['nursery','Empty nursery','A ring of silt where another seed once lay.','A secret of the deepest water.']]){const found=!!collection.finds[key],card=document.createElement('div');card.className='species-card'+(found?' found':'');const n=document.createElement('strong');n.textContent=found?name:'Undiscovered';const t=document.createElement('p');t.textContent=found?blurb:hint;card.append(n,t);grid.append(card);}
   sec.append(grid);target.append(sec);
 }
 const ADAPTATION_TOTAL=35;
 function discovered(){return Object.keys(guide).filter(k=>/^(venomist|predator|riptide|summoner|stalker)-(1|3|2[ab]|4[ab])$/.test(k)||/^hybrid-/.test(k)&&Object.hasOwn(MorphosGame.HYBRIDS,k.slice(7))).length;}
 function clock(seconds){seconds=Math.max(0,Math.floor(seconds||0));return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
 function pointText(value){return value+' stat '+(value===1?'point':'points');}
 function rewardText(reward){const parts=[];if(reward.reward>0)parts.push('+'+pointText(reward.reward));if(reward.biomassReward>0)parts.push('+'+reward.biomassReward+' biomass');if(reward.scoreReward>0)parts.push('+'+reward.scoreReward+' score');return parts.join(' · ')||'Field notes recorded';}
 function clearNotices(){activeNotice=null;noticeQueue=[];$('tip').classList.remove('show');}
 function notify(text,duration=3.5,priority=1){
   if(activeNotice?.text===text||noticeQueue.some(n=>n.text===text))return;
   const notice={text:String(text),remaining:duration,priority};
   if(!activeNotice)activeNotice=notice;
   else if(priority>activeNotice.priority){if(activeNotice.priority>=2)noticeQueue.unshift(activeNotice);activeNotice=notice;}
   else noticeQueue.push(notice);
   noticeQueue.sort((a,b)=>b.priority-a.priority);noticeQueue=noticeQueue.slice(0,5);
 }
 function updateNotices(dt){
   if(activeDialog||mode==='end'){$('tip').classList.remove('show');return;}
   if(!activeNotice)activeNotice=noticeQueue.shift()||null;
   if(!activeNotice){$('tip').classList.remove('show');return;}
   {const tp=$('tip');if(tp.textContent!==activeNotice.text)tp.textContent=activeNotice.text;if(!tp.classList.contains('show'))tp.classList.add('show');}activeNotice.remaining-=dt;
   if(activeNotice.remaining<=0)activeNotice=null;
 }
 let frozenDrawn=false;
 try{new ResizeObserver(()=>{const v=document.getElementById('vitals');if(!v)return;document.documentElement.style.setProperty('--vitals-b',Math.ceil(v.getBoundingClientRect().bottom)+'px');playAreaDirty=true;}).observe(document.getElementById('vitals'));}catch{}
 function setMode(value){frozenDrawn=false;
   if(value==='menu'&&respawnBusy)respawnCancel();mode=value;document.body.dataset.mode=value;playAreaDirty=true;
   $('home').hidden=value!=='menu';$('gameUI').hidden=value==='menu'||value==='end';
   $('pause').hidden=value==='menu'||value==='end';$('skillsTool').hidden=value==='menu'||value==='end';
   $('endScreen').hidden=value!=='end';if(game)game.state.paused=value!=='playing';if(value==='playing')canvas.focus({preventScroll:true});
 }
 function clearInput(){const pointerId=pointer.id;pointer.id=null;if(pointerId!==null&&canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId);keys.clear();pointer.held=false;pointer.active=false;pointer.aimed=false;assistedAim=null;releasePad();pendingPulse=pendingBlock=blockButtonHeld=sprintPointer=sprintButtonHeld=false;pendingAbilities.length=0;touch.active=false;touch.x=touch.y=0;touch.id=null;sneakToggle=false;sneakPress=null;tapAim=null;venomPress=null;strikePress=null;abilityAim=null;$('touchPad').style.setProperty('--jx','0px');$('touchPad').style.setProperty('--jy','0px');padRelease();}
 function refreshRecords(){const n=discovered(),c=speciesCount();$('homeBest').textContent=(best?'BEST '+best.toLocaleString('en-GB')+' · ':'')+n+' / '+ADAPTATION_TOTAL+' ADAPTATIONS · '+c.found+' / '+c.total+' CREATURES';}
 function chooseSeed(){const a=['Quiet','Verdant','Silver','Hidden','Golden','Glass','Velvet','Ancient','Emerald','Tender','Amber','Rainlit'],b=['Spring','Water','Garden','Bloom','Current','Lagoon','Reed','Tide','Marsh','Dawn','Mirage','Ripple'];const n=new Uint32Array(3);crypto.getRandomValues(n);return a[n[0]%a.length]+' '+b[n[1]%b.length]+' '+(100+n[2]%900);}
 function safeSeed(){return $('seedInput').value.trim().normalize('NFC').slice(0,48)||'First light';}
 function closeAllDialogs(){
   activeDialog='';for(const d of document.querySelectorAll('dialog[open]'))d.close();
 }
 function activateDialog(id,returnTo){
   const previous=activeDialog;activeDialog=id;dialogReturns.set(id,returnTo);
   if(previous&&previous!==id&&$(previous).open)$(previous).close();
   if(!$(id).open)$(id).showModal();
 }
 function backFromDialog(id){
   if(activeDialog!==id||$(id).open)return;
   if(id==='skillsDialog'&&mode==='evolving'){if(performance.now()-growthShownAt<300){activateDialog('skillsDialog','evolution');return;}continueEvolution();return;}
   activeDialog='';const back=dialogReturns.get(id)||'playing';
   if(back==='pause'){setMode('paused');showSkills();}
   else if(back==='evolution'){if(rewardContext)showElderReward(rewardContext);else{setMode('paused');showSkills();}}
   else if(back==='playing')resumeGame();
   else setMode(back);
 }
 // The pause screen's corner tools follow the dialog: shown as a popover while it is open (or in its header where popovers are unsupported).
 let soloAvailable=false;
 function showPanel(id){
   let back=mode;
   if(mode==='evolving'||activeDialog==='evolution')back='evolution';
   else if(activeDialog==='skillsDialog')back='pause';
   else if(activeDialog)back=dialogReturns.get(activeDialog)||mode;
   clearInput();if(mode==='playing')setMode('paused');
   activateDialog(id,back);
 }
 function startLife(seed=safeSeed(),session=null){
   if(!session)coopLeave();closeAllDialogs();rewardContext=null;game=new MorphosGame(seed);lastGrowth=null;growthUnseen=false;latestUnseen=false;treeSelected='';clearInput();seenMutations.clear();lessons.clear();resultRecorded=false;lifeNewDiscoveries=0;accumulator=0;buildTab='stats';compassMode='auto';resetSpecimen();
   $('seedInput').value=seed;clearNotices();fileMessage('');
   if(renderer){renderer.resetView();}
   setMode('playing');last=performance.now();updateUI(true);if(!session)saveCheckpoint('A new life','initial');
   if(audio&&soundOn)audio.event({type:'biome',index:0,name:game.state.biomeName});
 }
 function returnHome(){
   coopLeave();coopReadStored();closeAllDialogs();clearInput();rewardContext=null;game=new MorphosGame(safeSeed());lastGrowth=null;growthUnseen=false;latestUnseen=false;treeSelected='';setMode('menu');clearNotices();refreshRecords();fileMessage('');
 }
 // Pausing opens the body screen: stats first, with save, load, guides and exits along its footer.
 function pauseGame(){
   if(mode!=='playing')return;
   // Co-op: the pond does not stop for one player. You can rest (and cannot be hurt while you do), but not while something is hunting you.
   if(coopOn()){const hunted=game.coopHunted();if(hunted){notify(hunted==='boss'?'You cannot rest while an apex predator is hunting you.':'You cannot rest while a predator is on you.',3,2);return;}}if(buildTab==='evolution')buildTab='stats';showSkills();updateCheckpointUI();
 }
 function resumeGame(){
   if(game.state.pendingEvolution){showGrowth(game.state.pendingEvolution);return;}
   closeAllDialogs();clearInput();accumulator=0;setMode('playing');last=performance.now();
 }
 let capturing='';
 function renderControls(){
   BINDING_NOTES.block=mouseAimOnly?'Also right click':'';BINDING_NOTES.fastSwim=mouseAimOnly?'':'Also hold right click';
   const box=$('controlsList');box.replaceChildren();
   {const sec=document.createElement('section'),h=document.createElement('h3'),row=document.createElement('div'),name=document.createElement('span'),note=document.createElement('small'),group=document.createElement('div');
     h.textContent='Layout';row.className='control-row';name.textContent=mouseAimOnly?'WASD + mouse aim':'Mouse steers';note.textContent=mouseAimOnly?'W A S D swim, the mouse aims. Left click strikes, right click blocks.':'Your cell swims towards the cursor. Left click strikes, right click swims fast.';name.append(note);
     group.className='mouse-modes';group.setAttribute('role','radiogroup');group.setAttribute('aria-label','Control layout');
     for(const [value,label] of [['steer','Mouse steers'],['aim','WASD + aim']]){const b=document.createElement('button');b.type='button';const on=(value==='aim')===mouseAimOnly;b.className='key-chip'+(on?' selected':'');b.textContent=label;b.setAttribute('role','radio');b.setAttribute('aria-checked',String(on));
       b.addEventListener('click',()=>{mouseAimOnly=value==='aim';bindings=mouseAimOnly?{...DEFAULT_BINDINGS,...WASD_PRESET}:{...DEFAULT_BINDINGS};saveMouseMode();saveBindings();capturing='';applyBindingLabels();renderControls();$('controlsStatus').textContent='';});group.append(b);}
     row.append(name,group);sec.append(h,row);box.append(sec);}
   for(const [title,actions] of BINDING_GROUPS){const sec=document.createElement('section'),h=document.createElement('h3');h.textContent=title;sec.append(h);
     for(const a of actions){const row=document.createElement('div');row.className='control-row';const name=document.createElement('span');name.textContent=BINDING_NAMES[a];if(BINDING_NOTES[a]){const n=document.createElement('small');n.textContent=BINDING_NOTES[a];name.append(n);}
       const chip=document.createElement('button');chip.type='button';chip.className='key-chip'+(capturing===a?' capturing':bindings[a]?'':' unset');chip.textContent=capturing===a?'Press a key…':(keyLabel(a)||'Not set');chip.setAttribute('aria-label',BINDING_NAMES[a]+': '+(keyLabel(a)||'not set')+'. Choose to change.');
       chip.addEventListener('click',()=>{capturing=capturing===a?'':a;renderControls();if(capturing)$('controlsDialog').querySelector('.key-chip.capturing')?.focus({preventScroll:true});});row.append(name,chip);sec.append(row);}
     box.append(sec);}
   if(capturing)$('controlsStatus').textContent='Press a key or mouse button for '+BINDING_NAMES[capturing]+'. Esc cancels, Backspace clears it.';
 }
 function showControls(){capturing='';$('controlsStatus').textContent='';renderControls();showPanel('controlsDialog');}
 // Every on-screen key hint (buttons, tooltips, help) reads the current bindings.
 function applyBindingLabels(){
   const set=(id,text)=>{const el=$(id)?.querySelector('.key');if(el)el.textContent=text;};
   if(padActive){set('pulseButton','RT');set('blockButton','LB');set('dashButton','LT');set('sneakButton','RB');}
   else{set('pulseButton','LMB'+(bindings.strike?' '+keyLabel('strike'):''));{const rmbFree=!actionFor('rmb');set('blockButton',mouseAimOnly&&rmbFree?'RMB':(keyLabel('block')||'—'));set('dashButton',mouseAimOnly||!rmbFree?(keyLabel('fastSwim')||'—').toUpperCase():'RMB'+(bindings.fastSwim?' '+keyLabel('fastSwim'):''));}set('sneakButton',(keyLabel('sneak')||'—').toUpperCase());}
   for(const f of families)set('ability-'+f,keyLabel(f)||'—');
   {const dt=$('helpRightDt'),dd=$('helpRightDd');if(dt&&dd){if(!dd.dataset.fast)dd.dataset.fast=dd.textContent;dt.textContent=mouseAimOnly?'Right click':'Hold right click';dd.textContent=mouseAimOnly?'Block. Press it just as an attack lands to parry. Swim fast with '+(keyLabel('fastSwim')||'the fast swim key')+'.':dd.dataset.fast;}}
   if($('helpMouseLine'))$('helpMouseLine').textContent=mouseAimOnly?'Swim with the movement keys. The mouse only aims (set under Controls).':'Swim towards the cursor, or move with the movement keys while aiming with the mouse.';
   const hint=a=>bindings[a]?' ('+keyLabel(a)+')':'';
   $('sound').title='Sound'+hint('sound');$('pause').title='Pause ('+(bindings.pause?keyLabel('pause')+' / ':'')+'Esc)';$('fullscreen').title='Fullscreen'+hint('fullscreen');$('skillsTool').title='Body & mutations'+hint('body');
   $('nextAdaptation').title='See how your habits shape your body'+hint('body');$('quickNavigation').title='Choose your course'+hint('navigate');$('mutationLoadout').title='View your mutations'+hint('body');

   for(const el of document.querySelectorAll('[data-key]'))el.textContent=keyLabel(el.dataset.key)||'(unset)';
 }
 const pressKey=a=>keyLabel(a)?'Press '+keyLabel(a):'Open the body screen';
 function showHelp(){setTabGroup(helpTabs,helpTab);showPanel('helpDialog');$(helpTabs[helpTab][0]).focus({preventScroll:true});}
 // The Legend: everything heard of the First Colony, across lives. Unheard lines are shown only as a gap.
 function heardLegend(id){if(!id||collection.legend[id])return;collection.legend[id]=1;saveCollection();}
 function renderLegend(){
   const box=$('legendNotes');if(!box)return;box.replaceChildren();const L=collection.legend||{};
   const sec=(title,rows)=>{const el=document.createElement('section');el.className='legend-sec';const h=document.createElement('h3');h.textContent=title;el.append(h);for(const [head,text] of rows){const row=document.createElement('div');row.className='legend-row'+(text?'':' gap');if(head){const b=document.createElement('b');b.textContent=head;row.append(b);}const p=document.createElement('p');p.textContent=text?'“'+text+'”':'· · ·';row.append(p);el.append(row);}box.append(el);};
   sec('The Last Water',(MorphosGame.LEGEND||[]).map(e=>['',L[e.id]?e.text:'']));
   const K=MorphosGame.KEEPER_LINES||{},B=MorphosGame.BOSSES||{};
   sec('The keepers',Object.keys(K).flatMap(k=>[[B[k]?B[k].name:k,L['wake:'+k]?K[k].wake:''],['',L['fall:'+k]?K[k].fall:'']]));
   const W=MorphosGame.WONDER_LINES||{},LM=MorphosGame.LANDMARKS||{};
   sec('The remains',Object.keys(W).map(k=>[L['wonder:'+k]&&LM[k]?LM[k].name:'',L['wonder:'+k]?W[k]:'']));
   const TH=MorphosGame.THREADS||{};for(const [k,title] of [['fate','The hermits’ fate'],['hunters','The lost hunters'],['nurseries','The other nurseries']])sec(title,(TH[k]||[]).map(e=>['',L[e.id]?e.text:'']));
   sec('What the hermits remember',(MorphosGame.HERMIT_MEMORIES||[]).map((m,i)=>['',L['memory:'+i]?m:'']));
 }
 function showJournal(){renderJournal();setTabGroup(guideTabs,journalTab);showPanel('journalDialog');$(guideTabs[journalTab][0]).focus({preventScroll:true});}
 function showSkills(tab){
   if(!game||game.state.status!=='playing')return;if(typeof tab==='string'&&buildTabs[tab])buildTab=tab;
   $('skillsDialog').dataset.evolving=String(mode==='evolving');if(mode!=='evolving'&&typeof tab!=='string'&&buildTab!=='map')buildTab=game.state.pendingChoice?'evolution':buildTab==='evolution'?'stats':buildTab;
   if(mode!=='evolving')$('evolutionSummary').hidden=true;
   renderSkills();showPanel('skillsDialog');if(buildTab==='mutations')markMutationsSeen();
   // Closing the body screen outside a division always returns to the pond.
   if(mode!=='evolving')dialogReturns.set('skillsDialog','playing');
   const back=dialogReturns.get('skillsDialog');$('skillsBack').textContent=back==='evolution'?'Continue':'Keep swimming';updateCheckpointUI();
   $(buildTabs[buildTab][0]).focus({preventScroll:true});
 }
 // Field research lives on the pause screen now: R pauses and highlights the current study.
 function showResearch(){if(mode==='playing')pauseGame();const el=$('pauseStudy');if(el){el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');}}
 function renderJournal(){
   const target=$('journalRows');target.replaceChildren();
   for(const family of families){const section=document.createElement('section');section.className='guide-family';section.style.setProperty('--trait','var(--'+family+')');
     const title=document.createElement('h3');title.textContent=familyNames[family];section.append(title);
     const p=document.createElement('p');p.textContent=familyDescriptions[family];section.append(p);
     const ranks=document.createElement('div');ranks.className='guide-ranks';
     for(const node of ['1','2a','2b','3','4a','4b','5']){const rank=+node[0],side=node[1]||'',entry=guide[family+'-'+node],tile=document.createElement('div');tile.className='guide-rank'+(entry?' found':'');const small=document.createElement('small');small.textContent=romans[rank]+(side?' · '+side.toUpperCase():'');tile.append(small);const label=document.createElement('span');label.textContent=entry&&typeof entry.title==='string'?entry.title:'Undiscovered';tile.append(label);if(entry&&entry.reason)tile.title=String(entry.reason);ranks.append(tile);}section.append(ranks);target.append(section);
   }
   {const sec=document.createElement('section');sec.className='guide-family';sec.style.setProperty('--trait','#d9c6f2');const h=document.createElement('h3');h.textContent='Hybrids';const p=document.createElement('p');p.textContent='Raise two neighbouring classes to rank II and a hybrid forms between them.';const ranks=document.createElement('div');ranks.className='guide-ranks hybrid-ranks';for(const [k,def] of Object.entries(MorphosGame.HYBRIDS)){const entry=guide['hybrid-'+k],tile=document.createElement('div');tile.className='guide-rank'+(entry?' found':'');const small=document.createElement('small');small.textContent=def.families.map(f=>familyNames[f]).join(' + ');const label=document.createElement('span');label.textContent=entry?def.name:'Undiscovered';tile.title=entry?def.effect:'';tile.append(small,label);ranks.append(tile);}sec.append(h,p,ranks);target.append(sec);}
   $('journalTotal').textContent=discovered()+' of '+ADAPTATION_TOTAL+' adaptations discovered · '+speciesCount().found+' of '+speciesCount().total+' creatures recorded';renderSpecies();
   renderElderNotes();renderLegend();
   const notes=$('placeNotes');notes.replaceChildren();
   const places=Array.isArray(game.state.discoveredLandmarks)?game.state.discoveredLandmarks:[];
   $('placeSummary').textContent=places.length+' '+(places.length===1?'place':'places')+' discovered in this life'+(places.length>12?' · Showing the most recent 12.':'.');
   if(!places.length){const p=document.createElement('p');p.className='small-print';p.textContent='An endless pond is waiting. Follow unfamiliar signals to find places with useful rewards.';notes.append(p);}
   for(const place of places.slice(-12).reverse()){
     const row=document.createElement('div');row.className='place-note';
     const name=document.createElement('strong'),detail=document.createElement('small');name.textContent=place.name||'A place in the pond';
     detail.textContent=place.claimed?'Investigated':'Discovered';row.append(name,detail);notes.append(row);
   }
 }
 function renderElderNotes(){
   const target=$('elderNotes'),selector=$('elderSelector');target.replaceChildren();selector.replaceChildren();const p=game.state.player;
   if(!MorphosGame.BOSSES[selectedElder])selectedElder=Object.keys(MorphosGame.BOSSES)[0];
   for(const [key,def] of Object.entries(MorphosGame.BOSSES||{})){
     const choice=document.createElement('button');choice.type='button';choice.dataset.elder=key;choice.setAttribute('aria-pressed',String(key===selectedElder));choice.textContent=def.name;choice.addEventListener('click',()=>{selectedElder=key;renderElderNotes();selector.querySelector('[data-elder="'+key+'"]').focus({preventScroll:true});});selector.append(choice);
     if(key!==selectedElder)continue;
     const row=document.createElement('section');row.className='elder-note'+((p.genomes||[]).includes(key)?' defeated':'');const tag=document.createElement('small');tag.textContent=(p.genomes||[]).includes(key)?'GENOME ACQUIRED':'HUNTS YOU FROM LEVEL '+def.level;const name=document.createElement('h4');name.textContent=def.name;const description=document.createElement('p');description.textContent=def.description;const tactic=document.createElement('p');tactic.className='elder-tactic';tactic.textContent=def.hint||'Read its attacks, evade, then strike during recovery.';const reward=document.createElement('div');reward.className='elder-reward';reward.textContent='Reward: '+(def.genomeName||'elder genome')+' · '+(MorphosGame.MUTATIONS?.[def.mutationKey]?.name||'a unique mutation');row.append(tag,name,description,tactic,reward);target.append(row);
   }
 }
 // What wakes each class's ability: shown on its greyed button and when it is pressed too early.
 const WAKE_TEXT={predator:['kills','Kill creatures to wake it'],summoner:['divisions','Grow new cells to wake it'],venomist:['venom','Kill jellies or puffers, or survive their stings, to wake it'],riptide:['close calls','Narrow escapes, near misses and rams on predators while swimming fast wake it'],stalker:['s hidden','Stay fully hidden (Sneak) near a predator to wake it']};
 const WAKE_HINTS=new Proxy({},{get(_,trait){const need=MorphosGame.WAKE_NEEDS[trait]||1,have=Math.min(need,Math.floor(game?.state.player.wake?.[trait]||0)),w=WAKE_TEXT[trait]||['',''];return{short:have+' / '+need+(trait==='stalker'?w[0]:' '+w[0]),long:w[1]+' ('+have+' of '+need+').'};}});
 function queueAbility(trait){
   if(mode!=='playing')return;const p=game.state.player,def=MorphosGame.ABILITIES[trait];
   if(!def)return;
   if(!game.awakened(trait)){notify(def.name+' is still asleep. '+WAKE_HINTS[trait].long,5);return;}
   if(p.exhausted){notify('Exhausted.',2.5);return;}
   if((p.abilityCooldowns?.[trait]||0)>0)return;
   if(p.energy<(p.abilityCosts?.[trait]??def.cost)){notify('Not enough stamina for '+def.name+'.',2.5);return;}
   if(!pendingAbilities.includes(trait))pendingAbilities.push(trait);
 }
 function setControlState(button,{ready=1,remaining=0,active=false,locked=false,exhausted=false,lowStamina=false}){
   const cooling=!locked&&!exhausted&&remaining>0;
   for(const [name,value] of Object.entries({locked,active:!locked&&active,cooling,exhausted:!locked&&exhausted,'low-stamina':!locked&&lowStamina,unready:locked||exhausted||remaining>0||lowStamina}))button.classList.toggle(name,!!value);
   button.style.setProperty('--ready',String(locked?0:clamp(ready,0,1)));
   button.setAttribute('aria-disabled',String(locked||exhausted||remaining>0||lowStamina));
   const state=button.querySelector('.orb-state');if(state)state.textContent=cooling?(remaining>=1?String(Math.ceil(remaining)):(Math.ceil(remaining*10)/10).toFixed(1)):'';
 }
 function staminaReadiness(p,cost){return p.exhausted?clamp(p.energy/p.maxEnergy,0,1):clamp(p.energy/Math.max(1,cost),0,1);}
 function updateAbilities(){
   if(!game)return;const p=game.state.player;
   for(const trait of families){
     const key=keyLabel(trait)||'no key',def=MorphosGame.ABILITIES[trait],button=$('ability-'+trait),rank=p.traits[trait]||0;{const bar=document.querySelector('.evolved-actions');if(bar){bar.style.setProperty('--organs',families.length);bar.hidden=false;}}
     if(!button||!def)continue;
     const remaining=p.abilityCooldowns?.[trait]||0,cooldown=p.abilityCooldownMax?.[trait]||def.cooldown,cost=p.abilityCosts?.[trait]??def.cost;
     const active=({venomist:p.specialActiveTrait==='venomist'?p.specialTime:0,predator:p.pounceTime,riptide:(game.state.vortices||[]).some(v=>!v.remote)?1:0,summoner:p.swarmTime,stalker:p.veilTime})[trait]>0;
     const lowStamina=!p.exhausted&&p.energy<cost,ready=Math.min(1-clamp(remaining/cooldown,0,1),staminaReadiness(p,cost));
     const awake=game.awakened(trait);setControlState(button,{ready,remaining,active,locked:!awake,exhausted:!!p.exhausted,lowStamina});button.hidden=false;
     button.querySelector('small').textContent=!awake?WAKE_HINTS[trait].short:p.exhausted?'Recovering':lowStamina?'Need stamina':Math.round(cost)+' stamina';
     button.title=key+': '+def.name+'. '+def.description+(!awake?' Still asleep: '+WAKE_HINTS[trait].long.charAt(0).toLowerCase()+WAKE_HINTS[trait].long.slice(1):'');
     button.setAttribute('aria-label',def.name+', '+key+', '+(!awake?'asleep: '+WAKE_HINTS[trait].long:p.exhausted?'recovering until stamina is full':(remaining>0?'cooldown '+remaining.toFixed(1)+' seconds, ':'')+(lowStamina?'needs more stamina':Math.round(cost)+' stamina')));
   }
 }
 // The cockpit: health and stamina as liquid gauges, the colony's size with its growth ring, nutrition as a thin bar.
 // Each value is written only when it changes, so the HUD costs almost nothing per frame.
 const ckLast={};
 function ckSet(key,value,apply){if(ckLast[key]===value)return;ckLast[key]=value;apply(value);}
 function taskProgressText(x){const f=game.taskProgress(x);return x.kind==='rescue'?(x.found?'Bring '+x.pro+' home':'Find '+x.pro):x.kind==='fetch'?'Find it':x.kind==='hunt'?(f>=1?'1':'0')+' / 1':x.kind==='nest'?Math.round(f*3)+' / 3':Math.round(f*100)+'%';}
 function taskWhere(x){const p=game.state.player,pt=MorphosGame.taskPoint(x),d=Math.hypot(pt.x-p.x,pt.y-p.y);return (d<1000?Math.round(d/10)*10:(d/1000).toFixed(1)+'k')+' · level '+((x.done||pt.home?MorphosGame.waterLevel(pt.x,pt.y):x.zone)+1);}
 let hermitRenderer=null;
 function openHermit(){
   const h=game.hermitHere&&game.hermitHere();if(!h)return;const tk=h.task;$('hermitDlgName').textContent=h.name;
   const lines={offer:tk?'“'+tk.story+'”':'',active:tk&&tk.kind==='rescue'&&tk.found?'“Bring '+(tk.pro||'them')+' closer. Let me see '+(tk.pro||'them')+'.”':'“Still out there? I am waiting.”',ready:'“'+(MorphosGame.TASK_THANKS[tk&&tk.kind]||'Thank you.').replace(/them/g,tk&&tk.pro||'them')+'”',full:'“You carry enough troubles already. Come back when you have fewer.”',spent:'“You have done more for me than I had any right to ask. There are others like me further out, where the water is deeper. They need you more than I do.”',young:'“You are very small. Grow a little, then come back to me.”',none:'“Nothing for you yet. Rest a while.”'};
   $('hermitDlgStory').textContent=lines[h.state]||'';{const m=$('hermitDlgMemory');if(m){m.textContent=h.memory?'“'+h.memory+'”':'';m.hidden=!h.memory;if(h.memory){const i=(MorphosGame.HERMIT_MEMORIES||[]).indexOf(h.memory);if(i>=0)heardLegend('memory:'+i);}}}$('hermitDlgTask').hidden=!tk;$('hermitDlgReward').hidden=true;
   {const n=(h.helped||0)+(h.state==='offer'||h.state==='active'||h.state==='ready'?1:0),T=MorphosGame.HERMIT_TASKS;$('hermitDlgKicker').textContent=h.state==='spent'?'Hermit':n?'Hermit · task '+Math.min(n,T)+' of '+T:'Hermit';}
   if(tk){$('hermitDlgTitle').textContent=tk.title;const lvl=tk.zone+1,me=game.state.player.stage+1;$('hermitDlgMeta').textContent=(h.state==='ready'?'Done':h.state==='active'?taskProgressText(tk):'To the '+game._compass(tk.x-tk.hx,tk.y-tk.hy)+' · '+(Math.hypot(tk.x-tk.hx,tk.y-tk.hy)/1000).toFixed(1)+'k')+' · water level '+lvl+(lvl>me?' (above you)':'')+' · '+tk.reward+' mutation';}
   const P=$('hdPrimary'),S=$('hdSecondary');S.hidden=false;
   if(h.state==='offer'){P.textContent='Accept';S.textContent='Not now';P.onclick=()=>{game.acceptTask();closeHermit();};S.onclick=closeHermit;}
   else if(h.state==='ready'){P.textContent='Claim reward';S.hidden=true;P.onclick=()=>{if(game.claimTask())showHermitReward(game.lastReward);else closeHermit();};}
   else if(h.state==='active'){P.textContent='I’ll find it';S.textContent='Drop task';P.onclick=closeHermit;S.onclick=()=>{game.dropTask(tk.target);closeHermit();};}
   else{P.textContent='Farewell';S.hidden=true;P.onclick=closeHermit;}
   showPanel('hermitDialog');requestAnimationFrame(()=>drawHermitPortrait(h.id));P.focus({preventScroll:true});
 }
 // After a claim the dialog stays open and shows what the hermit gave.
 function showHermitReward(r){
   if(!r){closeHermit();return;}$('hermitDlgTask').hidden=true;const box=$('hermitDlgReward');box.hidden=false;const M=MorphosGame.MUTATIONS[r.key],col=MorphosGame.TIER_COLOURS[r.tier]||'#f0d48c';box.style.setProperty('--tier',col);
   if(M){setMutationIcon($('hermitRwIcon'),r.key);$('hermitRwTier').textContent=(r.upgrade?'Better copy · ':'')+tierName(r.tier);$('hermitRwName').textContent=M.name;const part=(MorphosGame.BODY_PARTS||[]).find(b=>b.key===M.part);$('hermitRwPart').textContent=part?part.name:'';$('hermitRwText').textContent=MorphosGame.describeMutation(r.key,r.tier);}
   else{$('hermitRwIcon').textContent='+';$('hermitRwTier').textContent='Growth';$('hermitRwName').textContent='Nothing you do not already carry';$('hermitRwPart').textContent='';$('hermitRwText').textContent='';}
   $('hermitRwExtra').textContent='+ growth · +200 score';
   if(r.last)$('hermitDlgStory').textContent=$('hermitDlgStory').textContent.replace(/”$/,' That is all I can give. Others live further out, where the water is deeper.”');
   if(r.fate){const m=$('hermitDlgMemory');if(m){m.textContent='“'+r.fate+'”';m.hidden=false;}}
   const P=$('hdPrimary'),S=$('hdSecondary');S.hidden=!M;P.textContent='Farewell';P.onclick=closeHermit;S.textContent='Equip';S.onclick=()=>{closeHermit();showSkills('mutations');};P.focus({preventScroll:true});
 }
 function closeHermit(){ckLast.hermit=null;ckLast.tasks=null;$('hermitDialog').close();updateUI(true);}
 function drawHermitPortrait(id){const cv=$('hermitPortrait'),box=cv.getBoundingClientRect();if(box.width<10)return;const dpr=Math.min(devicePixelRatio||1,2);cv.width=Math.round(box.width*dpr);cv.height=Math.round(box.height*dpr);if(!hermitRenderer||hermitRenderer.canvas!==cv)hermitRenderer=new MorphosRenderer(cv,true);const c=hermitRenderer.ctx,l=game.state.landmarks.find(x=>x.id===id)||{id,phase:0};c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,cv.width,cv.height);const k=Math.min(cv.width,cv.height)/170;c.setTransform(k,0,0,k,cv.width/2-63*k,cv.height/2+18*k);hermitRenderer.drawHermit(c,{...l,id},150,performance.now()/1000,{tasks:[],player:{stage:0},portrait:true});}
 function updateCockpit(p,nutrition){
   const hp=clamp(p.hp/Math.max(1,p.maxHp),0,1),st=clamp(p.energy/Math.max(1,p.maxEnergy),0,1);
   ckSet('hp',Math.round(hp*200),v=>$('ckHp').style.setProperty('--f',(v/200).toFixed(3)));
   ckSet('hpt',Math.ceil(p.hp),v=>$('ckHpText').textContent=v);
   ckSet('low',hp<.25,v=>$('ckHp').classList.toggle('low',v));
   ckSet('st',Math.round(st*200),v=>$('ckSt').style.setProperty('--f',(v/200).toFixed(3)));
   ckSet('stt',Math.floor(p.energy),v=>$('ckStText').textContent=v);
   ckSet('ex',!!p.exhausted,v=>$('ckSt').classList.toggle('exhausted',v));
   ckSet('nut',Math.round(clamp(nutrition,0,100)),v=>{$('ckNutFill').style.width=v+'%';$('ckNut').classList.toggle('low',v<22);$('ckNut').title='Nutrition '+v+'%';});
   ckSet('cells',String(p.cellCountText||p.cellCount),v=>{$('ckCells').textContent=v;$('ckCellsWord').textContent=p.cellCount===1?'cell':'cells';});
   {const st=document.querySelector('.stage-panel'),tip=$('tip'),bh=$('bossHUD');if(st&&tip){const sb=st.getBoundingClientRect(),visible=sb.height>4&&[...st.children].some(e=>!e.hidden&&getComputedStyle(e).display!=='none'),top=parseFloat(getComputedStyle(tip).top)||0,bb=bh&&!bh.hidden?bh.getBoundingClientRect().bottom:0,hc=$('hermitCard'),hb=hc&&!hc.hidden&&touchUI()?hc.getBoundingClientRect().bottom:0,push=Math.max(0,Math.ceil(Math.max(visible?sb.bottom:0,bb,hb)+8-top));ckSet('tipPush',push,v=>tip.style.marginTop=v?v+'px':'');}}
   {const h=game.hermitHere&&game.hermitHere(),tk=h&&h.task,key=h?h.id+'|'+h.state+'|'+(tk?tk.title:''):'';ckSet('hermit',key,()=>{const card=$('hermitCard');card.hidden=!h;if(!h){return;}$('hermitName').textContent=h.name;
     $('hermitLine').textContent=h.state==='offer'?'Has something to ask you':h.state==='active'?tk.title:h.state==='ready'?'Waiting for you':h.state==='full'?'You carry three tasks already':'';$('hermitLine').hidden=!$('hermitLine').textContent;$('hermitAccept').hidden=false;$('hermitClaim').hidden=true;$('hermitDrop').hidden=true;
});}
   {const list=game.state.tasks||[],tr=game.trackedTask(),key=list.map(x=>x.target+x.title+(x.done?'!':Math.round(game.taskProgress(x)*20))+(x===tr?'*':'')).join('|');ckSet('tasks',key,()=>{const el=$('taskTracker');el._list=list;el.hidden=!list.length;el.replaceChildren(...list.map(x=>{const row=document.createElement('button');row.type='button';row.className='task-row'+(x.done?' ready':'')+(x===tr?' tracked':'');const a=document.createElement('b');a.textContent=x.title;const b=document.createElement('small');b.textContent=(x.done?'Return to '+x.hermit:taskProgressText(x))+' · '+taskWhere(x);row.append(a,b);row.addEventListener('click',()=>{game.trackTask(x.target);ckLast.tasks=null;updateUI(true);});return row;}));});
    const el=$('taskTracker');[...el.children].forEach((row,i)=>{const x=list[i],sm=row.lastChild;if(!x||!sm)return;const t=(x.done?'Return to '+x.hermit:taskProgressText(x))+' · '+taskWhere(x);if(sm.textContent!==t)sm.textContent=t;});}
   const status=p.exhausted?'Exhausted':p.stealth>.66?'Concealed':p.sneaking?'Sneaking':p.sprinting?'Fast swim':'';
   ckSet('status',status,v=>{const el=$('ckStatus');el.textContent=v;el.hidden=!v;el.dataset.kind=p.exhausted?'warn':'';});
 }
 // The minimap is a navigation map, north up and centred on you, about six water levels across. It shows the water you
 // have explored, a line at every water-level boundary (they are circles round the nursery, so they show which way is
 // shallower), places you know, your lead, the boss and friends. Ordinary creatures are left to the screen.
 // The explored water is drawn onto one reused layer only when it changes or you have moved well across it; each frame
 // just copies that layer and draws a few lines and markers, so it can redraw every frame and move smoothly.
 let miniMapAt=0,mapTarget=null,mmLayer=null,mmKey='',mmAx=0,mmAy=0,mmPools=null,mmList=null,mmRegions=[],mmDrawn=0;
 const MM_RANGE=4800;
 function mmPool(co){const s=makeCanvasUI(64,64),c=s.getContext('2d'),g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,`rgba(${co},.55)`);g.addColorStop(.55,`rgba(${co},.32)`);g.addColorStop(1,`rgba(${co},0)`);c.fillStyle=g;c.fillRect(0,0,64,64);return s;}
 function makeCanvasUI(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
 function drawMiniMap(){
   miniMapAt=performance.now();if(!game||mode!=='playing')return;const cv=$('miniMap');const W=cv._w||0;if(!W||cv._check!==innerWidth+'x'+innerHeight+'|'+document.body.dataset.input+'|'+devicePixelRatio){const box=cv.getBoundingClientRect();if(box.width<10)return;const dpr=Math.min(devicePixelRatio||1,2);cv._w=Math.round(box.width*dpr);cv._dpr=dpr;cv._check=innerWidth+'x'+innerHeight+'|'+document.body.dataset.input+'|'+devicePixelRatio;cv.width=cv.height=cv._w;mmKey='';return drawMiniMap();}
   const dpr=cv._dpr,c=cv.getContext('2d'),s=game.state,p=s.player,R=W/2,k=R/MM_RANGE,C=MorphosGame.CHUNK||960;
   const explored=s.explored||[];
   if(!mmPools)mmPools=['46,108,92','112,104,62','86,64,122'].map(mmPool);
   // explored regions are read once each (the list only grows during a life); a new region is added to the layer on its own,
   // and the whole layer is redrawn only when you have moved well across it or the screen size changed
   if(mmList!==explored||explored.length<mmRegions.length){mmList=explored;mmRegions=[];mmKey='';}
   for(let i=mmRegions.length;i<explored.length;i++){const [cx,cy]=explored[i].split(',').map(Number);mmRegions.push([(cx+.5)*C,(cy+.5)*C,game.mapRegion(explored[i]).biome]);}
   const size=C*k*2.1,reach=MM_RANGE*2+C,paint=(L,from)=>{for(let i=from;i<mmRegions.length;i++){const q=mmRegions[i];if(Math.abs(q[0]-mmAx)>reach||Math.abs(q[1]-mmAy)>reach)continue;L.drawImage(mmPools[q[2]]||mmPools[0],W+(q[0]-mmAx)*k-size/2,W+(q[1]-mmAy)*k-size/2,size,size);}mmDrawn=mmRegions.length;};
   if(!mmLayer||mmKey!==String(W)||Math.abs(p.x-mmAx)>MM_RANGE*.9||Math.abs(p.y-mmAy)>MM_RANGE*.9){
     if(!mmLayer||mmLayer.width!==W*2)mmLayer=makeCanvasUI(W*2,W*2);
     mmKey=String(W);mmAx=p.x;mmAy=p.y;const L=mmLayer.getContext('2d');L.clearRect(0,0,W*2,W*2);paint(L,0);
   }else if(mmDrawn<mmRegions.length)paint(mmLayer.getContext('2d'),mmDrawn);
   c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,W,W);c.save();c.beginPath();c.arc(R,R,R-1,0,Math.PI*2);c.clip();c.fillStyle='#04171a';c.fillRect(0,0,W,W);
   c.drawImage(mmLayer,R-W+(mmAx-p.x)*k,R-W+(mmAy-p.y)*k);
   // the nursery, and a line at each water-level boundary near you (the deepest boundary is brighter)
   const ox=R-p.x*k,oy=R-p.y*k,dist=Math.hypot(p.x,p.y),maxZone=MorphosGame.waterLevel(1e9,0);
   if(dist<1250+MM_RANGE*1.5){c.beginPath();c.arc(ox,oy,1250*k,0,Math.PI*2);c.fillStyle='rgba(214,237,162,.14)';c.fill();}
   c.lineWidth=dpr;for(let n=0;n<maxZone;n++){const rr=1250+n*850;if(Math.abs(rr-dist)>MM_RANGE*1.45)continue;c.beginPath();c.arc(ox,oy,rr*k,0,Math.PI*2);c.strokeStyle=n===maxZone-1?'rgba(240,140,122,.55)':'rgba(181,220,194,.2)';c.stroke();}
   const pos=(x,y)=>{let dx=(x-p.x)*k,dy=(y-p.y)*k;const d=Math.hypot(dx,dy),max=R-6*dpr;if(d>max){dx*=max/d;dy*=max/d;}return [R+dx,R+dy];};
   const near=(x,y)=>Math.abs(x-p.x)<MM_RANGE*1.2&&Math.abs(y-p.y)<MM_RANGE*1.2;
   for(const w of game.wonderRumours?game.wonderRumours():[]){if(!near(w.x,w.y))continue;const [x,y]=pos(w.x,w.y);c.beginPath();c.arc(x,y,Math.max(6*dpr,w.r*k),0,Math.PI*2);c.setLineDash([3*dpr,4*dpr]);c.strokeStyle='rgba(240,212,140,.45)';c.lineWidth=dpr;c.stroke();c.setLineDash([]);c.fillStyle='rgba(240,212,140,.85)';c.font=`700 ${10*dpr}px sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText('?',x,y);}
   for(const l of game.wonderFound?game.wonderFound():[]){if(!near(l.x,l.y))continue;const [x,y]=pos(l.x,l.y);c.save();c.translate(x,y);c.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=(i%2?2.4:5.6)*dpr;c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.closePath();c.fillStyle=l.claimed?'rgba(240,212,140,.55)':'#f0d48c';c.fill();c.restore();}
   for(const l of s.discoveredLandmarks||[]){if(!near(l.x,l.y))continue;const [x,y]=pos(l.x,l.y);if(l.type.startsWith('wonder'))continue;if(l.type==='sanctuary'){c.beginPath();c.arc(x,y,3.4*dpr,0,Math.PI*2);c.strokeStyle='#8fe2b8';c.lineWidth=1.4*dpr;c.stroke();}else{c.beginPath();c.arc(x,y,1.8*dpr,0,Math.PI*2);c.fillStyle=l.claimed?'rgba(158,196,185,.45)':'#9ec4b9';c.fill();}}
   const save=checkpoint?.game?.state?.player;if(save&&Number.isFinite(save.x)&&!coop){const [x,y]=pos(save.x,save.y);{c.save();c.translate(x,y);c.strokeStyle='#eef3e6';c.fillStyle='#eef3e6';c.lineWidth=1.4*dpr;c.beginPath();c.moveTo(-2.5*dpr,4.5*dpr);c.lineTo(-2.5*dpr,-4.5*dpr);c.stroke();c.beginPath();c.moveTo(-2.5*dpr,-4.5*dpr);c.lineTo(4*dpr,-2*dpr);c.lineTo(-2.5*dpr,-.5*dpr);c.closePath();c.fill();c.restore();}}
   for(const q of game.coopPeers?game.coopPeers():[]){if(!q||!Number.isFinite(q.x))continue;const [x,y]=pos(q.x,q.y);mapArrow(c,x,y,q.angle,4.2*dpr,'#84d9e8');}
   {const tr=game.trackedTask&&game.trackedTask();for(const tk of s.tasks||[]){const pt=MorphosGame.taskPoint(tk);if(!pt||!Number.isFinite(pt.x))continue;const big=tk===tr,sz=(big?5.2:3.4)*dpr,dx=(pt.x-p.x)*k,dy=(pt.y-p.y)*k,dd=Math.hypot(dx,dy),edge=R-9*dpr;
     if(big&&dd>edge){const a=Math.atan2(dy,dx);c.save();c.translate(R+Math.cos(a)*edge,R+Math.sin(a)*edge);c.rotate(a);c.beginPath();c.moveTo(7*dpr,0);c.lineTo(-5*dpr,-6*dpr);c.lineTo(-2*dpr,0);c.lineTo(-5*dpr,6*dpr);c.closePath();c.fillStyle='#f0d48c';c.fill();c.restore();continue;}
     const [x,y]=pos(pt.x,pt.y);c.save();c.translate(x,y);if(big){c.beginPath();c.arc(0,0,sz*1.9+Math.sin(performance.now()/260)*1.5*dpr,0,Math.PI*2);c.strokeStyle='rgba(240,212,140,.7)';c.lineWidth=1.4*dpr;c.stroke();}if(pt.home||tk.done)mapTick(c,sz*1.25,(big?2.2:1.8)*dpr);else{c.rotate(Math.PI/4);c.fillStyle='#f0d48c';c.fillRect(-sz,-sz,sz*2,sz*2);}c.restore();}}
   
   const boss=s.bossEncounter;if(boss){const [x,y]=pos(boss.x,boss.y);c.beginPath();c.arc(x,y,4.5*dpr,0,Math.PI*2);c.fillStyle='#ef7d72';c.fill();}
   c.restore();
   c.save();c.translate(R,R);c.rotate((p.angle||0)+Math.PI/2);c.beginPath();c.moveTo(0,-6*dpr);c.lineTo(4.6*dpr,5*dpr);c.lineTo(0,2.6*dpr);c.lineTo(-4.6*dpr,5*dpr);c.closePath();c.fillStyle='#d6eda2';c.fill();c.strokeStyle='#04171a';c.lineWidth=dpr;c.stroke();c.restore();
 }
 // Interface writes that change nothing are skipped: rewriting the same text or attribute still costs style and layout work.
 function setT(el,v){v=String(v);if(el&&el.textContent!==v)el.textContent=v;}
 function setA(el,n,v){v=String(v);if(el&&el.getAttribute(n)!==v)el.setAttribute(n,v);}
 function setP(el,n,v){if(el&&el[n]!==v)el[n]=v;}
 function updateUI(force=false){
   if(!game)return;const s=game.state,p=s.player;
   {const healing=p.feedingRecovery>0;$('vitals').classList.toggle('healing',healing);if($('healthLabel').dataset.healing!==String(healing)){$('healthLabel').dataset.healing=String(healing);$('healthLabel').innerHTML=healing?'Membrane<span class="heal-tag"> · healing</span>':'Membrane';}}setT($('healthText'),Math.ceil(p.hp)+'/'+Math.ceil(p.maxHp));$('healthFill').style.width=clamp(p.hp/p.maxHp*100,0,100)+'%';setA($('healthBar'),'aria-valuenow',String(Math.round(p.hp/p.maxHp*100)));$('vitals').classList.toggle('low',p.hp/p.maxHp<.3);
   setT($('energyLabel'),p.exhausted?'Recovering':'Stamina');$('energyBar').classList.toggle('exhausted',!!p.exhausted);setT($('staminaState'),p.exhausted?'EXHAUSTED · REFILL TO UNLOCK':p.sprinting?'FAST SWIM · RELEASE TO FEED':'');$('staminaState').classList.toggle('exhausted',!!p.exhausted);
   setT($('energyText'),String(Math.floor(p.energy)));$('energyFill').style.width=clamp(p.energy/p.maxEnergy*100,0,100)+'%';setA($('energyBar'),'aria-valuenow',String(Math.round(p.energy/p.maxEnergy*100)));
   const nutrition=Number.isFinite(p.nutrition)?p.nutrition:100;setT($('nutritionText'),Math.round(nutrition)+'%');$('nutritionFill').style.width=clamp(nutrition,0,100)+'%';setA($('nutritionBar'),'aria-valuenow',String(Math.round(nutrition)));$('nutritionBar').classList.toggle('low',nutrition<22);
   setT($('stealthStatus'),p.stealth>.66?'CONCEALED':p.sneaking?'MOVING QUIETLY':'');updateCockpit(p,nutrition);
   setT($('cellCount'),p.cellCountText||p.cellCount);setT($('cellPlural'),p.cellCount===1?'cell':'cells');
   const grown=Math.max(0,s.biomass-s.divisionFrom),growthNeeded=Math.max(1,s.nextDivision-s.divisionFrom),growth=100*grown/growthNeeded;$('divisionFill').style.width=clamp(growth,0,100)+'%';{const gem=$('vitalGem'),pct=String(Math.round(clamp(growth,0,100)));if(gem.dataset.pct!==pct){gem.dataset.pct=pct;gem.style.setProperty('--pct',pct);$('ckGem').style.setProperty('--pct',pct);}}
   const gate=typeof game.growthGate==='function'?game.growthGate():null;
   setT($('divisionLabel'),gate?.blocked?(s.biomass>=s.nextDivision?'Growth banked · Elder genome required':Math.floor(grown)+' / '+Math.round(growthNeeded)+' growth · Genome required'):('Next division: '+Math.floor(grown).toLocaleString('en-GB')+' / '+Math.round(growthNeeded).toLocaleString('en-GB')+' growth'));$('divisionFill').classList.toggle('gated',!!gate?.blocked);
   for(const step of $('journeySteps').children){const key=step.dataset.elder,def=MorphosGame.BOSSES[key],done=p.genomes.includes(key),awake=p.stage+1>=def.level;step.classList.toggle('defeated',done);step.classList.toggle('awake',!done&&awake);step.querySelector('i').textContent=done?'✓':({gulper:'◍',brood:'◌',pike:'◇',hydra:'⋔',undertow:'≋',kraken:'✺'})[key];setP(step,'title',def.name+': '+(done?'genome acquired':awake?'hunting':'wakes at level '+def.level));setA(step,'aria-label',step.title);}
   setT($('score'),Math.floor(s.score).toString().padStart(5,'0'));setT($('habitat'),s.biomeName);setT($('clock'),clock(s.time));
   const evidence=p.evidence,costOf=f=>game.rankCost(f),share=f=>(evidence[f]||0)/costOf(f),ranked=families.slice().sort((a,b)=>share(b)-share(a)),leading=(evidence[ranked[0]]||0)>0?ranked[0]:'',readyForks=families.filter(f=>game.forkReady(f));
   for(const row of document.querySelectorAll('[data-trait]')){const t=row.dataset.trait;row.querySelector('.bar i').style.width=clamp(share(t)*100,0,100)+'%';row.classList.toggle('ready',readyForks.includes(t));{const rank=Math.min(5,p.traits[t]||0),pips=row.querySelector('.trait-rank'),sig=rank+(p.mastery?.[t]?'m':'');if(pips.dataset.sig!==sig){pips.dataset.sig=sig;pips.textContent='';setA(pips,'aria-label',familyNames[t]+' rank '+rank+(p.mastery?.[t]?' plus mastery':''));for(let i=0;i<5;i++){const d=document.createElement('i');if(i<rank)d.className='on';pips.append(d);}}}row.classList.toggle('leading',leading===t);setP(row,'title',familyDescriptions[t]+' Experience '+Math.floor(evidence[t]||0)+' of '+costOf(t)+(readyForks.includes(t)?'. Ready to fork: choose on the Lineage tab.':'.'));}
   setT($('traitForecast'),(readyForks.length?'Your '+readyForks.map(k=>familyNames[k].toLowerCase()).join(' and ')+' '+(readyForks.length>1?'lines are':'line is')+' ready to fork. Choose on the Lineage tab. ':'')+'Each class levels on its own. Higher ranks in a class need more experience.');
   setT($('nextAdaptation'),readyForks.length?'Choose your path':leading?familyNames[leading]+' '+Math.min(99,Math.floor(share(leading)*100))+'%':'Your habits shape your body');setP($('nextAdaptation'),'title',leading?familyDescriptions[leading]+' Experience towards its next rank. See every class on the body screen.':'Use your abilities to train their classes. See every class on the body screen.');
   const pulseCost=p.pulseCost||18,pulseLow=!p.exhausted&&p.energy<pulseCost;
   setT($('pulseCost'),p.exhausted?'Recovering':pulseLow?'Need stamina':Math.round(pulseCost)+' stamina');
   const who=identityText(p);if($('identityLine').textContent!==who)setT($('identityLine'),who);updateWater();
   if(p.strike!==shownStrike){shownStrike=p.strike;const def=MorphosGame.STRIKES[p.strike]||MorphosGame.STRIKES.pulse;setT($('pulseName'),def.name);$('pulseButton').querySelector('.ability-glyph').innerHTML=strikeGlyphs[p.strike]||strikeGlyphs.pulse;setP($('pulseButton'),'title',def.name+'. '+def.description);}
   setControlState($('pulseButton'),{ready:Math.min(1-clamp(p.pulseCooldown/(p.pulseCooldownMax||.68),0,1),staminaReadiness(p,pulseCost)),remaining:p.pulseCooldown,exhausted:!!p.exhausted,lowStamina:pulseLow});
   setA($('pulseButton'),'aria-label',(MorphosGame.STRIKES[p.strike]||MorphosGame.STRIKES.pulse).name+', left click, '+(p.exhausted?'recovering until stamina is full':(p.pulseCooldown>0?'cooldown '+p.pulseCooldown.toFixed(1)+' seconds, ':'')+(pulseLow?'needs more stamina':Math.round(pulseCost)+' stamina')));
   setT($('blockCost'),p.exhausted?'Recovering':p.parryTime>0?'Blocking':p.energy<p.blockCost?'Need stamina':p.blockCooldown>0?'Cooling down':p.blockCost+' stamina');
   setControlState($('blockButton'),{ready:Math.min(1-clamp(p.blockCooldown/p.blockCooldownMax,0,1),staminaReadiness(p,p.blockCost)),remaining:p.blockCooldown,active:p.parryTime>0,exhausted:!!p.exhausted,lowStamina:p.energy<p.blockCost});
   setA($('blockButton'),'aria-label','Block, C, hardens your whole body for '+Math.round(p.parryWindow*1000)+' milliseconds, '+(p.blockCooldown>0?p.blockCooldown.toFixed(1)+' seconds remaining':p.blockCost+' stamina'));
   setT($('dashCost'),p.exhausted?'Refill to unlock':p.sprinting?Math.round(p.sprintDrain||25)+' stamina/s':'Hold');
   setControlState($('dashButton'),{ready:p.energy/p.maxEnergy,active:!!p.sprinting,exhausted:!!p.exhausted,lowStamina:p.energy<=0});
   setA($('dashButton'),'aria-pressed',String(!!p.sprinting));setA($('dashButton'),'aria-label','Fast swim, hold right mouse, '+(p.exhausted?'recovering until stamina is full':p.sprinting?'swimming fast':'ready')+', '+Math.floor(p.energy)+' of '+Math.round(p.maxEnergy)+' stamina');
   const concealLock=p.concealCooldown||0,sneakLow=!p.exhausted&&p.energy<=(p.sneaking ? .01 : 2),sneakState=p.exhausted?'Recovering':concealLock>0?'Revealed':p.sprinting?'Release fast swim':sneakLow?'Need stamina':p.stealth>.65?'Concealed':p.sneaking?'Moving quietly':(keyLabel('sneak')?'Hold or tap':'Hold or tap to sneak');
   setControlState($('sneakButton'),{ready:p.exhausted?p.energy/p.maxEnergy:concealLock>0?0:p.sneaking?p.stealth:staminaReadiness(p,2),remaining:concealLock,active:!!p.sneaking,exhausted:!!p.exhausted,lowStamina:sneakLow||!!p.sprinting});
   setA($('sneakButton'),'aria-pressed',String(sneakToggle||!!sneakPress));setA($('sneakButton'),'aria-label','Sneak, hold '+(keyLabel('sneak')||'the sneak key')+' or tap to toggle, '+sneakState.toLowerCase());setT($('sneakState'),sneakState);
   updateAbilities();
   const points=p.skillPoints||0,newMutations=(p.unlockedMutations||[]).filter(k=>!seenMutations.has(k));setT($('pointBadge'),game.state.pendingChoice?'!':points?String(points):newMutations.length?'•':'');$('skillsTool').classList.toggle('available',points>0);$('skillsTool').classList.toggle('has-discovery',newMutations.length>0);$('buildMutationsTab').classList.toggle('has-discovery',newMutations.length>0);$('buildStatsTab').classList.toggle('has-discovery',points>0);$('buildEvolutionTab').classList.toggle('has-discovery',(growthUnseen&&buildTab!=='evolution')||!!game.state.pendingChoice);$('skillPoints').parentElement.classList.toggle('has-points',points>0);$('skillsTool').classList.toggle('choice-waiting',!!game.state.pendingChoice);$('nextAdaptation').classList.toggle('urgent',!!game.state.pendingChoice);setA($('buildMutationsTab'),'aria-label','Mutations'+(newMutations.length?', '+newMutations.length+' new unlocks to inspect':''));setA($('skillsTool'),'aria-label','Body and mutations'+(points?', '+points+' stat '+(points===1?'point':'points')+' available':'')+(newMutations.length?', new mutations to view':''));
   const equipped=p.mutations||[];setT($('mutationLoadout'),equipped.length?equipped.map(k=>MorphosGame.MUTATIONS?.[k]?.name||k).join(' · '):p.mutationSlots?'No mutation equipped':'First mutation slot at '+(mutationSlotStages[0]+1)+' cells');
   updateJourney();
   if(force||uiTimer<.2){setT($('objective'),s.bossEncounter?'Read the attack. Find your opening.':$('journeyTitle').textContent);setT($('objectiveDetail'),p.exhausted?'Keep moving while stamina fully recharges.':points?points+' stat '+(points===1?'point':'points')+' available'+(bindings.body?' · '+keyLabel('body'):''):s.bossEncounter?'Aim and tap '+(keyLabel('block')||'Block')+' just before impact to block.':p.genomes.length+' / '+Object.keys(MorphosGame.BOSSES).length+' apex genomes · Keep your lineage growing.');}
   updateExpedition();updateBossHUD();updateCheckpointIndicator();tryGrowthCheckpoint();
 }
 function updateJourney(){
   const s=game.state,p=s.player,next=typeof game.nextBoss==='function'?game.nextBoss():null,total=Object.keys(MorphosGame.BOSSES).length,hunt=s.bossEncounter;
   $('journeyTitle').textContent=s.journeyComplete?'The apex of the pond':hunt?hunt.name+' is hunting you':p.stage===0?'Find your first adaptation':next?'Grow towards level '+next.level:'';
   $('journeyDetail').textContent=s.journeyComplete?'All '+total+' genomes are yours. Explore further, deepen your classes, or begin a different lineage.':hunt?'Fight it, or get far enough away and it loses your scent. It comes back after a couple of minutes, rested. Defeat it to grow past level '+BOSSES_LEVEL(hunt.type)+'.':p.stage===0?'Feed to grow. Fight your way: every action trains the class it belongs to.':next?next.name+' wakes and comes for you at level '+next.level+'.':'';
   if(!s.journeyComplete&&p.stage>0)$('journeyDetail').textContent+=' Deepest water: level '+(s.stats.deepest||1)+'.';
 }
 function BOSSES_LEVEL(type){return MorphosGame.BOSSES[type]?.level||0;}

 function renderTaskLog(){const el=$('taskLog'),list=game.state.tasks||[];el.hidden=!list.length;
   // Rebuilt only when what it shows changes, so a focused or hovered Track button is not replaced under the pointer.
   {const sig=list.map(x=>[x.target,x.title,x.done,taskProgressText(x),taskWhere(x),x.reward,game.state.trackedTask===x.target].join('~')).join('|');if(el._sig===sig)return;el._sig=sig;}
   el.replaceChildren(...list.map(x=>{const row=document.createElement('div');row.className='task-log-row';const txt=document.createElement('span');txt.innerHTML='';const b=document.createElement('b');b.textContent=x.title;const sm=document.createElement('small');sm.textContent=(x.done?'Done · return to ':taskProgressText(x)+' · from ')+x.hermit+' · '+taskWhere(x)+' · '+x.reward+' mutation';txt.append(b,sm);if(x.story){const st=document.createElement('small');st.className='task-story';st.textContent='“'+x.story+'”';txt.append(st);}const track=document.createElement('button');track.type='button';track.className='btn subtle';track.textContent=game.trackedTask()===x?'Tracked':'Track';track.disabled=game.trackedTask()===x;track.addEventListener('click',()=>{game.trackTask(x.target);ckLast.tasks=null;renderTaskLog();drawPondMap();});row.append(txt,track);const drop=document.createElement('button');drop.type='button';drop.className='btn subtle';drop.textContent='Drop';drop.addEventListener('click',()=>{game.dropTask(x.target);ckLast.tasks=null;renderTaskLog();updateUI(true);});row.append(drop);return row;}));}
 function openMap(){mapView.x=mapView.y=0;if(activeDialog==='skillsDialog'){selectBuildTab('map');return;}showSkills('map');}
 function updateExpedition(){
   renderTaskLog();
   const s=game.state,p=s.player,o=s.objective;if(activeDialog==='skillsDialog'&&buildTab==='map')requestAnimationFrame(drawPondMap);
   updateResearchReadout();
   const range=2200+(p.attributes?.reach||0)*150,gate=typeof game.growthGate==='function'?game.growthGate():null,candidate=typeof game.nextBoss==='function'?game.nextBoss():null,elder=s.bossEncounter?{...s.bossEncounter,discovered:true}:null;
   const landmarks=(s.landmarks||[]).filter(l=>!l.claimed&&l.type!=='sanctum'&&Math.hypot(l.x-p.x,l.y-p.y)<range).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
   const refuges=new Map((s.discoveredLandmarks||[]).filter(l=>l.type==='sanctuary').map(l=>[l.id,{...l,discovered:true,r:150}]));for(const l of s.landmarks)if(l.type==='sanctuary'&&(l.discovered||Math.hypot(l.x-p.x,l.y-p.y)<range))refuges.set(l.id,l);
   const sanctuary=[...refuges.values()].sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0],trackRefuge=compassMode==='sanctuary';
   const track=!!elder&&(compassMode==='elder'||(compassMode==='auto'&&gate?.blocked)),lead=!trackRefuge&&!track&&s.lead?{...s.lead,lead:true}:null,myWater=MorphosGame.waterLevel(p.x,p.y),rad=Math.hypot(p.x,p.y),wantRad=1250+MorphosGame.ZONE_STEP*(p.stage-.5),out=rad>1?[p.x/rad,p.y/rad]:[Math.cos(p.angle||0),Math.sin(p.angle||0)],depthGuide=!trackRefuge&&!track&&p.stage>=2&&myWater<=p.stage-2?{x:out[0]*wantRad,y:out[1]*wantRad,r:300,discovered:true,depthGuide:true,name:'Deeper water'}:null,taskNear=(()=>{const x=game.trackedTask();if(!x)return null;const pt=MorphosGame.taskPoint(x);return{x:pt.x,y:pt.y,task:x};})(),bountyTarget=taskNear?{x:taskNear.x,y:taskNear.y,r:260,discovered:true,bounty:true,name:taskNear.task.title,task:taskNear.task}:null,target=trackRefuge?sanctuary:track?elder:depthGuide||lead||bountyTarget||landmarks[0];mapTarget=target||null;
   $('compassToggle').hidden=!elder;setT($('compassToggle'),track?'Track nearby discoveries':'Track the hunter');setA($('compassToggle'),'aria-pressed',String(track));$('compassToggle').dataset.track=String(track);
   setT($('sanctuaryTrack'),trackRefuge?'Track nearby discoveries':'Track sanctuary');setA($('sanctuaryTrack'),'aria-pressed',String(trackRefuge));
   if(target){const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);$('compassArrow').style.setProperty('--bearing',Math.atan2(dx,-dy)*180/Math.PI+'deg');$('compassArrow').hidden=false;setT($('landmarkName'),target.lead?(target.rare?'A rare signal':'An unexplored signal'):track?target.name:target.discovered?target.name:trackRefuge?'Sanctuary signal':'An unfamiliar signal');setT($('landmarkHint'),d<(target.r||250)+90?'You are here':d<550?'Close by':d<1200?'Further ahead':'In the distance');setT($('landmarkProgress'),target.lead?'Your field study traced this. Swim to it to find out what it is.':track?'It is hunting you. Fight it, or get far enough away to lose it for a while.':!target.discovered&&!trackRefuge?'Investigate to find out what it is.':target.type==='sanctuary'?'Recover fully, then settle here for a moment to set a checkpoint.':target.active&&target.goal&&(target.type==='carcass'||target.type==='garden'||target.type==='smoker')?Math.round((target.progress||0)*100)+'% eaten':target.active&&target.goal?Math.floor(target.progress||0)+' / '+target.goal+' investigated':target.discovered?({bloom:'Rest among the feeding fronds.',geneCache:'Remain close to investigate the cache.',nest:'A mother and her young live here. Defeat all three.',vault:'Its warden must fall before it will open. Then wait at its centre.',smoker:'Feed on the minerals at its mouth, between the vents.',current:'Ride the current through the pond.',carcass:'Feed on the remains before the scavengers arrive.',garden:'Time the toxin pulses to reach the rich algae.',fossil:'Rest at its centre to draw out its ancient genome.',shell:'Shelter inside. Predators cannot see you here.'}[target.type]||'Investigate to reveal its rewards.'):'Follow the arrow to discover what is there.');}
   if(target&&target.bounty){setT($('landmarkName'),target.task.done?'Return to '+target.task.hermit:target.task.title);setT($('landmarkProgress'),'');}
   if(target&&target.depthGuide){setT($('landmarkName'),'Deeper water · level '+(p.stage+1));setT($('landmarkHint'),'Swim outward');setT($('landmarkProgress'),'This water is level '+(myWater+1)+', below your level '+(p.stage+1)+'. Water made for a colony your size lies further out, where food and prey are worth far more.');}
   else if(!target){$('compassArrow').hidden=true;setT($('landmarkName'),trackRefuge?'Seek sheltered water':'The pond continues');setT($('landmarkHint'),trackRefuge?'No sanctuary signal nearby.':'Explore in any direction.');setT($('landmarkProgress'),trackRefuge?'Explore further to find a refuge. Your existing checkpoint is kept.':'New places wait beyond the familiar.');}
   $('genomeStatus').hidden=!elder&&!gate?.blocked;
   if(elder){const dx=elder.x-p.x,dy=elder.y-p.y;$('elderArrow').style.setProperty('--bearing',Math.atan2(dx,-dy)*180/Math.PI+'deg');setT($('genomeStatusText'),gate?.blocked?(innerWidth<=600?'Genome '+gate.owned+'/'+gate.required:'Genome required · '+gate.owned+'/'+gate.required):'Hunted · '+elder.name);setP($('genomeStatus'),'title','Track '+elder.name+'. '+(gate?.blocked?'Growth is waiting for its genome.':'It is hunting you.'));}
   else if(gate?.blocked)setT($('genomeStatusText'),innerWidth<=600?'Genome '+gate.owned+'/'+gate.required:'Genome required · '+gate.owned+'/'+gate.required);
   $('genomeStatus').classList.toggle('blocked',!!gate?.blocked);$('vitalGem').classList.toggle('gated',!!gate?.blocked);
   setT($('quickNavMode'),trackRefuge?'REFUGE':track?'HUNTED':target&&target.bounty?'TASK':target&&target.lead?'STUDY LEAD':'EXPLORE');setT($('quickNavName'),String($('landmarkName').textContent).replace(/^Deeper water · level /,'Deeper · ').replace(/^Shallower water · level /,'Shallower · '));setT($('quickNavHint'),$('landmarkHint').textContent);$('quickNavArrow').hidden=$('compassArrow').hidden;$('quickNavArrow').style.setProperty('--bearing',$('compassArrow').style.getPropertyValue('--bearing'));
   setA($('quickNavigation'),'aria-label','Navigation: '+$('landmarkName').textContent+'. Choose your course.');setA($('navExplore'),'aria-pressed',String(!trackRefuge&&!track));setA($('navSanctuary'),'aria-pressed',String(trackRefuge));setA($('navElder'),'aria-pressed',String(track));$('navElder').disabled=!elder;setP($('navElder'),'title',elder?'Track '+elder.name:candidate?candidate.name+' comes for you at level '+candidate.level:'Every apex genome acquired');
   const encounter=s.bossEncounter,nearEdge=false;$('quickNavigation').classList.toggle('edge-warning',nearEdge);
   if(nearEdge){setT($('quickNavMode'),'ENCOUNTER EDGE');setT($('quickNavName'),'Return to centre');setT($('quickNavHint'),'Leave ring = fight resets');$('quickNavArrow').hidden=false;$('quickNavArrow').style.setProperty('--bearing',Math.atan2(encounter.homeX-p.x,p.y-encounter.homeY)*180/Math.PI+'deg');setA($('quickNavigation'),'aria-label','Encounter edge. Crossing the outer ring retreats and resets the fight. The arrow points back to the centre. Open navigation.');}
 }
 // The pond map: explored regions tinted by biome, places found, the checkpoint, you and anything hunting you.
 // Map symbols: a task to do is a solid gold diamond; a task done (go back to the hermit) is a gold tick; players are arrows.
 function mapTick(c,sz,lw){c.beginPath();c.moveTo(-sz,0);c.lineTo(-sz*.3,sz*.7);c.lineTo(sz,-sz*.75);c.lineCap='round';c.lineJoin='round';c.strokeStyle='rgba(8,20,18,.85)';c.lineWidth=lw+2.4*(sz/5);c.stroke();c.strokeStyle='#f0d48c';c.lineWidth=lw;c.stroke();}
 function mapArrow(c,x,y,a,s,fill){c.save();c.translate(x,y);c.rotate((a||0)+Math.PI/2);c.beginPath();c.moveTo(0,-s);c.lineTo(s*.75,s*.75);c.lineTo(0,s*.38);c.lineTo(-s*.75,s*.75);c.closePath();c.fillStyle=fill;c.fill();c.restore();}
 const mapView={zoom:1,x:0,y:0};
 // The full map's explored water: each region's water type is worked out once, and the water is painted onto one stored
 // layer that is repainted only when the view (size, zoom, pan) or the number of regions changes.
 let pondRegionSeed='',pondRegionMemo=new Map(),pondLayer=null,pondLayerKey='';
 function pondRegions(list){const seed=game.state.seed;if(pondRegionSeed!==seed){pondRegionSeed=seed;pondRegionMemo=new Map();pondLayerKey='';}const out=new Array(list.length);for(let i=0;i<list.length;i++){const key=list[i];let r=pondRegionMemo.get(key);if(!r){r=game.mapRegion(key);pondRegionMemo.set(key,r);}out[i]=r;}return out;}
 function drawPondMap(){
   const cv=$('pondMap');if(!cv||!game)return;const box=cv.getBoundingClientRect();if(box.width<10)return;const dpr=Math.min(devicePixelRatio||1,2),W=Math.round(box.width*dpr),H=Math.round(box.height*dpr);if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}
   const c=cv.getContext('2d'),s=game.state,p=s.player,C=MorphosGame.CHUNK||960,regions=pondRegions(s.explored||[]);c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,W,H);
   const save=checkpoint?.game?.state?.player,boss=s.bossEncounter,places=s.discoveredLandmarks||[];
   // Fit everything you know about, centred on you, with at least a few regions of room.
   let span=C*2.5;for(const q of regions)span=Math.max(span,Math.abs((q.cx+.5)*C-p.x)+C*.7,Math.abs((q.cy+.5)*C-p.y)*W/H+C*.7);if(save)span=Math.max(span,Math.abs(save.x-p.x)+C*.4,Math.abs(save.y-p.y)*W/H+C*.4);
   mapView.span=span;const k=W/2/span*mapView.zoom,ox=p.x+mapView.x,oy=p.y+mapView.y,X=x=>W/2+(x-ox)*k,Y=y=>H/2+(y-oy)*k,tint=[[46,108,92],[112,104,62],[86,64,122]];
   // Each region is a soft pool of light, so explored water reads as one organic shape rather than a grid.
   const R=C*k*.95;if(!mmPools)mmPools=['46,108,92','112,104,62','86,64,122'].map(mmPool);
   {const key=[W,H,k.toFixed(7),ox.toFixed(1),oy.toFixed(1),regions.length].join('|');if(!pondLayer||pondLayer.width!==W||pondLayer.height!==H){pondLayer=makeCanvasUI(W,H);pondLayerKey='';}
    if(pondLayerKey!==key){pondLayerKey=key;const L=pondLayer.getContext('2d');L.setTransform(1,0,0,1,0,0);L.clearRect(0,0,W,H);for(const q of regions){const x=X((q.cx+.5)*C),y=Y((q.cy+.5)*C);if(x<-R||y<-R||x>W+R||y>H+R)continue;L.drawImage(mmPools[q.biome]||mmPools[0],x-R,y-R,R*2,R*2);}}
    c.drawImage(pondLayer,0,0);}
   const dot=(x,y,r,fill,stroke)=>{c.beginPath();c.arc(X(x),Y(y),r*dpr,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5*dpr;c.stroke();}};
   dot(0,0,3,'rgba(220,240,214,.35)');
   for(const w of game.wonderRumours?game.wonderRumours():[]){c.beginPath();c.arc(X(w.x),Y(w.y),Math.max(10*dpr,w.r*k),0,Math.PI*2);c.setLineDash([4*dpr,5*dpr]);c.strokeStyle='rgba(240,212,140,.5)';c.lineWidth=1.2*dpr;c.stroke();c.setLineDash([]);c.fillStyle='rgba(240,212,140,.9)';c.font=`700 ${13*dpr}px sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText('?',X(w.x),Y(w.y));c.textAlign='left';c.textBaseline='alphabetic';}
   for(const l of game.wonderFound?game.wonderFound():[]){c.save();c.translate(X(l.x),Y(l.y));c.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=(i%2?3:7)*dpr;c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.closePath();c.fillStyle=l.claimed?'rgba(240,212,140,.6)':'#f0d48c';c.fill();c.restore();}
   for(const l of places){if(l.type.startsWith('wonder'))continue;if(l.type==='sanctuary')dot(l.x,l.y,5,'rgba(143,226,184,.15)','#8fe2b8');else dot(l.x,l.y,2.6,l.claimed?'rgba(127,168,160,.45)':'#9ec4b9');}
   if(save){const x=X(save.x),y=Y(save.y);{c.save();c.translate(x,y);c.strokeStyle='#eef3e6';c.fillStyle='#eef3e6';c.lineWidth=1.4*dpr;c.beginPath();c.moveTo(-3.5*dpr,7*dpr);c.lineTo(-3.5*dpr,-7*dpr);c.stroke();c.beginPath();c.moveTo(-3.5*dpr,-7*dpr);c.lineTo(6*dpr,-3*dpr);c.lineTo(-3.5*dpr,-1*dpr);c.closePath();c.fill();c.restore();}}
   for(const tk of s.tasks||[]){const pt=MorphosGame.taskPoint(tk),px=pt.x,py=pt.y,big=tk===game.trackedTask();if(!Number.isFinite(px))continue;c.save();c.translate(clamp(X(px),8*dpr,W-8*dpr),clamp(Y(py),8*dpr,H-8*dpr));if(big){c.beginPath();c.arc(0,0,11*dpr,0,Math.PI*2);c.strokeStyle='rgba(240,212,140,.7)';c.lineWidth=1.6*dpr;c.stroke();}if(tk.done||pt.home)mapTick(c,6.5*dpr,2.4*dpr);else{c.rotate(Math.PI/4);c.fillStyle='#f0d48c';c.fillRect(-5*dpr,-5*dpr,10*dpr,10*dpr);}c.restore();}
   for(const q of game.coopPeers?game.coopPeers():[]){if(q&&Number.isFinite(q.x))mapArrow(c,clamp(X(q.x),8*dpr,W-8*dpr),clamp(Y(q.y),8*dpr,H-8*dpr),q.angle,7*dpr,'#84d9e8');}{const kf=$('keyFriend');if(kf)kf.hidden=!(game.coopPeers&&game.coopPeers().length);}
   if(boss){const bx=clamp(X(boss.x),8*dpr,W-8*dpr),by=clamp(Y(boss.y),8*dpr,H-8*dpr);c.beginPath();c.arc(bx,by,6*dpr,0,Math.PI*2);c.fillStyle='#ef7d72';c.fill();c.strokeStyle='rgba(239,125,114,.35)';c.lineWidth=5*dpr;c.stroke();}
   c.save();c.translate(X(p.x),Y(p.y));c.rotate((p.angle||0)+Math.PI/2);c.beginPath();c.moveTo(0,-8*dpr);c.lineTo(6*dpr,6*dpr);c.lineTo(0,3*dpr);c.lineTo(-6*dpr,6*dpr);c.closePath();c.fillStyle='#eaf7df';c.fill();c.restore();
   c.fillStyle='rgba(185,206,188,.6)';c.font=`${11*dpr}px ui-monospace,monospace`;c.fillText(regions.length+' REGIONS EXPLORED · '+(game.wonderFound?game.wonderFound().length:0)+' / '+(MorphosGame.WONDERS||[]).length+' WONDERS FOUND',10*dpr,H-10*dpr);
 }
 function updateBossHUD(){
   const boss=game.state.bossEncounter;if($('bossHUD').hidden!==!boss)playAreaDirty=true;$('bossHUD').hidden=!boss;document.body.dataset.boss=boss?'active':'';
   // Notices sit at the side, under the health bars, so they never cover the middle of the pond.
   if(!boss)return;
   const def=MorphosGame.BOSSES?.[boss.type]||{},p=game.state.player,roman=['I','II','III'][boss.phase-1]||'I',winding=boss.mode==='windup',open=boss.mode==='recover',feeding=(boss.healFlash||0)>0||boss.feeding,far=Math.hypot(boss.x-p.x,boss.y-p.y)>boss.r*4;
   $('bossName').textContent=boss.name||def.name;$('bossPhase').textContent='PHASE '+roman+' · '+(boss.mode==='transform'?'ENRAGED':feeding?'FEEDING':open?'OPEN':winding?'ATTACK COMING':far?'HUNTING YOU':(boss.phaseLabel||'').toUpperCase());
   $('bossHealthText').textContent=Math.max(0,Math.min(Math.round(boss.maxHp),Math.ceil(boss.hp)))+' / '+Math.round(boss.maxHp);$('bossHealthFill').style.width=clamp(boss.hp/Math.max(1,boss.maxHp)*100,0,100)+'%';$('bossHealthBar').setAttribute('aria-valuenow',String(Math.round(boss.hp/Math.max(1,boss.maxHp)*100)));
   const response={engulf:'It is about to lunge along the marked line. Swim sideways.',sweep:'Its arm sweeps the marked arc. Back off or get behind it.',birth:'She is giving birth. Kill her young before they surround you.',spores:'A spray of spores is coming. Swim around the cloud.',slam:'A short charge along the marked line. Sidestep.',dash:'A dash along the glowing line. Move off the line, not along it.',tendrils:'Stinging tendrils are coming. Get out of the cone.',vortex:'It is about to drag the water in. Swim away from its mouth.',charge:'A long charge along the marked line. Sidestep.',rings:'Rings of pressure are coming. Find the gap.'};
   $('bossShortHint').textContent=boss.mode==='transform'?'It is changing. Get ready.':feeding?'It is healing. Poison or bleeding slows that.':winding?'Get off the marked line.':open?'It is open. Strike now.':far?'It is coming for you.':'Keep moving. Strike after its attacks.';
   $('bossHUD').classList.toggle('winding',winding);$('bossHUD').classList.toggle('exposed',open);$('bossHUD').classList.toggle('feeding',feeding)
   $('bossHint').textContent=boss.mode==='transform'?'It is entering a new phase: '+(boss.phaseLabel||'')+'.':feeding?'It is eating to heal. Poison stops most of that and bleeding halves it. Kill or chase off its food.':winding?(response[boss.attackKind]||'An attack is coming. Watch the marked area.'):open?'It is recovering from its attack and takes extra damage. Strike now.':def.hint||'Keep moving and strike after its attacks.';
 }

 function setTabGroup(tabs,selected){
   for(const [key,[button,panel]] of Object.entries(tabs)){const active=key===selected;$(button).setAttribute('aria-selected',String(active));$(button).tabIndex=active?0:-1;$(panel).hidden=!active;}
 }
 function wireTabs(tabs,get,set){
   const names=Object.keys(tabs);
   for(const [name,[id]] of Object.entries(tabs)){
     $(id).addEventListener('click',()=>set(name));
     $(id).addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
       const index=names.indexOf(get()),next=e.key==='Home'?names[0]:e.key==='End'?names.at(-1):names[(index+(e.key==='ArrowRight'?1:-1)+names.length)%names.length];set(next);$(tabs[next][0]).focus({preventScroll:true});
     });
   }
 }
 function selectBuildTab(tab){
   buildTab=Object.hasOwn(buildTabs,tab)?tab:'stats';setTabGroup(buildTabs,buildTab);$('skillsDialog').dataset.tab=buildTab;if(buildTab==='map'&&game){updateExpedition();requestAnimationFrame(drawPondMap);}
   if(buildTab==='mutations'&&activeDialog==='skillsDialog')markMutationsSeen();if(buildTab==='evolution'&&activeDialog==='skillsDialog')growthUnseen=false;syncSpecimen();
 }
 function resetSpecimen(){selectedMutation=null;previewMode='current';previewReplacement=0;}
 function previewLoadout(p){
   if(buildTab!=='mutations'||previewMode!=='selected'||!MorphosGame.MUTATIONS[selectedMutation])return null;
   const equipped=[...(p.mutations||[])];
   if(equipped.includes(selectedMutation))return equipped.filter(key=>key!==selectedMutation);
   const part=MorphosGame.MUTATIONS[selectedMutation].part;return [...equipped.filter(key=>MorphosGame.MUTATIONS[key].part!==part),selectedMutation];
 }
 function syncSpecimen(){
   const p=game.state.player,current=p.mutations||[],def=MorphosGame.MUTATIONS[selectedMutation],loadout=previewLoadout(p),preview=loadout!==null,active=current.includes(selectedMutation);
   $('specimenIdentity').textContent=(p.cellCountText||p.cellCount)+' '+(p.cellCount===1?'CELL':'CELLS')+' · LEVEL '+p.colonyLevel;$('specimenKind').textContent=identityText(p)+' · '+(MorphosGame.STRIKES[p.strike]||MorphosGame.STRIKES.pulse).name;
   $('specimenStatus').textContent=preview?'PREVIEW':'';$('specimenStatus').classList.toggle('previewing',preview);
   $('specimenCaption').textContent=preview?(active?'Without ':'With ')+def.name.toLowerCase():current.length?current.map(key=>MorphosGame.MUTATIONS[key].name).join(' · '):'Your habits are shaping this body.';
   
   const replaced=preview&&!active&&current.find(key=>!loadout.includes(key));
   $('previewNote').hidden=buildTab!=='mutations'||!preview;$('previewNote').textContent=preview?'Previewing on your body':'';
   $('specimenCanvas').setAttribute('aria-label',(preview?'Organism preview: ':'Your organism: ')+(p.cellCountText||p.cellCount)+(p.cellCount===1?' cell':' cells')+(preview?', '+(active?'without ':'with ')+def.name:current.length?', '+current.map(key=>MorphosGame.MUTATIONS[key].name).join(', '):', no equipped mutations'));
   $('previewReplacementRow').hidden=true;
 }
 // When the colony divides while a preview is on screen, the preview morphs from the old body to the new one
 // over 1.8 s, the same morph the pond plays. Reopening a menu after growing in play starts from the current body.
 const specimenMorphs={};
 function specimenMorph(key,p){
   const now=performance.now(),snap={stage:p.stage||0,lv:(p.stage||0)+Object.values(p.traits||{}).reduce((n,v)=>n+v,0)+Object.values(p.mastery||{}).reduce((n,v)=>n+v,0),traits:{...(p.traits||{})},r:p.r,cellCount:p.cellCount||1,cellExponent:p.cellExponent},m=specimenMorphs[key]||(specimenMorphs[key]={});
   const fresh=!m.snap||now-m.at>250;m.at=now;
   if(fresh||snap.lv<m.snap.lv||reduced)m.from=null;
   else if(snap.lv>m.snap.lv){if(!m.from)m.from=m.snap;m.start=now;}
   m.snap=snap;if(!m.from)return null;
   const k=Math.min(1,(now-m.start)/1800);if(k>=1){m.from=null;return null;}return{k:k*k*(3-2*k),from:m.from};
 }
 function drawSpecimenView(){
   if(activeDialog!=='skillsDialog'||!$('skillsDialog').open)return;
   if(buildTab==='mutations'){drawAnatomyView();return;}
   const surface=$('specimenCanvas'),box=surface.parentElement.getBoundingClientRect();if(box.width<1||box.height<1)return;
   if(!specimenRenderer)specimenRenderer=new MorphosRenderer(surface,true);
   const dpr=Math.min(devicePixelRatio||1,2),size=[box.width,box.height,dpr].join(':');
   if(size!==specimenSize){specimenRenderer.resize(box.width,box.height,dpr);specimenSize=size;}
   const options={time:reduced?0:time,north:true,bare:true,morph:specimenMorph('rail',game.state.player)},loadout=previewLoadout(game.state.player);if(loadout!==null)options.previewMutations=loadout;
   specimenRenderer.drawSpecimen(game.state.player,options);
 }
 function markMutationsSeen(){
   const key=selectedMutation;if(buildTab!=='mutations'||activeDialog!=='skillsDialog'||!(game.state.player.unlockedMutations||[]).includes(key))return;
   if(!seenMutations.has(key)){seenMutations.add(key);const choice=$('mutationsPanel').querySelector('[data-mutation-choice="'+key+'"]');if(choice)choice.classList.remove('fresh');const part=MorphosGame.MUTATIONS[key].part,still=(game.state.player.unlockedMutations||[]).some(k=>MorphosGame.MUTATIONS[k].part===part&&!seenMutations.has(k));if(!still)$('mutationsGrid').querySelector('[data-part="'+part+'"]')?.classList.remove('fresh');}
   updateUI(true);
 }
 function attributeReadout(key,p){
   const n=x=>Number(x||0).toFixed(1).replace(/\.0$/,'');
   return ({
     vitality:[n(p.maxHp),'maximum health'],
     reserves:[n(p.maxEnergy),'maximum stamina'],
     recovery:[n(p.energyRegeneration),'stamina / s',n(p.regeneration)+' base · +'+n(p.maxHp*.015)+' health / s after food'],
     power:[n(p.attack*(p.strikeDamage||1)),'strike damage'],
     reach:[Math.round((1+(p.attributes?.reach||0)*.1)*100)+'%','shot and dash range',Math.round((p.feedRadius||28)/(p.r+6)*100)+'% feeding reach'],
     mobility:[Math.round((p.speed||144)/144*100)+'%','swim speed',n(p.sprintDrain)+' stamina / s when sprinting']
   })[key]||['0',''];
 }
 let statDetail='';
 const STAT_ICONS={vitality:'M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10z',reserves:'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.500 6-11 6-11z',recovery:'M5 12a7 7 0 0 1 12-5l2 2M19 5v4h-4M19 12a7 7 0 0 1-12 5l-2-2M5 19v-4h4',power:'M13 3 5 13h6l-1 8 8-10h-6z',reach:'M4 12h16M4 12l4-4M4 12l4 4M20 12l-4-4M20 12l-4 4',mobility:'M4 7l6 5-6 5M12 7l6 5-6 5'};
 function renderSkills(){
   const p=game.state.player,definitions=MorphosGame.ATTRIBUTES||{},target=$('skillsGrid');target.replaceChildren();$('skillPoints').textContent=p.skillPoints||0;
   const cap=game.attributeCap();
   $('attributeCap').hidden=true;$('statLimitText').textContent=cap<10?'Rank limit '+cap+'. Each division raises it.':cap<12?'Rank limit 10. Ranks 11 and 12 open at 31 cells.':'Every stat can reach rank 12.';
   const showDetail=key=>{const def=definitions[key];if(!def)return;statDetail=key;for(const r of target.children)r.classList.toggle('selected',r.dataset.attribute===key);const d=$('statDetail');d.replaceChildren();const b=document.createElement('strong');b.textContent=def.name+'. ';d.append(b,def.description);};
   for(const [key,def]of Object.entries(definitions)){
     const rank=p.attributes?.[key]||0,max=def.maxRank||10,can=rank<cap&&(p.skillPoints||0)>=1;
     const row=document.createElement('section');row.className='stat-row'+(can?' available':'')+(rank>=max?' maxed':'');row.dataset.attribute=key;
     const icon=document.createElement('span');icon.className='stat-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24"><path d="'+(STAT_ICONS[key]||'')+'"/></svg>';
     const label=document.createElement('div');label.className='stat-name';const name=document.createElement('h3');name.textContent=def.name;const level=document.createElement('span');level.textContent=rank+' / '+max;label.append(name,level);
     const bar=document.createElement('div');bar.className='stat-bar';bar.setAttribute('role','img');bar.setAttribute('aria-label',def.name+': '+rank+' of '+max+' ranks, limit '+cap);
     for(let i=0;i<max;i++){const mark=document.createElement('i');mark.className=(i<rank?'earned':i===rank&&can?'next':'')+(i>=cap?' gated':'');bar.append(mark);}
     if(cap<max){const line=document.createElement('span');line.className='stat-limit';line.style.left='calc('+(cap/max*100)+'% - '+(3*(max-cap)/max).toFixed(2)+'px + 1.5px)';line.title='Rank limit '+cap+'. Dividing raises it.';bar.append(line);}
     const values=document.createElement('div');values.className='stat-value';const top=document.createElement('div');const current=attributeReadout(key,p),strong=document.createElement('strong');strong.textContent=current[0];top.append(strong);
     const preview=typeof game.previewAttribute==='function'?game.previewAttribute(key):null;
     if(preview&&rank<cap){const next=document.createElement('em');next.textContent='→ '+attributeReadout(key,preview)[0];next.title='After the next upgrade';top.append(next);}
     const unit=document.createElement('small');unit.textContent=current[1];top.append(unit);values.append(top);
     if(current[2]){const secondary=document.createElement('div');secondary.className='stat-secondary';secondary.textContent=current[2];values.append(secondary);}
     const buy=document.createElement('button');buy.type='button';buy.dataset.attribute=key;buy.className='attribute-buy';buy.disabled=!can;buy.textContent=rank>=max?'✓':'+';buy.title=rank>=max?'Fully developed':rank>=cap?'Divide to raise the rank limit':'Spend one stat point';buy.setAttribute('aria-label','Improve '+def.name+' for one stat point');
     buy.addEventListener('click',()=>{if(game.buyAttribute(key)){consumeEvents();renderSkills();updateUI(true);const next=Array.from($('skillsGrid').querySelectorAll('button')).find(b=>b.dataset.attribute===key);(next&&!next.disabled?next:$('statsPanel')).focus({preventScroll:true});}});
     for(const ev of ['pointerenter','focusin','click'])row.addEventListener(ev,()=>showDetail(key));
     buy.addEventListener('pointerenter',()=>row.classList.add('preview'));buy.addEventListener('pointerleave',()=>row.classList.remove('preview'));buy.addEventListener('focus',()=>row.classList.add('preview'));buy.addEventListener('blur',()=>row.classList.remove('preview'));
     row.append(icon,label,bar,values,buy);target.append(row);
   }
   showDetail(definitions[statDetail]?statDetail:Object.keys(definitions)[0]);
   {const box=$('bodyOverview');box.replaceChildren();for(const [label,value] of [['Resistance',Math.round((p.resistance||0)*100)+'%'],['Critical',Math.round((p.critChance||0)*100)+'%'],['Fast swim',Math.round(p.maxEnergy/Math.max(1,p.sprintDrain||25)*10)/10+' s'],['Genomes',(p.genomes?.length||0)+' / '+Object.keys(MorphosGame.BOSSES).length]]){const d=document.createElement('div'),l=document.createElement('small'),v=document.createElement('b');l.textContent=label;v.textContent=value;d.append(l,v);box.append(d);}}
   const allocated=Object.values(p.attributes||{}).reduce((a,b)=>a+b,0),rested=p.hp>=p.maxHp-1e-6&&p.energy>=p.maxEnergy-1e-6&&!p.exhausted;$('respecStats').disabled=!allocated||!!game.state.bossEncounter||!rested;document.querySelector('.respec-row').hidden=!allocated;$('respecHint').textContent=game.state.bossEncounter?'Finish or retreat from this encounter before rebuilding.':!rested?'Rebuilding needs full health and stamina.':'Refund all '+allocated+' points and try a different build.';
   renderMutations();renderLineage();updateLifeStrip();selectBuildTab(buildTab);
 }
 function selectMutation(key,tryOn=true){
   if(!MorphosGame.MUTATIONS[key])return;selectedMutation=key;previewMode=tryOn&&!(game.state.player.mutations||[]).includes(key)?'selected':'current';
   for(const choice of $('mutationsPanel').querySelectorAll('[data-mutation-choice]')){const selected=choice.dataset.mutationChoice===key;choice.classList.toggle('selected',selected);choice.setAttribute('aria-pressed',String(selected));}
   renderMutationDetail();markMutationsSeen();syncSpecimen();
 }
  // Tier of a found mutation (-1 when not found), its colour, and where it comes from.
 const TIER_COLOURS=MorphosGame.TIER_COLOURS;
 function tierOf(key){return game.mutationTier(key);}
 function tierName(tier){return MorphosGame.TIERS[tier]||'';}
 function mutationSourceText(key){
   const boss=Object.values(MorphosGame.BOSSES).find(b=>b.mutationKey===key);if(boss)return 'Carried only by '+boss.name+'.';
   const src=MorphosGame.MUTATION_SOURCE[key];if(!src)return '';const known=!!collection.species[src],name=(MorphosGame.SPECIES[src]?.name)||MorphosGame.KIND_NAMES[src]||src;
   return 'From the '+name.toLowerCase()+'. Bigger ones carry better copies.';
 }
 let anatomyRenderer=null,anatomySize='',anatomyLinesDirty=true;
 // Where each part's leader line meets the north-facing body, in body radii from its centre.
 const ANATOMY_ANCHORS={mouth:[0,-1],senses:[-.55,-.78],organ:[.62,-.66],membrane:[-1,.3],nucleus:[.22,.12],flagellum:[0,1.08]};
 // Mutations screen: six sockets around the body, one per body part. A socket shows what it holds; a part that has
 // not grown yet shows a ring that fills as you approach the cell count that opens it. The panel beside the body
 // lists the selected part's mutations as round tokens.
 let selectedPart='';
 const SOCKET_POS={mouth:[50,11],senses:[15,30],organ:[85,30],membrane:[13,70],nucleus:[87,70],flagellum:[50,89]};
 function renderMutations(){
   const p=game.state.player,M=MorphosGame.MUTATIONS,parts=MorphosGame.BODY_PARTS,root=$('mutationsGrid'),unlocked=p.unlockedMutations||[],equipped=p.mutations||[];
   const isOpen=part=>p.stage>=part.stage,optionsOf=part=>Object.keys(M).filter(k=>M[k].part===part.key);
   $('mutationCombatNote').hidden=!game.state.bossEncounter;
   // Which part is in focus: one holding something new, else one you have filled, else the first that is open.
   const freshKey=unlocked.find(k=>!seenMutations.has(k)&&isOpen(parts.find(b=>b.key===M[k].part)));
   if(!parts.some(b=>b.key===selectedPart))selectedPart=freshKey?M[freshKey].part:(parts.find(b=>isOpen(b)&&equipped.some(k=>M[k].part===b.key))||parts.find(isOpen)||parts[0]).key;
   const pickFor=part=>{const o=optionsOf(part).filter(k=>unlocked.includes(k));return equipped.find(k=>M[k].part===part.key)||o.find(k=>!seenMutations.has(k))||o[0]||'';};
   if(!M[selectedMutation]||M[selectedMutation].part!==selectedPart||!unlocked.includes(selectedMutation)){selectedMutation=pickFor(parts.find(b=>b.key===selectedPart));previewMode='current';}
   for(const old of root.querySelectorAll('.part-box'))old.remove();
   for(const part of parts){
     const open=isOpen(part),key=equipped.find(k=>M[k].part===part.key),options=optionsOf(part),ready=options.filter(k=>unlocked.includes(k)),fresh=ready.some(k=>!seenMutations.has(k));
     const box=document.createElement('button');box.type='button';box.className='part-box'+(open?(key?' filled':' empty'+(ready.length?' ready':'')):' closed')+(part.key===selectedPart?' selected':'')+(fresh?' fresh':'');box.dataset.part=part.key;
     const pos=SOCKET_POS[part.key]||[50,50];box.style.setProperty('--x',pos[0]+'%');box.style.setProperty('--y',pos[1]+'%');if(key)box.style.setProperty('--mutation-colour','var(--'+M[key].family+')');
     const need=part.stage+1,ring=document.createElement('span');ring.className='socket-ring';ring.style.setProperty('--pct',String(open?(key?100:0):Math.round(clamp(p.cellCount/need,0,1)*100)));if(key)ring.style.setProperty('--c',TIER_COLOURS[tierOf(key)]);
     if(open){const g=document.createElement('span');g.className='mutation-symbol'+(key?' '+key:'');g.setAttribute('aria-hidden','true');setMutationIcon(g,key);ring.append(g);}else{const n=document.createElement('b');n.textContent=String(need);ring.append(n);}
     const name=document.createElement('span');name.className='socket-name';name.textContent=part.name;
     const sub=document.createElement('small');sub.textContent=key?M[key].name:open?(ready.length?ready.length+' ready':'Empty'):p.cellCount+' / '+need+' cells';
     const text=document.createElement('span');text.className='socket-text';text.append(name,sub);box.append(ring,text);box.setAttribute('aria-label',part.name+': '+(key?M[key].name+' equipped':open?(ready.length?ready.length+' ready to equip':'empty'):'grows at '+need+' cells, you have '+p.cellCount));box.setAttribute('aria-pressed',String(part.key===selectedPart));
     box.addEventListener('click',()=>{selectedPart=part.key;selectedMutation=pickFor(part);previewMode='current';renderMutations();markMutationsSeen();syncSpecimen();root.querySelector('[data-part="'+part.key+'"]')?.focus({preventScroll:true});});
     root.append(box);
   }
   // The selected part's panel: its name, how close it is to growing, and its mutations as tokens.
   const part=parts.find(b=>b.key===selectedPart),open=isOpen(part),options=optionsOf(part),found=options.filter(k=>unlocked.includes(k)).length;
   $('partTitle').textContent=part.name;$('mutationSlotCount').textContent=found?found+' FOUND':'';
   $('partProgress').hidden=open;if(!open){const need=part.stage+1;$('partProgressText').textContent=p.cellCount+' / '+need+' cells';$('partProgressFill').style.width=clamp(p.cellCount/need*100,0,100)+'%';}
   const tokens=$('partTokens');tokens.replaceChildren();
   const owned=options.filter(k=>unlocked.includes(k)).sort((a,b)=>(equipped.includes(b)-equipped.includes(a))||(tierOf(b)-tierOf(a))||M[a].name.localeCompare(M[b].name));
   // The equipped one stands on its own; the rest sit in their own group after the divider, so a second row lines up under them.
   let dest=tokens;for(const mk of owned){if(!equipped.includes(mk)&&owned.some(k=>equipped.includes(k))&&!tokens.querySelector('.part-divider')){const line=document.createElement('span');line.className='part-divider';line.setAttribute('aria-hidden','true');tokens.append(line);dest=document.createElement('span');dest.className='part-rest';tokens.append(dest);}const def=M[mk],earned=unlocked.includes(mk),active=equipped.includes(mk),fresh=earned&&!seenMutations.has(mk),selected=mk===selectedMutation;
     const chip=document.createElement('button');chip.type='button';chip.dataset.mutationChoice=mk;chip.className='part-chip'+(active?' equipped':'')+(earned?' earned':' locked')+(fresh?' fresh':'')+(selected?' selected':'');
     chip.style.setProperty('--mutation-colour','var(--'+def.family+')');chip.style.setProperty('--pct',earned?'100':'0');if(earned){chip.style.setProperty('--tier',TIER_COLOURS[tierOf(mk)]);chip.classList.add('tiered');}chip.setAttribute('aria-pressed',String(selected));chip.title=(earned?tierName(tierOf(mk))+' ':'')+def.name;chip.setAttribute('aria-label',(earned?tierName(tierOf(mk))+' ':'')+def.name+', '+(active?'equipped':earned?'ready to equip':'not found'));
     const icon=document.createElement('span');icon.className='mutation-symbol '+mk;icon.setAttribute('aria-hidden','true');setMutationIcon(icon,mk);chip.append(icon);if(active){const tick=document.createElement('span');tick.className='chip-tick';tick.setAttribute('aria-hidden','true');tick.textContent='✓';chip.append(tick);}chip.addEventListener('click',()=>selectMutation(mk));dest.append(chip);}
   anatomyLinesDirty=true;renderMutationDetail();
 }
 // Leader lines from each part's box to its place on the body. Redrawn when the layout changes.
 function drawAnatomyLines(centre){
   const svg=$('anatomyLines'),root=$('mutationsGrid');if(!svg)return;
   const rr=root.getBoundingClientRect(),cr=$('anatomyCanvas').getBoundingClientRect();if(rr.width<1)return;
   svg.setAttribute('viewBox','0 0 '+rr.width+' '+rr.height);svg.replaceChildren();
   const cx=cr.left-rr.left+centre.x,cy=cr.top-rr.top+centre.y,R=centre.r,ns='http://www.w3.org/2000/svg',equipped=game.state.player.mutations||[];
   for(const box of root.querySelectorAll('.part-box')){
     const part=box.dataset.part,a=ANATOMY_ANCHORS[part],ring=box.querySelector('.socket-ring');if(!a||!ring)continue;
     const b=ring.getBoundingClientRect(),sx=b.left-rr.left+b.width/2,sy=b.top-rr.top+b.height/2,ex=cx+a[0]*R,ey=cy+a[1]*R,d=Math.hypot(ex-sx,ey-sy)||1,rad=b.width/2+5;if(d<rad+4)continue;
     const x0=sx+(ex-sx)/d*rad,y0=sy+(ey-sy)/d*rad,key=equipped.find(k=>MorphosGame.MUTATIONS[k].part===part),colour=key?'var(--'+MorphosGame.MUTATIONS[key].family+')':'';
     const path=document.createElementNS(ns,'path');path.setAttribute('d',`M${x0} ${y0} L${ex} ${ey}`);const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',ex);dot.setAttribute('cy',ey);dot.setAttribute('r',key?3:2);
     if(key){path.setAttribute('class','on');dot.setAttribute('class','on');path.style.setProperty('--mutation-colour',colour);dot.style.setProperty('--mutation-colour',colour);}svg.append(path,dot);
   }
 }
 function drawAnatomyView(){
   const surface=$('anatomyCanvas');if(!surface)return;const box=surface.parentElement.getBoundingClientRect();if(box.width<1||box.height<1)return;
   if(!anatomyRenderer)anatomyRenderer=new MorphosRenderer(surface,true);
   const dpr=Math.min(devicePixelRatio||1,2),size=[box.width,box.height,dpr,$('mutationsGrid').getBoundingClientRect().width].join(':');
   if(size!==anatomySize){anatomyRenderer.resize(box.width,box.height,dpr);anatomySize=size;anatomyLinesDirty=true;}
   const options={time:reduced?0:time,north:true,bare:true,morph:specimenMorph('anatomy',game.state.player)},loadout=previewLoadout(game.state.player);if(loadout!==null)options.previewMutations=loadout;
   const out=anatomyRenderer.drawSpecimen(game.state.player,options);if(out&&anatomyLinesDirty){anatomyLinesDirty=false;drawAnatomyLines(out.centre);}
 }
 function renderMutationDetail(){
   const key=selectedMutation,def=MorphosGame.MUTATIONS[key];
   // Nothing found for this part yet: say so, and nothing more. What exists is for the pond to reveal.
   if(!def){const part=MorphosGame.BODY_PARTS.find(b=>b.key===selectedPart),open=part&&game.state.player.stage>=part.stage;$('mutationDetail').dataset.state='none';$('mutationIcon').className='mutation-symbol';$('mutationIcon').textContent='?';$('mutationName').textContent='Nothing found yet';$('mutationStatus').textContent='';$('mutationDescription').textContent=open?'Creatures of the pond carry mutations for this part. Hunt, and see what they leave behind.':'This part has not grown yet.';for(const id of ['mutationAppearance','mutationRequirementSummary','mutationActionHint'])$(id).textContent='';$('mutationRequirements').replaceChildren();$('mutationAction').hidden=true;$('previewNote').hidden=true;return;}
   const p=game.state.player,equipped=p.mutations||[],active=equipped.includes(key),earned=(p.unlockedMutations||[]).includes(key),full=equipped.length>=(p.mutationSlots||0),combat=!!game.state.bossEncounter;
   $('mutationIcon').className='mutation-symbol '+key;setMutationIcon($('mutationIcon'),key);$('mutationName').textContent=def.name;$('mutationStatus').textContent=earned?tierName(tierOf(key)).toUpperCase()+(active?' · EQUIPPED':''):'NOT FOUND';$('mutationStatus').style.color=earned?TIER_COLOURS[tierOf(key)]:'';$('mutationDetail').dataset.state=active?'equipped':earned?'earned':'locked';
   $('mutationDescription').textContent=MorphosGame.describeMutation(key,tierOf(key));$('mutationAppearance').textContent=mutationAnatomy[key];$('mutationRequirementSummary').textContent='';
   const target=$('mutationRequirements');target.replaceChildren();
   {const box=$('mutationRequirements');box.replaceChildren();const tier=tierOf(key),line=document.createElement('p');line.className='perk-line'+(tier>=2?' on':'');line.style.setProperty('--tier',TIER_COLOURS[Math.max(2,tier)]);line.textContent=tier>=2?MorphosGame.describePerk(key,tier):'A Rare or better copy gains a second effect.';box.append(line);}
   const replacement=$('previewReplacement');replacement.replaceChildren();previewReplacement=clamp(previewReplacement,0,Math.max(0,equipped.length-1));
   equipped.forEach((mutation,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=MorphosGame.MUTATIONS[mutation].name;option.selected=i===previewReplacement;replacement.append(option);});
   // One mutation per body part: equipping into an occupied part swaps the old one out.
   const part=MorphosGame.BODY_PARTS.find(b=>b.key===def.part),open=!!part&&p.stage>=part.stage;
   const button=$('mutationAction');button.disabled=combat||!earned||(!active&&!open);button.setAttribute('aria-pressed',String(active));button.dataset.mutation=key;button.classList.toggle('unequip',!combat&&active);
   button.textContent=combat?'Locked while hunted':active?'Remove':!earned?'Not found':!open?'Grows at '+(part?part.stage+1:'?')+' cells':'Equip';
   button.hidden=!combat&&(!earned||(!active&&!open));$('mutationActionHint').textContent='';
 }
 function updateResearchReadout(){
   const s=game.state,o=s.objective;if(!$('pauseStudyTitle'))return;
   const progress=o?Math.floor(Math.min(o.target,o.progress||0)):0,percent=o?clamp(progress/Math.max(1,o.target)*100,0,100):0;
   $('pauseStudyTitle').textContent=o?o.title+' '+progress.toLocaleString('en-GB')+'/'+o.target.toLocaleString('en-GB'):'None';$('pauseStudyFill').style.width=percent+'%';
   $('pauseStudyNote').textContent=s.lead?'Lead active: '+(s.lead.rare?'a rare place':'an unexplored place')+' · follow your pointer':'Reward: score, growth and a lead to an unexplored place';
 }
 // The life summary on the pause screen: what used to sit in the top-right corner of play.
 function updateLifeStrip(){
   const s=game.state,p=s.player;if(!$('pauseScore'))return;
   $('pauseScore').textContent=Math.floor(s.score).toLocaleString('en-GB');$('pauseHabitat').textContent=s.biomeName+' · '+MorphosGame.depthAt(MorphosGame.waterLevel(s.player.x,s.player.y)).name+' (water level '+(MorphosGame.waterLevel(s.player.x,s.player.y)+1)+')';$('pauseClock').textContent=clock(s.time);
   {const full=identityText(p),parts=full.split(' · '),short=parts.length>2?parts.slice(0,2).join(' · ')+' +'+(parts.length-2):full;$('skillsTitle').textContent=short;$('skillsTitle').title=full;$('pauseCells').textContent=p.cellCountText||p.cellCount;$('pauseCellsLabel').textContent=p.cellCount===1?'cell':'cells';}
   $('pauseKicker').textContent=mode==='evolving'?(rewardContext?'Victory':'You evolved'):'Paused'+(coop&&coop.started&&coop.host&&coop.code?' · Pond code '+coop.code:'');updateResearchReadout();
 }
 function rememberEvolution(e){
   if(Array.isArray(e.changes)&&e.changes.length){let fresh=false;for(const entry of e.changes)fresh=rememberEvolution(entry)||fresh;return fresh;}
   if(!families.includes(e.trait))return false;const rank=Math.min(5,e.rank||game.state.player.traits[e.trait]||1),key=e.trait+'-'+rank+(rank===2||rank===4?(e.fork||'a'):''),isNew=!guide[key];
   if(isNew){guide[key]={title:MorphosGame.rankName(e.trait,rank,e.fork).slice(0,160),reason:String(e.reason).slice(0,600)};lifeNewDiscoveries++;}
   let hybridNew=false;for(const h of e.hybrids||[]){const k='hybrid-'+h,def=MorphosGame.HYBRIDS[h];if(def&&!guide[k]){guide[k]={title:def.name,reason:def.effect};hybridNew=true;lifeNewDiscoveries++;}}
   if(isNew||hybridNew){save();refreshRecords();}return isNew||hybridNew;
 }
 // The evolution tree: five branches around the cell, each rank further out, forks side by side, hybrids between neighbours.
 let treeSelected='',latestUnseen=false;
 // The node most recently gained (from the last evolution), marked NEW on the tree until tapped.
 function latestNodeId(){const e=lastGrowth&&lastGrowth.e;if(!e||!e.trait)return'';if(e.hybrids&&e.hybrids.length)return'hybrid-'+e.hybrids[0];const r=Math.min(5,e.rank||1);return e.trait+r+(r===2||r===4?(e.fork||'a'):'');}
 function treeNodes(){
   const p=game.state.player,ring=MorphosGame.FAMILY_RING,nodes=[];
   const at=(angle,radius,off=0)=>({x:50+Math.cos(angle)*radius+Math.cos(angle+Math.PI/2)*off,y:50+Math.sin(angle)*radius+Math.sin(angle+Math.PI/2)*off});
   ring.forEach((f,i)=>{const angle=-Math.PI/2+i*(Math.PI*2)/5,rank=p.traits[f]||0;
     for(let r=1;r<=5;r++){const fork=r===2||r===4,sides=fork?['a','b']:[''],radius=5+r*7.6;
       for(const side of sides){const pos=at(angle,radius,fork?(side==='a'?-4:4):0),taken=rank>=r&&(!fork||(p.forks[f+r]||'a')===side),skipped=fork&&rank>=r&&!taken,isOffered=fork&&rank+1===r&&game.forkReady(f),mastery=r===5&&taken,xp=p.evidence[f]||0,cost=game.rankCost(f);
         nodes.push({id:f+r+side,family:f,rank:r,side,x:pos.x,y:pos.y,name:MorphosGame.rankName(f,r,side),mastery,masteryLevel:p.mastery?.[f]||0,xp,cost,progress:isOffered||rank+1===r||mastery?Math.min(1,xp/cost):-1,state:isOffered?'offered':taken?'owned':skipped?'skipped':rank+1===r?'next':'locked',parent:r===1?null:f+(r-1)});}}
   });
   for(const [k,h] of Object.entries(MorphosGame.HYBRIDS)){const i=ring.indexOf(h.families[0]),j=ring.indexOf(h.families[1]),a1=-Math.PI/2+i*(Math.PI*2)/5,a2=-Math.PI/2+j*(Math.PI*2)/5,mid=Math.atan2(Math.sin(a1)+Math.sin(a2),Math.cos(a1)+Math.cos(a2)),pos=at(mid,24);
     nodes.push({id:'hybrid-'+k,hybrid:k,families:h.families,x:pos.x,y:pos.y,name:h.name,state:h.families.every(f=>(p.traits[f]||0)>=2)?'owned':'locked'});}
   return nodes;
 }
 // What ranks I, III and V add (II and IV are forks, described by FORKS).
 const RANK_EFFECTS={
   predator:{1:'Pounce at full strength, and Frenzy: kills in quick succession raise your attack and speed.',3:'Frenzy builds to five stacks instead of three.',5:'Frenzy builds to seven stacks, and Pounce hits 25% harder.'},
   venomist:{1:'Venom volley at full strength (three globs), and globs rupture creatures carrying 3 or more stacks.',3:'Up to 8 stacks, stronger poison, and each glob adds two stacks.',5:'Poison deals 25% more damage.'},
   summoner:{1:'Two broodlings follow you for good and bud back when lost.',3:'A third broodling.',5:'One more broodling.'},
   riptide:{1:'Whirlpool at full strength, and rams hit much harder.',3:'Whirlpool lasts 1 second longer, a wider near-miss window, and Momentum builds to five.',5:'Whirlpool also grips a boss for 1 second, and rams hit 25% harder.'},
   stalker:{1:'Decoy at full strength.',3:'Decoy leaves two phantoms.',5:'Ambushes deal 35% more damage.'}
 };
 function nodeEffect(n){
   const ability=MorphosGame.ABILITIES[n.family];if(n.hybrid)return MorphosGame.HYBRIDS[n.hybrid].effect;if(n.side)return MorphosGame.FORKS[n.family][n.rank][n.side].effect+' Also strengthens '+ability.name+'.';
   const own=(RANK_EFFECTS[n.family]||{})[n.rank];return own?own+(n.rank>1?' Also strengthens '+ability.name+'.':''):'Strengthens '+ability.name+'.';
 }
 function renderTree(){
   const box=$('evoTree');if(!box)return;const nodes=treeNodes(),byId=Object.fromEntries(nodes.map(n=>[n.id,n])),svg=$('evoLines'),ns='http://www.w3.org/2000/svg';
   for(const b of box.querySelectorAll('.tree-node,.tree-core,.tree-label'))b.remove();svg.replaceChildren();
   const line=(x1,y1,x2,y2,cls,colour)=>{const l=document.createElementNS(ns,'line');l.setAttribute('x1',x1);l.setAttribute('y1',y1);l.setAttribute('x2',x2);l.setAttribute('y2',y2);l.setAttribute('class',cls);if(colour)l.style.setProperty('--trait',colour);svg.append(l);};
   for(const n of nodes){
     if(n.hybrid){for(const f of n.families){const root=byId[f+'2a'],root2=byId[f+'2b'];const mx=(root.x+root2.x)/2,my=(root.y+root2.y)/2;line(mx,my,n.x,n.y,'hybrid'+(n.state==='owned'?' on':''),'#d9c6f2');}continue;}
     const parents=n.rank===1?[{x:50,y:50,owned:true}]:nodes.filter(m=>m.family===n.family&&m.rank===n.rank-1&&(m.state==='owned'||!(m.side&&byId[m.family+m.rank+(m.side==='a'?'b':'a')].state==='owned')));
     for(const m of parents)line(m.x,m.y,n.x,n.y,n.state==='owned'?'on':n.state==='offered'?'offer':'','var(--'+n.family+')');
   }
   if(!treeSelected||!byId[treeSelected])treeSelected=(nodes.find(n=>n.state==='offered')||nodes.filter(n=>n.state==='owned'&&!n.hybrid).sort((a,b)=>b.rank-a.rank)[0]||nodes[0]).id;
   for(const n of nodes){const b=document.createElement('button');b.type='button';const isLatest=latestUnseen&&n.state==='owned'&&n.id===latestNodeId();b.className='tree-node '+n.state+(n.hybrid?' hybrid':'')+(n.id===treeSelected?' selected':'')+(isLatest?' latest':'');b.dataset.node=n.id;b.style.left=n.x+'%';b.style.top=n.y+'%';if(n.progress>=0){b.classList.add('progress');b.style.setProperty('--pct',String(Math.round(n.progress*100)));}
     b.style.setProperty('--trait',n.hybrid?'#d9c6f2':'var(--'+n.family+')');b.textContent=n.hybrid?'':romans[n.rank];if(n.side){const sub=document.createElement('sub');sub.textContent=n.side;b.append(sub);}
     b.setAttribute('aria-label',n.name+', '+(n.hybrid?'hybrid of '+n.families.map(f=>familyNames[f]).join(' and '):familyNames[n.family]+' '+romans[n.rank]+(n.side?' '+n.side.toUpperCase():''))+', '+({owned:'grown',skipped:'the other side was chosen',offered:'available now',next:'next in this line',locked:'not yet'})[n.state]);b.title=n.name;
     b.addEventListener('click',()=>{treeSelected=n.id;if(n.id===latestNodeId())latestUnseen=false;renderTree();box.querySelector('[data-node="'+n.id+'"]')?.focus({preventScroll:true});});box.append(b);}
   const core=document.createElement('span');core.className='tree-core';core.setAttribute('aria-hidden','true');box.append(core);
   for(const [i,f] of MorphosGame.FAMILY_RING.entries()){const a=-Math.PI/2+i*(Math.PI*2)/5,label=document.createElement('span');label.className='tree-label';label.textContent=familyNames[f];label.style.setProperty('--trait','var(--'+f+')');const cx=Math.cos(a),sy=Math.sin(a);label.style.left=(50+cx*51)+'%';label.style.top=(50+sy*(Math.abs(cx)<.3?54:51))+'%';label.style.transform='translate('+(cx>.3?'6px':cx<-.3?'calc(-100% - 6px)':'-50%')+',-50%)';box.append(label);}
   const n=byId[treeSelected],d=$('treeDetail');d.replaceChildren();d.style.setProperty('--trait',n.hybrid?'#d9c6f2':'var(--'+n.family+')');
   const k=document.createElement('small'),h=document.createElement('h4'),e=document.createElement('p'),st=document.createElement('p');
   k.textContent=n.hybrid?'HYBRID · '+n.families.map(f=>familyNames[f].toUpperCase()).join(' + '):familyNames[n.family].toUpperCase()+' '+romans[n.rank]+(n.side?' · '+(n.side==='a'?'FIRST':'SECOND')+' FORK':'');h.textContent=n.name;e.textContent=nodeEffect(n);
   const xpLine='';
   st.className='tree-state';st.textContent=n.mastery&&n.state==='owned'?'Grown.'+(n.masteryLevel?' Mastery '+n.masteryLevel+'.':''):n.hybrid?(n.state==='owned'?'Grown.':'Needs '+n.families.map(f=>familyNames[f]).join(' and ')+' at rank II.'):({owned:'Grown.',skipped:'The other side of this fork was chosen.',offered:'Ready. Taking this side closes the other.',next:n.side?'A fork: you will choose one side.':'',locked:'Grow the earlier ranks first.'})[n.state];
   d.append(k,h,e,st);
   if(n.progress>=0&&n.state!=='offered'){const row=document.createElement('div'),l=document.createElement('span'),v=document.createElement('b');row.className='tree-xp-row';l.textContent=n.mastery&&n.state==='owned'?'Mastery':'Experience';v.textContent=Math.floor(n.xp).toLocaleString('en-GB')+' / '+n.cost.toLocaleString('en-GB');row.append(l,v);const bar=document.createElement('div'),fill=document.createElement('i');bar.className='tree-xp';bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuenow',String(Math.round(n.progress*100)));fill.style.width=Math.round(n.progress*100)+'%';bar.append(fill);d.append(row,bar);}
   if(n.state==='offered'){const b=document.createElement('button');b.type='button';b.className='btn primary';b.id='treeGrow';b.textContent='Evolve';b.setAttribute('aria-label','Evolve '+n.name);b.addEventListener('click',()=>{if(performance.now()-growthShownAt<300||!game.forkReady(n.family))return;if(game.chooseEvolution(n.family,n.side))consumeEvents();});d.append(b);}
 }
 function renderLineage(){renderTree();}

 function showGrowth(e,isNew=false){
   if(!e)return;rewardContext=null;$('evolutionChoices').hidden=true;const p=game.state.player,rank=Math.min(5,e.rank||p.traits[e.trait]||1),ability=(MorphosGame.ABILITIES||{})[e.trait];
   clearInput();accumulator=0;setMode('evolving');$('tip').classList.remove('show');fillGrowth(e,isNew);growthUnseen=false;
   buildTab='evolution';growthShownAt=performance.now();openGrowthWorkbench();
 }
 function fillGrowth(e,isNew=false){
   const p=game.state.player,rank=Math.min(5,e.rank||p.traits[e.trait]||1),ability=(MorphosGame.ABILITIES||{})[e.trait];$('evolutionChoices').hidden=true;
   $('evolutionKicker').textContent=(mode==='evolving'?'YOU EVOLVED':'LATEST EVOLUTION')+' · '+familyNames[e.trait].toUpperCase()+' '+romans[rank]+(e.mastery?' · MASTERY '+e.mastery:'');$('evolutionTitle').textContent=e.title;$('evolutionReason').textContent=e.reason;
   $('evolutionCells').textContent='From '+familyNames[e.trait].toLowerCase()+' experience · '+(e.cellCountText||e.cells)+(String(e.cellCountText||e.cells)==='1'?' cell':' cells');
   const strikeChanged=e.strikeTo&&e.strikeFrom!==e.strikeTo,strikeDef=strikeChanged&&MorphosGame.STRIKES[e.strikeTo],hybrids=(e.hybrids||[]).map(k=>MorphosGame.HYBRIDS[k]).filter(Boolean);
   $('evolutionLevel').textContent=(strikeDef?'Your Strike became '+strikeDef.name+': '+strikeDef.description.charAt(0).toLowerCase()+strikeDef.description.slice(1)+' ':'')+(hybrids.length?'New hybrid: '+hybrids.map(h=>h.name+'. '+h.effect).join(' ')+' ':'')+(isNew?'This organ is now recorded in your field guide.':'');
   const newOrgans=(e.newAbilities||[]).map(key=>MorphosGame.ABILITIES[key]).filter(Boolean),primaryAbility=newOrgans[0]||ability;
   $('evolutionAbilityKicker').textContent=(e.newAbility||rank===1&&!e.mastery?'CLASS AWAKENED · ':'EVOLVED ABILITY · ')+(primaryAbility?.key||'').toUpperCase();$('evolutionAbility').textContent=primaryAbility?.name||'An adapted body';$('evolutionAbilityDescription').textContent=primaryAbility?.description||'';
   $('evolutionElder').hidden=true;const points=p.skillPoints||0;$('evolutionPoints').textContent=points?pointText(points)+' to spend on the Stats tab.':'';$('evolutionPoints').hidden=!points;
 }
 function showElderReward(e){
   rewardContext=e;const p=game.state.player,def=MorphosGame.BOSSES?.[e.bossType]||{},mutation=MorphosGame.MUTATIONS?.[e.mutationKey||def.mutationKey],count=p.genomes?.length||1,growth=game.state.pendingEvolution;
   clearInput();accumulator=0;setMode('evolving');$('tip').classList.remove('show');
   $('evolutionPoints').hidden=false;$('evolutionSummary').hidden=false;
   $('evolutionKicker').textContent=count===Object.keys(MorphosGame.BOSSES).length?'THE APEX OF THE POND':'APEX PREDATOR DEFEATED';$('evolutionTitle').textContent=e.name||def.name||'An elder falls.';
   $('evolutionReason').textContent='Its genome is now part of your lineage. '+(count===Object.keys(MorphosGame.BOSSES).length?'You have overcome every apex predator in the pond. It still has room for you to grow.':'Your body can become something it could not before.');
   $('evolutionCells').textContent=count+' OF '+Object.keys(MorphosGame.BOSSES).length+' GENOMES';$('evolutionLevel').textContent=growth?(p.cellCountText||p.cellCount)+' cells · '+growth.title+'.':(p.cellCountText||p.cellCount)+' cells · '+(e.genomeName||def.genomeName||'Genome acquired')+'.';
   $('evolutionAbilityKicker').textContent=(mutation?tierName(Math.max(0,tierOf(mutation.key))).toUpperCase()+' ':'')+'MUTATION · ONLY FROM THIS PREDATOR';$('evolutionAbility').textContent=mutation?.name||'An elder adaptation';$('evolutionAbilityDescription').textContent=mutation?MorphosGame.describeMutation(mutation.key,Math.max(0,tierOf(mutation.key))):'Open your build to discover what has changed.';
   $('evolutionPoints').textContent='Earned '+pointText((e.reward||0)+(growth?.points||0))+' from this victory'+(growth?' and growth':'')+'. '+(p.skillPoints||0)+' unspent.';
   const nextSlot=mutationSlotStages.find(stage=>stage>p.stage);$('evolutionElder').hidden=false;$('evolutionElder').textContent='Growth beyond level '+(MorphosGame.BOSSES[e.bossType]?.level||'')+' is unlocked. '+(nextSlot!==undefined?'Your next mutation slot opens at '+(nextSlot+1)+' cells.':'Choose mutations that work with your evolved organs.');
   buildTab='evolution';growthShownAt=performance.now();openGrowthWorkbench();
 }
 // Divisions never interrupt play (R4): the body morphs on screen, a notice says what changed, and the details
 // wait on the Evolution tab (marked with a dot until seen). Inside a menu (a choice just made) the summary shows there.
 function evolutionaryEvent(e){const fresh=rememberEvolution(e);updateAbilities();lastGrowth={e,fresh};growthUnseen=true;
   // Chosen on the Lineage tab: the summary on that tab updates in place and the screen stays as it was.
   latestUnseen=true;if(activeDialog==='skillsDialog'&&$('skillsDialog').open){growthUnseen=false;renderSkills();updateUI(true);return;}
   if(mode!=='playing'){showGrowth(e,fresh);return;}
   noticeQueue=noticeQueue.filter(n=>!n.text.startsWith('Evolved'));if(activeNotice?.text.startsWith('Evolved'))activeNotice=null;notify(growthNotice(e),6,3);
   if(e.rank===1&&!e.mastery&&game.state.evolutionLog.length===1){const ability=MorphosGame.ABILITIES[e.trait];if(ability)notify('Your '+familyNames[e.trait]+' class has awakened: '+ability.name+(touchUI()?'':' ('+(keyLabel(e.trait)||'its key')+')')+' is at full strength.',5,2);}
 }
 function growthNotice(e){
   const rank=Math.min(5,e.rank||1),newOrgans=(e.newAbilities||[]).map(k=>MorphosGame.ABILITIES[k]?.name).filter(Boolean),strike=e.strikeTo&&e.strikeFrom!==e.strikeTo&&MorphosGame.STRIKES[e.strikeTo],hybrids=(e.hybrids||[]).map(k=>MorphosGame.HYBRIDS[k]?.name).filter(Boolean);
   return 'Evolved · '+familyNames[e.trait]+' '+romans[rank]+(e.mastery?' mastery '+e.mastery:'')+': '+e.title.replace(/ · Mastery \d+$/,'')+'.'+(newOrgans.length?' New organ: '+newOrgans.join(', ')+'.':'')+(hybrids.length?' Hybrid: '+hybrids.join(', ')+'.':'')+(strike?' Strike: '+strike.name+'.':'');
 }
 // Divisions come from growth (eating): more cells, a bigger body and a stat point. They never change the family ranks.
 function divisionEvent(e){
   const p=game.state.player,pts=p.skillPoints||0;
   noticeQueue=noticeQueue.filter(n=>!n.text.startsWith('Divided'));if(activeNotice?.text.startsWith('Divided'))activeNotice=null;
   notify('Divided · '+(e.cellCountText||e.cells)+' cells'+(e.points?' · +'+pointText(e.points):'')+'.'+(pts?' '+pointText(pts)+' unspent.':''),5,2);
   if(mutationSlotStages.some(stage=>stage>e.fromStage&&stage<=e.stage))notify('A new mutation slot is open on the Mutations tab.',4.5,1);
   if(e.strikeTo&&e.strikeFrom!==e.strikeTo&&MorphosGame.STRIKES[e.strikeTo])notify('Strike: '+MorphosGame.STRIKES[e.strikeTo].name+'.',4,1);
   updateUI(true);
 }
 function openGrowthWorkbench(){
   $('evolutionSummary').hidden=false;$('skillsDialog').dataset.evolving='true';
   renderSkills();activateDialog('skillsDialog','evolution');$('skillsBack').textContent='Continue';
   if(buildTab==='mutations')markMutationsSeen();updateUI(true);$('skillsBack').focus({preventScroll:true});
 }
 function continueEvolution(){
   if(mode!=='evolving'||activeDialog!=='skillsDialog'||performance.now()-growthShownAt<300)return;
   rewardContext=null;$('evolutionSummary').hidden=true;$('skillsDialog').dataset.evolving='false';if(typeof game.acknowledgeEvolution==='function')game.acknowledgeEvolution();
   closeAllDialogs();clearInput();accumulator=0;setMode('playing');last=performance.now();updateUI(true);
   if(game.state.evolutionLog.length===1){const trait=game.state.evolutionLog.at(-1)?.trait,ability=trait&&MorphosGame.ABILITIES[trait];}
 }
 // Coming back from a death: fade to black with "You died", restore the checkpoint behind the black, fade back in, then count down from 3
 // with the pond held still so nobody is thrown straight back into a fight.
 var respawnBusy=false,respawnTimers=[];
 function respawnLater(fn,ms){respawnTimers.push(setTimeout(fn,ms));}
 function respawnBlack(title,then){
   const el=$('respawn');for(const id of respawnTimers.splice(0))clearTimeout(id);
   $('respawnTitle').textContent=title;$('respawnCount').textContent='';$('respawnCount').className='respawn-count';
   el.hidden=false;el.classList.remove('dark');void el.offsetWidth;el.classList.add('dark');respawnLater(then,1800);
 }
 function respawnCountdown(){
   const el=$('respawn'),n=$('respawnCount');if(mode==='playing')setMode('paused');clearInput();
   $('respawnTitle').textContent='';el.hidden=false;el.classList.remove('dark');let k=3;
   const step=()=>{
     if(k===0){n.textContent='';el.hidden=true;respawnBusy=false;if(mode==='paused'&&!activeDialog){clearInput();accumulator=0;setMode('playing');last=performance.now();}return;}
     n.textContent=String(k);n.classList.remove('pop');void n.offsetWidth;n.classList.add('pop');k--;respawnLater(step,1000);
   };step();
 }
 function respawnTo(title,restore){
   if(respawnBusy)return;respawnBusy=true;clearInput();
   respawnBlack(title,()=>{let ok=false;try{ok=restore()!==false;}catch(error){ok=false;}if(!ok||mode==='menu'||mode==='end'){$('respawn').hidden=true;$('respawn').classList.remove('dark');respawnBusy=false;return;}respawnCountdown();});
 }
 function respawnCancel(){for(const id of respawnTimers.splice(0))clearTimeout(id);respawnBusy=false;const el=$('respawn');if(el){el.hidden=true;el.classList.remove('dark');}}
 function finish(won=false,reward=null){
   // A death fades to black and shows "You died" before the summary.
   if(!won&&!resultRecorded&&!respawnBusy){respawnBusy=true;clearInput();respawnBlack('You died',()=>{respawnBusy=false;finishNow(false,null);const el=$('respawn');el.classList.remove('dark');respawnLater(()=>{el.hidden=true;},800);});return;}
   finishNow(won,reward);
 }
 function finishNow(won=false,reward=null){
   flushCheckpoint();
   if(resultRecorded)return;resultRecorded=true;closeAllDialogs();clearInput();setMode('end');clearNotices();
   const summary=game.getSummary(),p=game.state.player;
   $('endScreen').dataset.outcome=won?'victory':'defeat';$('endScreen').querySelector('.end-card').dataset.victory=String(won);
   $('endKicker').textContent=won?'THE ELDER JOURNEY IS COMPLETE':'A LIFE WORTH REMEMBERING';$('endTitle').textContent=won?'A life beyond the elders.':'Every life leaves a trace.';
   $('endDescription').textContent=won?'From a single cell, you grew a lineage that overcame every apex predator in the pond. Keep this creature and explore further, or begin a new life shaped by different habits.':(summary.deathCause||'The pond')+' ended this life. '+(checkpoint?'Return to your last checkpoint and try a different tactic. Your discoveries remain.':summary.cells>1?'Your discoveries remain in the field guide. Try a new lineage, or load a life you saved.':'Feed, keep moving, and save stamina for an escape. Your first adaptation is waiting.');
   $('endReward').hidden=!won;const mutation=MorphosGame.MUTATIONS[reward?.mutationKey||'phaseMembrane'];$('endReward').textContent=won?'Final genome acquired · '+mutation.name+'. '+MorphosGame.describeMutation(mutation.key,4):'';
   $('endScore').textContent=summary.score.toLocaleString('en-GB');$('endCells').textContent=p.cellCountText||summary.cells;$('endTime').textContent=clock(summary.time);
   const list=$('lineage'),seenFamilies=new Set();list.replaceChildren();for(const e of (summary.evolutionLog||[]).slice(-8)){const li=document.createElement('li'),badge=document.createElement('span'),text=document.createElement('span'),reason=document.createElement('span');badge.className='cell-count';badge.textContent=e.cellCountText||e.cells;text.textContent=e.title;reason.className='reason';{const first=!seenFamilies.has(e.trait);seenFamilies.add(e.trait);reason.textContent=(familyNames[e.trait]||'')+(e.rank?' '+romans[Math.min(5,e.rank)]:'')+(first&&e.reason?' · '+e.reason:'');}text.append(reason);li.append(badge,text);list.append(li);}
   if(!list.children.length){const li=document.createElement('li');li.textContent='A single cell, with an unwritten future.';list.append(li);}
   const newBest=summary.score>best;best=Math.max(best,summary.score);save();refreshRecords();
   $('endFoot').textContent=(newBest?'NEW BEST · ':'')+p.genomes.length+'/'+Object.keys(MorphosGame.BOSSES).length+' apex genomes · '+(lifeNewDiscoveries?lifeNewDiscoveries+' new '+(lifeNewDiscoveries===1?'discovery':'discoveries')+' · ':'')+discovered()+'/'+ADAPTATION_TOTAL+' adaptations · '+summary.seed+(recordsSaved?'':' · Records kept for this session');$('continue').hidden=!won;$('again').classList.toggle('primary',!won&&!checkpoint);updateCheckpointUI();
 }
 function continueExploring(){
   if(mode!=='end'||!game.state.journeyComplete||game.state.status!=='playing')return;game.acknowledgeEvolution();game.continueEndless();resultRecorded=false;rewardContext=null;$('endScreen').dataset.outcome='';closeAllDialogs();clearInput();accumulator=0;setMode('playing');last=performance.now();updateUI(true);
 }
 function consumeEvents(){let victory=null,journeyWon=false;for(const e of game.drainEvents()){
   if(audio&&soundOn)audio.event(e);
   if(e.type==='evolve')evolutionaryEvent(e);
   else if(e.type==='divided'){divisionEvent(e);growthCheckpointDue=game.state.time;growthCheckpointLabel='';}
   else if(e.type==='awaken'){const ability=MorphosGame.ABILITIES[e.trait],why={kill:'Your kills',division:'Your growth',venomKill:'Venom from your prey',stung:'Venomous stings',nearMiss:'Your narrow escapes',ram:'Ramming at speed',escape:'Your clean escapes',hidden:'Hiding from predators'}[e.reason]||'Something in the pond';if(ability)notify(why+' woke your '+familyNames[e.trait]+' class. New ability: '+ability.name+(touchUI()?'.':' ('+(keyLabel(e.trait)||ability.key)+').'),6,2);updateUI(true);}
   else if(e.type==='evolutionChoice'){const f=familyNames[e.options[0]]||'';if(activeDialog==='skillsDialog')renderSkills();else notify('Your '+f.toLowerCase()+' line is ready to fork.',6,3);}
   else if(e.type==='warning')notify(e.message,5,3);
   else if(e.type==='biome')notify('New habitat: '+e.name,4);
   else if(e.type==='elderSighted')notify('An ancient is near: '+e.name+' (level '+e.level+').',6,2);
   else if(e.type==='elderSlain'){{const nm=e.name.split(',')[0];notify(nm.charAt(0).toUpperCase()+nm.slice(1)+' has fallen.'+(e.marked?'':/vault warden$/.test(e.name)?' Its vault is unguarded now.':''),6,3);}updateUI(true);}
   else if(e.type==='discovery'&&['fossil','shell','sealed','trail','silent','nursery'].includes(e.landmarkType)){const isNew=!collection.finds[e.landmarkType];collection.finds[e.landmarkType]=true;saveCollection();notify((isNew?'Rare find: ':'Discovered: ')+e.name,5,isNew?2:1);}
   else if(e.type==='discovery'&&String(e.landmarkType).startsWith('wonder')){const w=(MorphosGame.WONDERS||[]).find(x=>x.type===e.landmarkType);notify('A wonder: '+e.name+(w?' · '+w.lore:''),8,2);}
     else if(e.type==='taskReady')notify(e.title+' · done',4.5,1);
     else if(e.type==='taskFound')notify(e.title,3.5,1);
     else if(e.type==='bountyDone'&&!$('hermitDialog').open)notify('Task done for '+e.hermit+(e.reward?' · you found '+e.reward:''),6,2);
     else if(e.type==='discovery')notify('Discovered: '+e.name+(e.reward?' · +'+e.reward+' stat '+(e.reward===1?'point':'points'):''),4.5);
   else if(e.type==='encounter')notify(e.name+' · '+(e.description||'Investigated')+(e.reward?' · +'+e.reward+' stat points':''),5);
   else if(e.type==='checkpointRequested'){if(saveCheckpoint(e.name||'Location',e.policy,e.save,e.id)){growthCheckpointDue=0;checkpointBanner((e.name||'Location')+(checkpointStored?'':' · this tab only'));}}
   else if(e.type==='sanctuaryRested'){if(saveCheckpoint(e.name||'Sanctuary','sanctuary')){growthCheckpointDue=0;checkpointBanner('Rested at '+(e.name||'a sanctuary'));}}
   else if(e.type==='objective')notify('Field study complete: '+e.title+(e.lead?'. It points to '+(e.lead.rare?'a rare place':'an unexplored place')+' to the '+compassWord(e.lead.dx,e.lead.dy)+'.':' · '+rewardText(e)),5,e.lead&&e.lead.rare?2:1);
   else if(e.type==='mutationDropped'){notify('Something glints where it fell: '+tierName(e.tier)+'.',4,2);if(audio&&soundOn)audio.event({type:'checkpoint'});}
   else if(e.type==='mutationUnlocked'){const tier=tierName(e.tier??2),name=e.name||MorphosGame.MUTATIONS[e.key]?.name||'mutation';if(!$('hermitDialog').open)notify((e.upgrade?'Better copy: ':'Found: ')+tier+' '+name+(e.source?' (from the '+String(e.source).replace(/^The /,'').toLowerCase()+')':'')+'.',6,3);if((e.tier??0)>=2){growthCheckpointDue=game.state.time;growthCheckpointLabel='Found '+tier+' '+name;}}
   else if(e.type==='creatureSeen')recordSpecies(e.species);
   else if(e.type==='kill'&&!e.boss){const key=e.species||(e.elite==='lancer'?'lancer':e.kind);recordSpecies(key);collection.species[key].defeated=Math.min(1e9,(collection.species[key].defeated||0)+1);saveCollection();}
   else if(e.type==='speciesSeen'&&!recordSpecies(e.species)){}
   else if(e.type==='speciesSeen')notify('New species: '+e.name+' · '+({common:'Common',uncommon:'Uncommon',rare:'Rare',legendary:'Legendary'})[e.rarity],4.5,e.rarity==='legendary'?3:e.rarity==='rare'?2:1);
   else if(e.type==='legendStirs')notify('The water goes still.',4,3);
   else if(e.type==='herd')notify('Everything is swimming the same way. Away from something.',5,3);
   else if(e.type==='pondEvent'){const dir=compassWord(e.x-e.px,e.y-e.py);notify(e.eventType==='frenzy'?'A feeding frenzy has broken out to the '+dir+'. Rich food, and predators on their way.':e.eventType==='giant'?'Something huge and gentle is drifting in from the '+dir+'.':e.eventType==='migration'?'A jelly migration is drifting through.':'Dark water. Predators can barely see you, and you can barely see them.',6,2);}
   else if(e.type==='pondEventEnd')notify(e.eventType==='frenzy'?'The frenzy is over.':e.eventType==='giant'?'The giant drifts on out of reach.':e.eventType==='migration'?'The migration has passed.':'The water clears.',3.5);
   else if(e.type==='eliteDefeated')notify((e.name||'Elite')+' defeated'+(e.reward>0?' · +'+pointText(e.reward):'')+'. Its genes advance your mutation research.',5);
   else if(e.type==='windup'){/* Movement and sound communicate preparation. */}
   else if(e.type==='exhausted')notify('Exhausted.',3,2);
   else if(e.type==='recovered')notify('Stamina restored. Your abilities are ready.',2.5);
   else if(e.type==='bossLost'){compassMode='auto';notify('You lost '+(e.name||'the hunter')+'. It will come looking again in about '+Math.round((e.rest||120)/60)+' minutes, rested. Use the time to prepare.',8,3);updateUI(true);}
   else if(e.type==='bossInk'){notify((e.name||'It')+' blacks out the water. Keep moving and watch for its eyes.',4,3);}
   else if(e.type==='echo'){if(e.thread!=='fate')notify('“'+e.text+'”',9,2);heardLegend(e.id);}
   else if(e.type==='wonderLine'){notify('“'+e.text+'”',9,2);heardLegend('wonder:'+e.wonder);}
   else if(e.type==='bossAwakened'){const kl=(MorphosGame.KEEPER_LINES||{})[e.bossType];notify((e.name||'An elder')+' awakens.'+(kl?' “'+kl.wake+'”':''),kl?8:5,2);if(kl)heardLegend('wake:'+e.bossType);}
   else if(e.type==='bossPhase')notify((e.name||'The elder')+' is changing its attack pattern.',3);
   else if(e.type==='bossDefeated'){compassMode='auto';{const kl=(MorphosGame.KEEPER_LINES||{})[e.bossType];if(kl){heardLegend('fall:'+e.bossType);notify('“'+kl.fall+'”',8,2);}}if(e.first!==false)victory=e;else notify((e.name||'Elder')+' defeated'+(e.reward>0?' · +'+pointText(e.reward):'')+'. Your existing genome is unchanged.',4);if(saveCheckpoint('Defeated '+(e.name||'an elder'),'victory')&&e.first===false)checkpointBanner('Defeated '+(e.name||'an elder'));}
   else if(e.type==='journeyComplete')journeyWon=true;
   else if(e.type==='bossRetreated')notify('You escaped. The elder will recover before your next attempt.',4);
   else if(e.type==='growthBlocked'){compassMode='elder';notify('Your colony is ready to grow, but '+(game.state.bossEncounter?.name||'an apex predator')+' stands in the way. Defeat it to grow further.',6,3);}
   else if(e.type==='death'){if(coopOn())coopDowned();else finish();}
   else if(e.type==='coopWipe'){if(coopOn()&&performance.now()-coop.restoredAt<6000)game.coop.wiped=false;else respawnTo('The party went down',()=>{coopRestore();return coopOn()&&mode==='playing';});}
   else if(e.type==='friendlyFire'){if(performance.now()-(friendlyAt||0)>4000){friendlyAt=performance.now();notify(((coop&&coop.names[e.peer])||'A friend')+' hit you. Your attacks hurt each other too.',3,2);}}
   else if(e.type==='coopRevived'){notify(((coop&&coop.names[e.peer])||'A friend')+' revived you.',4,3);updateUI(true);}
   else if(e.type==='coopHelped')notify('You revived '+((coop&&coop.names[e.peer])||'your friend')+'.',4,2);
   else if(e.type==='coopSignal'){if(e.kind==='cp'&&coopCheckpoint(typeof e.data==='string'?e.data.slice(0,64):'Checkpoint','','',true))checkpointBanner(typeof e.data==='string'?e.data.slice(0,64):'Checkpoint');}
 }if(game.state.status==='playing'){if(journeyWon){const v=victory,won=game;const end=()=>{if(game!==won||game.state.journeyComplete!==true)return;if(game.state.status!=='playing'){if(game.coop&&game.state.status==='dead')setTimeout(end,1000);return;}if(mode==='playing')finish(true,v);else setTimeout(end,1000);};setTimeout(end,5000);}if(victory)announceVictory(victory);}}
 function announceVictory(e){const p=game.state.player,def=MorphosGame.BOSSES?.[e.bossType]||{},mutation=MorphosGame.MUTATIONS?.[e.mutationKey||def.mutationKey];notify((e.name||def.name||'The apex predator')+' is dead. '+(e.genomeName||def.genomeName||'Its genome')+' joins your lineage'+(mutation?', and you found '+mutation.name:'')+((e.reward||0)>0?'. +'+pointText(e.reward):'')+'.',7,4);updateUI(true);}
 // Screen directions: up is north.
 function compassWord(dx,dy){const a=Math.atan2(dy,dx),names=['east','south-east','south','south-west','west','north-west','north','north-east'];return names[((Math.round(a/(Math.PI/4))%8)+8)%8];}
 function fileMessage(message,error=false){for(const e of document.querySelectorAll('[data-file-status]')){e.textContent=message;e.classList.toggle('error-note',error);}}
 function packLife(reason='Saved life',snapshot=null){
   return{format:'morphos-life',version:saveVersion,savedAt:new Date().toISOString(),checkpointReason:reason,game:snapshot||game.exportSave(),records:{best,guide},seenMutations:[...seenMutations]};
 }
 function updateCheckpointUI(){
   const state=checkpoint?.game?.state,p=state?.player,available=!!p&&p.alive&&state.status==='playing';soloAvailable=available;
   const label=available?(p.cellCountText||p.cellCount)+' '+(p.cellCount===1?'cell':'cells')+' · '+clock(state.time)+' · '+String(checkpoint.checkpointReason||'Checkpoint').slice(0,64):'';
   $('checkpointSummary').textContent=label+(!available?'':checkpointStored?'':' · this tab only');$('checkpointStatus').textContent=available?'Checkpoint: '+label+(checkpointStored?'':' · this tab only, use Save life'):'No checkpoint yet. Grow a cell, investigate a place or rest at a sanctuary.';$('checkpointStatus').title=available?'Checkpoints are set when you grow a cell, investigate a place, rest at a sanctuary or defeat an elder.':'';
   if(coop&&coop.started){let reason='';try{reason=String(JSON.parse(coop.checkpoint||'{}').reason||'');}catch{}$('checkpointStatus').textContent=reason?'Party checkpoint: '+reason.slice(0,64):'No party checkpoint yet.';}
   $('checkpointStatus').title=$('checkpointStatus').textContent;
   updateCheckpointIndicator();
   $('retryCheckpoint').hidden=!available||$('endScreen').dataset.outcome==='victory';
   $('retryCheckpointDetails').hidden=$('retryCheckpoint').hidden;$('retryCheckpointDetails').textContent=available?'Return to '+clock(state.time)+' · '+(p.cellCountText||p.cellCount)+' '+(p.cellCount===1?'cell':'cells')+' · '+Math.ceil(p.hp/p.maxHp*100)+'% health':'';
   
 }
 function updateCheckpointIndicator(){
   const state=checkpoint?.game?.state,rest=game&&MorphosGame.sanctuaryStatus(game.state),indicator=$('autosaveIndicator');
   const saved=state?.player?.alive&&state.status==='playing';
   let label=saved?(checkpointStored?'Checkpoint · ':'Session checkpoint · ')+clock(state.time)+'\n'+String(checkpoint.checkpointReason||'Saved life').slice(0,48):'Unlock a location to save';
   if(rest&&rest.phase==='blocked')label=rest.reason+'\n'+rest.name;else if(rest&&!rest.savedThisVisit)label='Resting · '+Math.ceil(Math.max(0,rest.required-rest.progress))+' s'+'\n'+rest.name;
   if(indicator.textContent!==label)indicator.textContent=label;
   indicator.classList.toggle('resting',!!rest&&!rest.savedThisVisit);indicator.title=saved?$('checkpointStatus').textContent:'New cells, completed places, sanctuary rests and elder victories set checkpoints.';
 }
 function readCheckpoint(){
   try{const text=localStorage.getItem(checkpointKey);if(!text||text.length>8*1024*1024)return;const saved=JSON.parse(text);if(saved.format!=='morphos-life'||![saveVersion,19,18].includes(saved.version))return;const restored=MorphosGame.fromSave(saved.game);if(restored.state.status!=='playing'||!restored.state.player.alive)return;checkpoint=saved;checkpointStored=true;}catch{}
   updateCheckpointUI();
 }
 function checkpointAllows(state,policy='',landmarkId=''){
   const p=state?.player;if(!p||!p.alive||state.status!=='playing')return false;
   if(policy==='initial')return state.time===0&&p.stage===0;
   if(policy==='import')return true;
   if(policy==='location'){const l=state.landmarks.find(l=>l.id===landmarkId);return !state.bossEncounter&&!!l&&l.claimed&&(['bloom','geneCache','nest','sanctuary','carcass','garden','fossil','shell','vault','smoker','sealed','trail','nursery'].includes(l.type)||String(l.type).startsWith('wonder'));}
   if(policy==='sanctum'){const l=state.landmarks.find(l=>l.id===landmarkId);return !state.bossEncounter&&!!l&&l.type==='sanctum'&&state.sanctumArrivalId===l.id;}
   // Growing a cell saves too, but only once nothing is hunting you and you are not badly hurt.
   if(policy==='growth')return !state.bossEncounter&&!MorphosGame.sanctuaryThreat(state)&&p.hp>=p.maxHp*.6;
   if(state.bossEncounter||p.exhausted||p.hp<p.maxHp*.99||p.energy<p.maxEnergy*.99)return false;
   if(policy==='victory')return state.bossLog.some(b=>Math.abs(b.time-state.time)<.1);
   return policy==='sanctuary'&&!!MorphosGame.sanctuaryStatus(state)?.ready;
 }
 let bannerTimer=0,growthCheckpointDue=0,growthCheckpointLabel='';
 function checkpointBanner(text){const b=$('checkpointBanner');$('checkpointBannerText').textContent=text;b.hidden=true;void b.offsetWidth;b.hidden=false;clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>{b.hidden=true;},3300);}
 // A new cell asks for a checkpoint; it is taken as soon as the water around you is safe (within about a minute).
 function tryGrowthCheckpoint(){
   if(!growthCheckpointDue||mode!=='playing'||!game)return;const s=game.state;if(s.time-growthCheckpointDue>75){growthCheckpointDue=0;return;}
   const n=s.player.cellCount||1,due=growthCheckpointDue;growthCheckpointDue=0;
   // Clear the request before saving: saving refreshes the checkpoint display, which must not start another save.
   const label=growthCheckpointLabel||'Grew to '+n+(n===1?' cell':' cells');if(saveCheckpoint(label,'growth')){checkpointBanner(label);growthCheckpointLabel='';}else growthCheckpointDue=due;
 }
 let pendingCheckpoint=null;
 function flushCheckpoint(){if(pendingCheckpoint===null)return;const text=pendingCheckpoint;pendingCheckpoint=null;let obj;try{obj=JSON.parse(text);MorphosGame.fromSave(obj.game);}catch{return;}/* a save that would not load never replaces the last good one */checkpoint=obj;updateCheckpointUI();setTimeout(()=>{if(checkpoint!==obj)return;checkpointStored=false;try{localStorage.setItem(checkpointKey,text);checkpointStored=true;}catch{}updateCheckpointUI();},0);}
 function saveCheckpoint(reason='Checkpoint',policy='',snapshot=null,landmarkId=''){
   // A co-op pond has its own save, and never overwrites your own saved life.
   if(coop)return coopOn()?coopCheckpoint(reason,policy,landmarkId):false;
   if(game&&game.coop)return false;
   if(!game||mode==='menu')return false;const s=snapshot?snapshot.state:game.state;
   if(!checkpointAllows(s,policy,landmarkId))return false;
   try{
     // One pass: turn the live world into text once and store it. Reading it back into the checkpoint object is
     // left for a moment later, so the work is not all inside one animation frame.
     const text=JSON.stringify({format:'morphos-life',version:saveVersion,savedAt:new Date().toISOString(),checkpointReason:reason,game:snapshot||game.saveObject(),records:{best,guide},seenMutations:[...seenMutations]});
     pendingCheckpoint=text;if(typeof requestIdleCallback==='function')requestIdleCallback(flushCheckpoint,{timeout:1500});else setTimeout(flushCheckpoint,60);
     if(audio&&soundOn&&['sanctuary','victory','location','sanctum','growth'].includes(policy))audio.event({type:'checkpoint'});return true;}catch{return false;}
 }
 function restoreLife(raw,message='Life restored. Your world, body and mutations are ready.',resume=false){
   if(!raw||raw.format!=='morphos-life'||![saveVersion,19,18].includes(raw.version)||!raw.game)throw Error('Choose a save file made by this version of MORPHOS.');
   const restored=MorphosGame.fromSave(raw.game),records=validatedRecords(raw.records);
   if(restored.state.status!=='playing'||!restored.state.player.alive)throw Error('That life has already ended. Choose a save from before it ended.');
   // Commit only once every simulation field has passed engine validation.
   coopLeave();closeAllDialogs();clearInput();rewardContext=null;game=restored;lastGrowth=null;growthUnseen=false;latestUnseen=false;treeSelected='';game.drainEvents();seenMutations.clear();lessons.clear();resetSpecimen();
   if(Array.isArray(raw.seenMutations))for(const key of raw.seenMutations.slice(0,30))if(typeof key==='string'&&Object.hasOwn(MorphosGame.MUTATIONS,key))seenMutations.add(key);
   resultRecorded=false;lifeNewDiscoveries=0;accumulator=0;
   best=Math.max(best,records.best);for(const [k,v]of Object.entries(records.guide))if(!guide[k])guide[k]=v;save();refreshRecords();$('seedInput').value=game.state.seed;clearNotices();
   renderer.resetView();
   // After a death, Return to checkpoint drops you straight back into the pond; other loads open paused.
   if(resume){setMode('playing');updateUI(true);fileMessage('');notify('Back at your checkpoint.',2.5);last=performance.now();updateCheckpointUI();return;}
   setMode('paused');updateUI(true);fileMessage(message);
   showSkills();last=performance.now();updateCheckpointUI();
 }
 // The water's level where the colony is, beside its own level. Level N water is made for an N-cell colony.
 let waterShown='',waterWarned=-1,depthReached='',shallowHinted=false;
 function updateWater(){
   const p=game.state.player,zone=MorphosGame.waterLevel(p.x,p.y),level=zone+1,mine=p.stage+1,gap=level-mine,danger=gap>=3?'deep':gap>=1?'above':gap<=-3?'below':'safe',depth=MorphosGame.depthAt(zone).name;
   const text='· '+depth+' · water level '+level,el=$('waterLine');if(text!==waterShown){waterShown=text;const a=document.createElement('span'),b=document.createElement('span');a.className='water-depth';a.textContent=depth+' · ';b.textContent='water level '+level+(zone>=MorphosGame.waterLevel(1e9,0)?' · deepest':'');el.replaceChildren(a,b);}if(el.dataset.danger!==danger)el.dataset.danger=danger;
   if(mode!=='playing')return;
   if(depth!==depthReached){if(depthReached)notify('You have entered '+depth+'. Water level '+level+'.',5,2);depthReached=depth;}
   // One warning each time the colony swims into water well above its own level.
   if(gap>=2&&waterWarned<level){waterWarned=level;notify(gap>=4?'Deep water: level '+level+'. You are level '+mine+'. What lives here is far stronger than you.':'This water is level '+level+', above your level '+mine+'.',6,3);}else if(gap<1)waterWarned=-1;
   // And one hint when it lingers in water far below its level, where there is little left to gain.
   if(gap<=-4&&!shallowHinted){shallowHinted=true;notify('This water is level '+level+', far below your level '+mine+'.',7,2);}else if(gap>-2)shallowHinted=false;
 }
 function restoreCheckpoint(resume=false){
   flushCheckpoint();if(!checkpoint||loadBusy)return;try{restoreLife(checkpoint,'Autosave loaded. Continue when you are ready.',resume===true);}catch(error){fileMessage('This autosave could not be restored. '+String(error.message||error).slice(0,200),true);}
 }
 function downloadLife(){
   if(!game||game.state.status!=='playing')return;
   try{
     const data=packLife(),json=JSON.stringify(data);try{MorphosGame.fromSave(JSON.parse(json).game);}catch{fileMessage('This moment cannot be saved to a file. Try again in a few seconds.',true);return;}
     const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
     const seed=game.state.seed.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,32)||'life';a.download='MORPHOS-'+seed+'-colony-'+(game.state.player.colonyLevel||game.state.player.stage+1)+'.morphos.json';a.href=url;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
     fileMessage('Save file downloaded. Load it here whenever you want to continue.');
   }catch(error){fileMessage('Could not save this life: '+String(error.message||error),true);}
 }
 function chooseLoad(){if(loadBusy)return;if(mode==='playing')pauseGame();$('loadInput').value='';$('loadInput').click();}
 function validatedRecords(records){
   const result={best:0,guide:{}};if(!records||typeof records!=='object')return result;
   if(Number.isSafeInteger(records.best)&&records.best>=0&&records.best<1e15)result.best=records.best;
   const entries=records.guide,valid=v=>v&&typeof v.title==='string'&&typeof v.reason==='string',copy=v=>({title:v.title.slice(0,160),reason:v.reason.slice(0,600)});
   if(entries&&typeof entries==='object'&&!Array.isArray(entries)){for(const t of families)for(const r of ['1','2a','2b','3','4a','4b','5']){const key=t+'-'+r,v=Object.hasOwn(entries,key)?entries[key]:null;if(valid(v))result.guide[key]=copy(v);}
     // Records from before forks: the original rank II and IV are side a.
     for(const t of families)for(const r of ['2','4']){const v=Object.hasOwn(entries,t+'-'+r)?entries[t+'-'+r]:null;if(valid(v)&&!result.guide[t+'-'+r+'a'])result.guide[t+'-'+r+'a']=copy(v);}
     for(const k of Object.keys(MorphosGame.HYBRIDS)){const v=Object.hasOwn(entries,'hybrid-'+k)?entries['hybrid-'+k]:null;if(valid(v))result.guide['hybrid-'+k]=copy(v);}}
   return result;
 }
 async function loadLifeFile(file){
   if(!file||loadBusy)return;loadBusy=true;
   try{
     if(file.size>8*1024*1024)throw Error('That file is too large. Choose a MORPHOS save file.');
     const raw=JSON.parse(await file.text());restoreLife(raw);saveCheckpoint('Imported life','import');
   }catch(error){fileMessage('Could not load that save. '+(error instanceof SyntaxError?'The file is not valid JSON.':String(error.message||error)).slice(0,250),true);}
   finally{loadBusy=false;$('loadInput').value='';}
 }
 function setSound(on){soundOn=on;$('sound').classList.toggle('on',on);$('sound').setAttribute('aria-pressed',String(on));$('sound').setAttribute('aria-label',on?'Disable sound':'Enable sound');$('sound').querySelector('.sound-label').textContent=on?'Sound on':'Sound off';$('pauseSoundIcon').classList.toggle('on',on);$('pauseSoundIcon').setAttribute('aria-label',on?'Sound on':'Sound off');}
 async function startSound(autoplay=false){
   if(!soundOn||failed)return;const attempt=++soundAttempt;
   try{
     audio=audio||new MorphosAudio();const started=await audio.enable();
     if(attempt!==soundAttempt||!soundOn)return;
     if(started===false&&(!autoplay||!audio.context)){setSound(false);notify('Sound could not start. Try clicking Sound again.');}
   }catch{if(attempt===soundAttempt&&soundOn){setSound(false);notify('Audio is unavailable in this browser.');}}
 }
 function toggleSound(){if(soundOn){++soundAttempt;if(audio)audio.disable();setSound(false);}else{setSound(true);void startSound();}}
 function unlockSound(e){
   if(!soundOn||failed||!e.isTrusted)return;
   if(e.target instanceof Element&&e.target.closest('#sound'))return;
   if(e.type==='keydown'&&(e.key.toLowerCase()==='m'||e.repeat||e.ctrlKey||e.metaKey||e.altKey))return;
   if(audio&&audio.enabled&&audio.context?.state==='running')return;
   void startSound();
 }
 // A blocked autoplay attempt stays pending; a real gesture can start a newer attempt.
 document.addEventListener('pointerdown',unlockSound,{capture:true,passive:true});
 document.addEventListener('click',unlockSound,{capture:true,passive:true});
 document.addEventListener('keydown',unlockSound,{capture:true});
 async function fullScreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else notify('Use your browser’s fullscreen command.');}catch{notify('Use your browser’s fullscreen command.');}}
 let qualityUp=0,qualityResize=false;
function resize(){playAreaDirty=true;frozenDrawn=false;if(renderer)renderer.resize(innerWidth,innerHeight,Math.min(devicePixelRatio||1,1.5)*pixelScale);}
 function measurePlayArea(){
   const visibleRect=element=>{if(!element||element.hidden)return null;const style=getComputedStyle(element);if(style.display==='none'||style.visibility==='hidden')return null;const r=element.getBoundingClientRect();return r.width&&r.height?r:null;};
   const short=innerHeight<=620&&innerWidth>=620,padding=short||innerWidth<=760?10:14;
   const upper=[document.querySelector('.topbar'),$('vitals'),document.querySelector('.stage-panel'),document.querySelector('.score-panel'),$('bossHUD')].map(visibleRect).filter(Boolean);
   let top=Math.max(54,...upper.map(r=>r.bottom+padding)),bottom=innerHeight-padding;
   const touchLayout=document.body.dataset.input==='touch',controls=touchLayout?null:visibleRect(document.querySelector('.control-cluster'));if(touchLayout)bottom=Math.min(bottom,innerHeight-(innerHeight<=480?150:200));if(controls){bottom=Math.min(bottom,controls.top-padding);$('touchPad').style.bottom=(innerHeight-controls.top+12)+'px';$('zoomFeedback').style.bottom=(innerHeight-controls.top+12)+'px';}
   top=Math.min(top,innerHeight-90);bottom=Math.max(top+64,bottom);playArea={left:padding,top,width:innerWidth-padding*2,height:Math.min(innerHeight-padding,bottom)-top};playAreaDirty=false;
 }
 function setViewZoom(value){
   viewZoom=clamp(value,.85,1.20);zoomNoticeTime=2.6;
   $('zoomFeedback').textContent='Zoom '+Math.round(viewZoom*100)+'% · 0 to reset'+(game.state.bossEncounter?' · Adaptive in combat':'');
   $('zoomFeedback').hidden=false;
 }
 canvas.addEventListener('wheel',e=>{
   if(mode!=='playing'||e.ctrlKey||e.metaKey||e.altKey||!Number.isFinite(e.deltaY)||e.deltaY===0||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
   e.preventDefault();const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);
   setViewZoom(viewZoom*Math.exp(-clamp(pixels,-120,120)*.0005));
 },{passive:false});
 function pointerAt(e){const r=canvas.getBoundingClientRect();pointer.x=e.clientX-r.left;pointer.y=e.clientY-r.top;pointer.active=true;pointer.aimed=true;}
 // Mouse chords emit pointermove for additional button presses and partial releases.
 let mouseHeld=0;
 function mouseKeys(buttons){
   for(const [name,bit] of Object.entries(MOUSE_KEYS)){const down=!!(buttons&bit),was=!!(mouseHeld&bit);if(down===was)continue;
     if(down)mouseHeld|=bit;else mouseHeld&=~bit;if(!actionFor(name))continue;
     document.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key:name}));}
 }
 function syncPointerButtons(e){
   if(pointer.id!==e.pointerId)return;const attack=!!(e.buttons&1);
   if(attack&&!pointer.held)pendingPulse=true;pointer.held=attack;mouseKeys(e.buttons);const right=!!(e.buttons&2)&&!actionFor('rmb');if(mouseAimOnly){if(right&&!pointer.blocking)pendingBlock=true;pointer.blocking=right;blockButtonHeld=right;sprintPointer=false;}else sprintPointer=right;
 }
 function beginPointer(e){
   pointer.id=e.pointerId;pointer.held=!!(e.buttons&1)&&e.button!==0;pointerAt(e);syncPointerButtons(e);canvas.setPointerCapture(e.pointerId);e.preventDefault();
 }
 function endPointer(e){
   if(pointer.id!==e.pointerId)return;pointer.id=null;pointer.held=sprintPointer=false;mouseKeys(0);if(pointer.blocking){pointer.blocking=false;blockButtonHeld=false;}
   if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
 }
 canvas.addEventListener('pointerdown',e=>{if(mode!=='playing')return;// On touch screens the pond itself is not a button: attacks come only from the Strike and ability buttons.
   if(e.pointerType==='touch'){e.preventDefault();return;}if(e.button>=0&&e.button<=4)beginPointer(e);});
 canvas.addEventListener('pointermove',e=>{if(mode==='playing'&&e.pointerType!=='touch'&&pointer.id!==e.pointerId)pointerAt(e);});
 // Reserve the secondary mouse button over every live game control, including the HUD.
 document.addEventListener('pointerdown',e=>{if(mode==='playing'&&e.pointerType!=='touch'&&e.button>=1&&e.button<=4&&!readingForm(e.target)){beginPointer(e);e.stopPropagation();}else if(mode!=='playing'&&!capturing&&e.pointerType!=='touch'&&MOUSE_BY_BUTTON[e.button]&&['research','pause','body','navigate'].includes(actionFor(MOUSE_BY_BUTTON[e.button]))){e.preventDefault();document.dispatchEvent(new KeyboardEvent('keydown',{key:MOUSE_BY_BUTTON[e.button]}));}},{capture:true});
 // The middle button would start page scrolling and the side buttons would go Back and Forward: not while playing or choosing controls.
 const heldBack=new Set();for(const type of ['mousedown','mouseup','auxclick'])document.addEventListener(type,e=>{if(e.button>=1&&e.button<=4&&!readingForm(e.target)&&((mode==='playing'||capturing)||(type!=='mousedown'&&heldBack.has(e.button)))){e.preventDefault();if(type==='mousedown')heldBack.add(e.button);else if(type==='auxclick'||e.button<3)heldBack.delete(e.button);}},{capture:true});
 document.addEventListener('pointermove',e=>{
   if(mode!=='playing')return;
   if(pointer.id===e.pointerId){if(e.pointerType!=='touch')pointerAt(e);syncPointerButtons(e);}
   else if(e.pointerType!=='touch'&&e.button>=1&&e.button<=4&&(e.buttons&30)&&!readingForm(e.target)){beginPointer(e);e.stopPropagation();}
 },{capture:true});
 document.addEventListener('pointerup',e=>{if(pointer.id!==e.pointerId)return;syncPointerButtons(e);if(!e.buttons)endPointer(e);},{capture:true});
 document.addEventListener('pointercancel',endPointer,{capture:true});canvas.addEventListener('lostpointercapture',endPointer);
 // Keep release-time menus suppressed even if a growth or pause dialog has just opened.
 document.addEventListener('contextmenu',e=>{if(!readingForm(e.target))e.preventDefault();},{capture:true});
 const pad=$('touchPad');
 const touchUI=()=>document.body.dataset.input==='touch';
 // Touch or mouse-and-keyboard layout: guessed from the device at start, then follows whatever was used last.
 function setInputMode(next){
   if(document.body.dataset.input===next)return;document.body.dataset.input=next;playAreaDirty=true;
   $('touchPad').style.bottom='';$('zoomFeedback').style.bottom='';if(next==='mouse'&&touch.active){touch.active=false;touch.x=touch.y=0;touch.id=null;padRelease();}
 }
 // Safari on iPad and iPhone: never zoom the page. A pinch (Safari's own gesture events) or a two-finger drag could
 // zoom into the joystick corner, and the joystick ignores gestures, so there was no way to pinch back out.
 for(const name of ['gesturestart','gesturechange','gestureend'])document.addEventListener(name,e=>e.preventDefault(),{passive:false});
 document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault();},{passive:false});
 setInputMode(matchMedia('(pointer:coarse)').matches||(navigator.maxTouchPoints>0&&!matchMedia('(hover:hover)').matches)?'touch':'mouse');
 document.addEventListener('pointerdown',e=>setInputMode(e.pointerType==='mouse'?'mouse':'touch'),{capture:true,passive:true});
 document.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&(Math.abs(e.movementX)+Math.abs(e.movementY))>2)setInputMode('mouse');},{capture:true,passive:true});
 document.addEventListener('keydown',e=>{if(!e.repeat&&e.key!=='Enter'&&e.key!==' ')setInputMode('mouse');},{capture:true,passive:true});
 // A floating thumbstick: the stick base jumps to where the thumb lands, and the drag from there steers.
 function padMove(e){if(e.pointerId!==touch.id)return;const radius=touch.radius||42,x=(e.clientX-touch.ox)/radius,y=(e.clientY-touch.oy)/radius,m=Math.max(1,Math.hypot(x,y));touch.x=Math.abs(x)+Math.abs(y)<.12?0:x/m;touch.y=Math.abs(x)+Math.abs(y)<.12?0:y/m;pad.style.setProperty('--jx',(touch.x*radius)+'px');pad.style.setProperty('--jy',(touch.y*radius)+'px');}
 function padRelease(){const base=$('stickBase');base.style.left=base.style.top='';base.classList.remove('held');}
 pad.addEventListener('pointerdown',e=>{if(mode!=='playing')return;if(touch.id!==null&&!pad.hasPointerCapture(touch.id))touch.id=null;if(touch.id!==null)return;e.preventDefault();touch.active=true;touch.id=e.pointerId;pointer.active=false;try{pad.setPointerCapture(e.pointerId);}catch{}
   const base=$('stickBase');if(document.body.dataset.input==='touch'){const r=pad.getBoundingClientRect(),size=base.offsetWidth||120;base.style.left=(e.clientX-r.left-size/2)+'px';base.style.top=(e.clientY-r.top-size/2)+'px';base.classList.add('held');touch.ox=e.clientX;touch.oy=e.clientY;touch.radius=size*.38;}else{const r=pad.getBoundingClientRect();touch.ox=r.left+r.width/2;touch.oy=r.top+r.height/2;touch.radius=r.width*.38;}padMove(e);});
 pad.addEventListener('pointermove',padMove);
 for(const name of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(name,e=>{if(e.pointerId!==touch.id)return;touch.active=false;touch.x=touch.y=0;touch.id=null;pad.style.setProperty('--jx','0px');pad.style.setProperty('--jy','0px');padRelease();if(pad.hasPointerCapture(e.pointerId))pad.releasePointerCapture(e.pointerId);});
 function readingForm(target){return target instanceof HTMLElement&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName));}
 document.addEventListener('keydown',e=>{
   if(e.ctrlKey||e.metaKey||e.altKey||readingForm(e.target))return;const key=e.key.toLowerCase();
   if(mode==='evolving'&&activeDialog==='skillsDialog'){
     if(key===bindings.body&&!e.repeat){e.preventDefault();e.stopPropagation();showSkills();return;}
     if(key===' '||key==='enter'){
       if(e.target instanceof Element&&e.target.closest('button')?.id!=='skillsBack'&&e.target.closest('button'))return;
       e.preventDefault();e.stopPropagation();if(!e.repeat)continueEvolution();
     }return;
   }
   // The key that opens the menu also closes it.
   if(mode==='paused'&&activeDialog==='skillsDialog'&&!capturing&&!e.repeat&&['research','pause','body'].includes(actionFor(key))){e.preventDefault();e.stopPropagation();resumeGame();return;}
   if(mode==='paused'&&activeDialog==='skillsDialog'&&!capturing&&!e.repeat&&actionFor(key)==='navigate'){e.preventDefault();e.stopPropagation();if(buildTab==='map')resumeGame();else selectBuildTab('map');return;}
   if(document.querySelector('dialog[open]'))return;
   if(e.target instanceof HTMLElement&&e.target.tagName==='BUTTON'&&(key==='enter'||(mode!=='playing'&&key===' ')))return;
   const act=actionFor(key);
   if(key===' '||key.startsWith('arrow')||(act&&mode==='playing'))e.preventDefault();
   if(act==='sound'&&!e.repeat){toggleSound();return;}if(act==='fullscreen'&&!e.repeat){fullScreen();return;}if(key==='?'&&!e.repeat){showHelp();return;}
   if(mode!=='playing')return;
   if(!act&&['+','=','-','0'].includes(key)){e.preventDefault();setViewZoom(key==='0'?1:viewZoom+(key==='-'?-.05:.05));return;}
   if(act==='body'&&!e.repeat){showSkills();return;}
   if(act==='research'&&!e.repeat){showResearch();return;}
   if(act==='navigate'&&!e.repeat){openMap();return;}
   keys.add(key);if((act==='pause'||key==='escape')&&!e.repeat){e.preventDefault();pauseGame();return;}
   if(act==='strike'&&!e.repeat)pendingPulse=true;
   if(act==='block'&&!e.repeat)pendingBlock=true;
   if(act==='sneak'&&!e.repeat)sneakDown('key');
   if(families.includes(act)&&!e.repeat)queueAbility(act);
 });
 document.addEventListener('keyup',e=>{const key=e.key.toLowerCase();if(actionFor(key)==='sneak')sneakUp('key');if(key===' '&&mode==='playing')e.preventDefault();keys.delete(key);if(['up','down','left','right'].includes(actionFor(key)))pointer.active=false;});
 document.addEventListener('click',e=>{if(e.detail>0&&e.target instanceof Element){const b=e.target.closest('button');if(b&&!b.closest('dialog'))b.blur();}});
 $('start').addEventListener('click',()=>{if(soloAvailable)showPanel('soloDialog');else startLife();});$('soloNew').addEventListener('click',()=>{const saved=savedProgress();if(saved)confirmThen('Start a new life?','Your saved life ('+saved+') will be replaced.','New life',()=>startLife(),'Cancel');else startLife();});$('shuffleSeed').addEventListener('click',()=>{$('seedInput').value=chooseSeed();game=new MorphosGame(safeSeed());});
 $('homeResume').addEventListener('click',restoreCheckpoint);$('retryCheckpoint').addEventListener('click',()=>respawnTo('',()=>{restoreCheckpoint(true);return mode==='playing';}));$('continue').addEventListener('click',continueExploring);
 $('respecStats').addEventListener('click',()=>{if(typeof game.refundAttributes==='function'&&game.refundAttributes()){consumeEvents();renderSkills();updateUI(true);($('skillsGrid').querySelector('button:not(:disabled)')||$('statsPanel')).focus({preventScroll:true});notify('Core stat points refunded. Choose a new direction for this body.',4,2);}});
 for(const button of $('journeySteps').children)button.addEventListener('click',()=>{journalTab='elders';selectedElder=button.dataset.elder;showJournal();});
 $('sound').addEventListener('click',toggleSound);$('pauseSoundIcon').addEventListener('click',toggleSound);$('pauseFullscreenIcon').addEventListener('click',fullScreen);$('fullscreen').addEventListener('click',fullScreen);$('pause').addEventListener('click',pauseGame);
 $('help').addEventListener('click',showHelp);$('homeHelp').addEventListener('click',showHelp);// Pause menu: the less frequent actions, one click away.
 function setPauseMenu(open){$('pauseMenuList').hidden=!open;$('pauseMenuToggle').setAttribute('aria-expanded',String(open));if(open)$('pauseMenuList').querySelector('button').focus({preventScroll:true});}
 $('pauseMenuToggle').addEventListener('click',e=>{e.stopPropagation();setPauseMenu($('pauseMenuList').hidden);});
 $('pauseMenuList').addEventListener('click',()=>setPauseMenu(false));
 document.addEventListener('click',e=>{if(!$('pauseMenuList').hidden&&!e.target.closest('.pause-menu-wrap'))setPauseMenu(false);});
 $('skillsDialog').addEventListener('cancel',e=>{if(!$('pauseMenuList').hidden){e.preventDefault();setPauseMenu(false);$('pauseMenuToggle').focus({preventScroll:true});}});
$('pauseHelp').addEventListener('click',showHelp);
 $('journal').addEventListener('click',showJournal);$('homeJournal').addEventListener('click',showJournal);$('pauseJournal').addEventListener('click',showJournal);
 $('skillsTool').addEventListener('click',showSkills);
 $('nextAdaptation').addEventListener('click',()=>showSkills(game.state.pendingChoice?'evolution':'stats'));$('quickNavigation').addEventListener('click',()=>{openMap();});$('miniMapButton').addEventListener('click',()=>{openMap();});$('skillBalance').addEventListener('click',()=>selectBuildTab('stats'));$('skillBalance').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectBuildTab('stats');}});const hermitAct=f=>{if(game&&f()){ckLast.hermit=null;ckLast.tasks=null;updateUI(true);}};$('hermitAccept').addEventListener('click',()=>openHermit());$('hermitClaim').addEventListener('click',()=>hermitAct(()=>game.claimTask()));$('hermitDrop').addEventListener('click',()=>hermitAct(()=>{const h=game.hermitHere();return h&&h.task&&game.dropTask(h.task.target);}));$('gameUI').append($('quickNavigation'));
 for(const [id,target] of [['navExplore','explore'],['navSanctuary','sanctuary'],['navElder','elder']])$(id).addEventListener('click',()=>{compassMode=target;updateExpedition();drawPondMap();});
 // Both exits throw work away (Restart even overwrites the checkpoint), so each asks first. Cancel returns to the pause screen.
 let confirmAction=null;
 function confirmThen(title,text,label,action,cancelLabel='Keep playing'){confirmAction=action;$('confirmCancel').textContent=cancelLabel;$('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmGo').textContent=label;showPanel('confirmDialog');$('confirmCancel').focus({preventScroll:true});}
 // What a stored checkpoint would lose, e.g. "32 cells · 12:04"; empty when it is just a fresh start.
 function savedProgress(){const s=checkpoint?.game?.state,p=s?.player;if(!s||!p||s.status!=='playing'||(!(p.stage>0)&&(s.time||0)<15))return '';return (p.cellCountText||p.cellCount)+' '+(p.cellCount===1?'cell':'cells')+' · '+clock(s.time||0);}
 $('confirmGo').addEventListener('click',()=>{const a=confirmAction;confirmAction=null;if(a)a();});
 $('restart').addEventListener('click',()=>confirmThen('Restart this world?','This life ends and its checkpoint is replaced. You begin again as a single cell in the same pond ('+game.state.seed+').','Restart world',()=>startLife(game.state.seed)));
 $('pauseMenu').addEventListener('click',()=>confirmThen('Leave for the main menu?',checkpoint?'You can continue from your last checkpoint on the main menu. Anything since then is lost.':'This life has no checkpoint yet, so leaving ends it.','Main menu',returnHome));
 $('again').addEventListener('click',()=>{const saved=savedProgress();if(saved)confirmThen('Begin another life?','Your checkpoint ('+saved+') will be replaced, so you could no longer return to it.','Another life',()=>startLife(chooseSeed()),'Cancel');else startLife(chooseSeed());});$('endMenu').addEventListener('click',returnHome);
 $('skillsBack').addEventListener('click',()=>{if(mode==='evolving')continueEvolution();else $('skillsDialog').close();});
 $('skillsDialog').addEventListener('cancel',e=>{if(mode==='evolving'){e.preventDefault();continueEvolution();}});
 $('saveLife').addEventListener('click',downloadLife);// Loading replaces the life in play (and the checkpoint), so it asks first whenever there is something to lose.
 function confirmLoad(){const live=mode!=='menu'&&game?.state.status==='playing',saved=savedProgress();
   if(!live&&!saved){chooseLoad();return;}
   confirmThen('Load a saved life?',(live?'The life you are playing':'Your saved life ('+saved+')')+' will be replaced by the one you load, along with its checkpoint.','Choose a file',()=>{$('confirmDialog').close();chooseLoad();},'Cancel');}
 $('loadLife').addEventListener('click',confirmLoad);$('homeLoad').addEventListener('click',confirmLoad);$('loadInput').addEventListener('change',e=>loadLifeFile(e.target.files?.[0]));
 $('blockButton').addEventListener('pointerdown',e=>{if(mode==='playing'&&e.button===0){e.preventDefault();blockButtonHeld=true;pendingBlock=true;try{$('blockButton').setPointerCapture(e.pointerId);}catch{}}});
 for(const ev of ['pointerup','pointercancel','lostpointercapture','blur'])$('blockButton').addEventListener(ev,()=>{blockButtonHeld=false;});
 $('blockButton').addEventListener('keydown',e=>{if(mode==='playing'&&e.key==='Enter'){e.preventDefault();e.stopPropagation();blockButtonHeld=true;if(!e.repeat)pendingBlock=true;}});
 $('blockButton').addEventListener('keyup',e=>{if(e.key==='Enter'){e.preventDefault();blockButtonHeld=false;}});
 $('blockButton').addEventListener('click',e=>{if(mode==='playing'&&e.detail===0)pendingBlock=true;});
 let strikePress=null;function strikeAimPoint(v){const p=game.state.player,m=Math.hypot(v.dx,v.dy)||1;return{x:p.x+v.dx/m*250,y:p.y+v.dy/m*250};}
 $('pulseButton').addEventListener('pointerdown',e=>{if(mode==='playing'&&e.button===0){e.preventDefault();try{$('pulseButton').setPointerCapture(e.pointerId);}catch{}
   if(e.pointerType==='touch'){const r=$('pulseButton').getBoundingClientRect();strikePress={id:e.pointerId,cx:r.left+r.width/2,cy:r.top+r.height/2,dx:0,dy:0,dragged:false};}
   pendingPulse=true;keys.add('abilityPulse');}});
 $('pulseButton').addEventListener('pointermove',e=>{const v=strikePress;if(!v||v.id!==e.pointerId)return;v.dx=e.clientX-v.cx;v.dy=e.clientY-v.cy;if(!v.dragged&&Math.hypot(v.dx,v.dy)>18)v.dragged=true;});
 $('pulseButton').addEventListener('pointerup',e=>{const v=strikePress;if(!v||v.id!==e.pointerId)return;strikePress=null;keys.delete('abilityPulse');});
 for(const ev of ['pointercancel','lostpointercapture'])$('pulseButton').addEventListener(ev,e=>{if(strikePress&&strikePress.id===e.pointerId)strikePress=null;});
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])$('pulseButton').addEventListener(ev,()=>keys.delete('abilityPulse'));
 $('pulseButton').addEventListener('keydown',e=>{if(mode==='playing'&&e.key==='Enter'){e.preventDefault();e.stopPropagation();keys.add('abilityPulse');if(!e.repeat)pendingPulse=true;}});
 $('pulseButton').addEventListener('keyup',e=>{if(e.key==='Enter'){e.preventDefault();keys.delete('abilityPulse');}});$('pulseButton').addEventListener('blur',()=>keys.delete('abilityPulse'));
 $('pulseButton').addEventListener('click',e=>{if(mode==='playing'&&e.detail===0)pendingPulse=true;});
 $('dashButton').addEventListener('pointerdown',e=>{if(mode!=='playing'||e.button!==0)return;e.preventDefault();sprintButtonHeld=true;try{$('dashButton').setPointerCapture(e.pointerId);}catch{}});
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])$('dashButton').addEventListener(ev,()=>{sprintButtonHeld=false;});
 $('dashButton').addEventListener('keydown',e=>{if(mode==='playing'&&e.key==='Enter'){e.preventDefault();sprintButtonHeld=true;}});$('dashButton').addEventListener('keyup',e=>{if(e.key==='Enter'){e.preventDefault();sprintButtonHeld=false;}});$('dashButton').addEventListener('blur',()=>{sprintButtonHeld=false;});
 // Sneak works the same on every input (R20): hold = sneak while held; a quick tap (<0.25 s) latches it on; any press
 // while latched releases it. Sources: the touch button (pointer id), the bound key ('key') and controller RB ('pad').
 function sneakDown(id){if(mode!=='playing')return;if(sneakToggle){sneakToggle=false;sneakPress=null;return;}sneakPress={id,at:performance.now()};}
 function sneakUp(id,released=true){if(!sneakPress||sneakPress.id!==id)return;if(released&&performance.now()-sneakPress.at<250&&mode==='playing')sneakToggle=true;sneakPress=null;}
 // Touch uses pointer events, not click: iOS Safari drops click while another finger is on the stick.
 $('sneakButton').addEventListener('pointerdown',e=>{if(mode!=='playing'||e.button!==0)return;e.preventDefault();sneakDown(e.pointerId);if(sneakPress)try{$('sneakButton').setPointerCapture(e.pointerId);}catch{}});
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])$('sneakButton').addEventListener(ev,e=>sneakUp(e.pointerId,ev==='pointerup'));
 $('sneakButton').addEventListener('click',e=>{if(mode==='playing'&&e.detail===0)sneakToggle=!sneakToggle;});
 for(const trait of families){const b=$('ability-'+trait);b.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();
     // Venom volley and Pounce on touch: a tap fires the way the cell faces; press and drag (or hold) to aim, release to fire. Other organs act around the cell, so they fire at once.
     if((trait==='predator'||trait==='venomist')&&e.pointerType==='touch'&&mode==='playing'){const r=b.getBoundingClientRect();venomPress={trait,id:e.pointerId,cx:r.left+r.width/2,cy:r.top+r.height/2,at:performance.now(),dx:0,dy:0,dragged:false};try{b.setPointerCapture(e.pointerId);}catch{}return;}
     queueAbility(trait);});
   b.addEventListener('click',e=>{if(e.detail===0)queueAbility(trait);});}
 for(const aimed of ['predator','venomist']){
 $('ability-'+aimed).addEventListener('pointermove',e=>{if(!venomPress||venomPress.id!==e.pointerId)return;venomPress.dx=e.clientX-venomPress.cx;venomPress.dy=e.clientY-venomPress.cy;if(Math.hypot(venomPress.dx,venomPress.dy)>16)venomPress.dragged=true;});
 $('ability-'+aimed).addEventListener('pointerup',e=>{if(!venomPress||venomPress.id!==e.pointerId)return;const v=venomPress;venomPress=null;if(mode!=='playing')return;abilityAim=venomAimPoint(v);queueAbility(v.trait);});
 for(const ev of ['pointercancel','lostpointercapture'])$('ability-'+aimed).addEventListener(ev,e=>{if(venomPress&&venomPress.id===e.pointerId&&ev==='pointercancel')venomPress=null;});}
 // Where a Venom press points: the drag direction once the thumb has slid off the button's centre, otherwise straight ahead.
 function venomAimPoint(v){const p=game.state.player;if(v.dragged&&Math.hypot(v.dx,v.dy)>16){const m=Math.hypot(v.dx,v.dy);return{x:p.x+v.dx/m*250,y:p.y+v.dy/m*250};}return{x:p.x+Math.cos(p.angle)*250,y:p.y+Math.sin(p.angle)*250};}
 $('homeControls').addEventListener('click',showControls);$('pauseControls').addEventListener('click',showControls);$('helpControlsEdit').addEventListener('click',showControls);
 // Two-step reset: the first press arms it for 4 s, the second press resets (custom keys would otherwise vanish on one stray click).
 $('controlsReset').addEventListener('click',()=>{const b=$('controlsReset'),custom=mouseAimOnly||Object.keys(DEFAULT_BINDINGS).some(k=>bindings[k]!==DEFAULT_BINDINGS[k]);if(custom&&!b.dataset.armed){b.dataset.armed='1';b.textContent='Press again to reset all keys';clearTimeout(b._t);b._t=setTimeout(()=>{delete b.dataset.armed;b.textContent='Reset to defaults';},4000);return;}delete b.dataset.armed;clearTimeout(b._t);b.textContent='Reset to defaults';bindings={...DEFAULT_BINDINGS};mouseAimOnly=false;saveMouseMode();capturing='';saveBindings();applyBindingLabels();renderControls();$('controlsStatus').textContent='Controls reset to the defaults.';});
 // One tap to a twin-stick keyboard layout: WASD swims, 1–5 use the organs, the mouse only aims. Starts from the defaults so no key clashes.
 $('controlsWasd').hidden=true;
 // While a control is waiting for a key, the next key press is the new binding (swapping with any control that already had it).
 function bindCaptured(key){const name=BINDING_NAMES[capturing];if(key==='escape'){capturing='';$('controlsStatus').textContent='';renderControls();return;}
   if(key==='backspace'){bindings[capturing]='';$('controlsStatus').textContent=name+' has no key now.';}
   else if(RESERVED_KEYS.includes(key)||['control','meta','alt'].includes(key)){$('controlsStatus').textContent=keyName(key)+' is kept for the game itself. Choose another key.';return;}
   else{const other=actionFor(key);if(other&&other!==capturing){bindings[other]=bindings[capturing];$('controlsStatus').textContent=name+' is now '+keyName(key)+'. '+BINDING_NAMES[other]+' took '+(keyName(bindings[other])||'no key')+'.';}else $('controlsStatus').textContent=name+' is now '+keyName(key)+'.';bindings[capturing]=key;}
   if(key==='rmb')$('controlsStatus').textContent+=mouseAimOnly?' Right click no longer blocks; C still does.':' Right click no longer swims fast'+(bindings.fastSwim?'; '+keyName(bindings.fastSwim)+' still does.':'. Give Fast swim a key if you want it.');
   capturing='';saveBindings();applyBindingLabels();renderControls();}
 $('controlsDialog').addEventListener('keydown',e=>{if(!capturing)return;e.preventDefault();e.stopPropagation();bindCaptured(e.key.toLowerCase());},true);
 $('controlsDialog').addEventListener('pointerdown',e=>{if(!capturing||!MOUSE_BY_BUTTON[e.button])return;e.preventDefault();e.stopPropagation();bindCaptured(MOUSE_BY_BUTTON[e.button]);},true);
 $('controlsDialog').addEventListener('cancel',e=>{if(capturing){e.preventDefault();capturing='';$('controlsStatus').textContent='';renderControls();}});
 applyBindingLabels();
  $('mutationLoadout').addEventListener('click',()=>{selectBuildTab('mutations');$('buildMutationsTab').focus({preventScroll:true});});$('compassToggle').addEventListener('click',()=>{compassMode=$('compassToggle').dataset.track==='true'?'explore':'elder';updateExpedition();});$('genomeStatus').addEventListener('click',()=>{compassMode='elder';updateExpedition();notify(game.state.bossEncounter?'Tracking '+game.state.bossEncounter.name+'. The arrow points to it.':'Nothing is hunting you yet.',4);});
 $('sanctuaryTrack').addEventListener('click',()=>{compassMode=compassMode==='sanctuary'?'explore':'sanctuary';updateExpedition();});
 {const body=$('mapPanelBody'),nav=$('navigationDialog'),fig=nav.querySelector('.pond-map'),side=document.createElement('div');side.className='map-side';side.append(nav.querySelector('.navigation-modes'),nav.querySelector('.expedition-panel'));fig.insertAdjacentHTML('afterbegin','<div class="map-zoom"><button type="button" id="mapZoomIn" aria-label="Zoom in">+</button><button type="button" id="mapZoomOut" aria-label="Zoom out">−</button><button type="button" id="mapCentre" aria-label="Centre on you">◎</button></div>');body.append(fig,side);} {const cv=$('pondMap'),pts=new Map();let pinch=0,redraw=0;const draw=()=>{if(!redraw)redraw=requestAnimationFrame(()=>{redraw=0;drawPondMap();});};
  const zoomAt=(f,cx,cy)=>{const box=cv.getBoundingClientRect(),z0=mapView.zoom,z1=clamp(z0*f,.4,24),span=mapView.span||3000,k0=box.width/2/span*z0,k1=box.width/2/span*z1,dx=cx-box.left-box.width/2,dy=cy-box.top-box.height/2;mapView.x+=dx/k0-dx/k1;mapView.y+=dy/k0-dy/k1;mapView.zoom=z1;draw();};
  cv.addEventListener('wheel',e=>{e.preventDefault();zoomAt(Math.exp(-e.deltaY*.0015),e.clientX,e.clientY);},{passive:false});
  cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);pts.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pts.size===2){const [a,b]=[...pts.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y);}});
  cv.addEventListener('pointermove',e=>{const was=pts.get(e.pointerId);if(!was)return;const now={x:e.clientX,y:e.clientY};pts.set(e.pointerId,now);const box=cv.getBoundingClientRect(),k=box.width/2/(mapView.span||3000)*mapView.zoom;
    if(pts.size===1){mapView.x-=(now.x-was.x)/k;mapView.y-=(now.y-was.y)/k;draw();}else if(pts.size===2){const [a,b]=[...pts.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch>0)zoomAt(d/pinch,(a.x+b.x)/2,(a.y+b.y)/2);pinch=d;}});
  const up=e=>{pts.delete(e.pointerId);pinch=0;};cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);cv.style.touchAction='none';
  $('mapZoomIn').addEventListener('click',()=>{const b=cv.getBoundingClientRect();zoomAt(1.5,b.left+b.width/2,b.top+b.height/2);});$('mapZoomOut').addEventListener('click',()=>{const b=cv.getBoundingClientRect();zoomAt(1/1.5,b.left+b.width/2,b.top+b.height/2);});$('mapCentre').addEventListener('click',()=>{mapView.x=mapView.y=0;mapView.zoom=1;draw();});
  addEventListener('resize',()=>{if(activeDialog==='skillsDialog'&&buildTab==='map')draw();});}
 wireTabs(buildTabs,()=>buildTab,selectBuildTab);
 wireTabs(guideTabs,()=>journalTab,tab=>{journalTab=tab;setTabGroup(guideTabs,tab);});
 wireTabs(helpTabs,()=>helpTab,tab=>{helpTab=tab;setTabGroup(helpTabs,tab);});
 for(const id of ['navigationResearch'])$(id).addEventListener('click',showResearch);

   $('previewReplacement').addEventListener('change',()=>{previewReplacement=Number($('previewReplacement').value)||0;syncSpecimen();});
 $('mutationAction').addEventListener('click',()=>{const key=selectedMutation;if(game.equipMutation(key)){previewMode='current';consumeEvents();renderSkills();updateUI(true);if(!$('mutationAction').disabled)$('mutationAction').focus({preventScroll:true});else $('mutationsGrid').querySelector('[data-mutation-choice="'+key+'"]').focus({preventScroll:true});}});
 $('reload').addEventListener('click',()=>location.reload());
 for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',()=>{if(b.closest('dialog').id==='skillsDialog'&&mode==='evolving')continueEvolution();else b.closest('dialog').close();});
 for(const d of document.querySelectorAll('dialog')){
   if(d.id!=='evolution')d.addEventListener('close',()=>backFromDialog(d.id));
   d.addEventListener('click',e=>{if(e.target!==d||d.hasAttribute('data-persistent'))return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});
 }
 window.addEventListener('resize',resize);window.addEventListener('scroll',()=>{if(scrollX||scrollY)scrollTo(0,0);},{passive:true});window.addEventListener('orientationchange',()=>{resize();setTimeout(resize,250);setTimeout(resize,700);});if(window.visualViewport)visualViewport.addEventListener('resize',resize);document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');resize();});
 window.addEventListener('blur',()=>{clearInput();if(mode==='playing')pauseGame();});
 // Version check: the browser may keep an old copy of this page for a while. Ask the server (bypassing every cache)
 // which version is current, and offer a reload when this copy is older. No data is sent; only the page is fetched.
 const pageVersion=(document.title.match(/v(\d+)\.(\d+)/)||[]).slice(1).map(Number);let versionCheckedAt=0;
 async function checkForUpdate(){
   if(!pageVersion.length||!location.protocol.startsWith('http')||performance.now()-versionCheckedAt<5*60000&&versionCheckedAt)return;versionCheckedAt=performance.now();
   try{const r=await fetch(location.pathname+'?check='+Date.now(),{cache:'no-store'});if(!r.ok)return;const m=(await r.text()).match(/<title>[^<]*v(\d+)\.(\d+)/);if(!m)return;
     const live=[+m[1],+m[2]],newer=live[0]>pageVersion[0]||live[0]===pageVersion[0]&&live[1]>pageVersion[1];if(!newer)return;
     $('updateBannerText').textContent='v'+live.join('.')+' · Tap to reload. Your checkpoint is kept.';$('updateBanner').dataset.v=live.join('.');$('updateBanner').hidden=false;}catch{}
 }
 $('updateBanner').addEventListener('click',()=>{location.replace(location.pathname+'?v='+($('updateBanner').dataset.v||Date.now()));});
 setTimeout(checkForUpdate,3000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkForUpdate();});
 document.addEventListener('visibilitychange',()=>{frozenDrawn=false;if(document.hidden){clearInput();if(mode==='playing')pauseGame();if(audio&&soundOn)audio.suspend();}else{last=performance.now();qualityTimer=0;if(soundOn)void startSound(true);}});
 window.addEventListener('pagehide',()=>{if(audio)audio.disable();});
 // CONTROLLER (Gamepad API, standard mapping). Polled once per frame. Gameplay reads held states from `pad`;
 // presses become the same pending flags the mouse and keyboard use. Outside play the d-pad/left stick move focus
 // spatially inside the top-most dialog (or the home/end screen), A clicks, B behaves like Esc, LB/RB step tabs.
 const PAD_ABILITY=[[0,'venomist'],[2,'predator'],[10,'riptide'],[3,'summoner'],[1,'stalker']];
 var gpad={x:0,y:0,ax:0,ay:0,aiming:false,strike:false,sprint:false,block:false,sneak:false,prev:[],navDir:'',navAt:0};
 function readPad(){let best=null;for(const g of (navigator.getGamepads?navigator.getGamepads():[])||[])if(g&&g.connected&&(!best||g.mapping==='standard'&&best.mapping!=='standard'))best=g;return best;}
 function deadzone(x,y,d){const m=Math.hypot(x,y);if(m<d)return[0,0];const k=Math.min(1,(m-d)/(1-d))/m;return[x*k,y*k];}
 document.addEventListener('focusin',e=>{if(!e.target.classList?.contains('pad-focus'))for(const o of document.querySelectorAll('.pad-focus'))o.classList.remove('pad-focus');});
 function setPadActive(on){if(padActive===on)return;padActive=on;if(!on)for(const o of document.querySelectorAll('.pad-focus'))o.classList.remove('pad-focus');document.body.dataset.pad=String(on);if(on)setInputMode('mouse');applyBindingLabels();}
 function releasePad(){if(!gpad)return;gpad.x=gpad.y=gpad.ax=gpad.ay=0;gpad.aiming=gpad.strike=gpad.sprint=gpad.block=gpad.sneak=false;}
 function pollPad(){
   const g=readPad();if(!g){releasePad();gpad.prev=[];return;}
   const now=g.buttons.map(k=>!!k&&(k.pressed||k.value>.5)),prev=gpad.prev,edge=i=>!!now[i]&&!prev[i];gpad.prev=now;
   const [lx,ly]=deadzone(g.axes[0]||0,g.axes[1]||0,.2),[rx,ry]=deadzone(g.axes[2]||0,g.axes[3]||0,.3);
   if(!padActive){if(now.some(Boolean)||lx||ly||rx||ry)setPadActive(true);else return;}
   if(mode==='playing'){
     gpad.x=lx;gpad.y=ly;gpad.ax=rx;gpad.ay=ry;gpad.aiming=!!(rx||ry);gpad.strike=!!now[7];gpad.sprint=!!now[6];gpad.block=!!now[4];gpad.sneak=!!now[5];
     if(edge(7))pendingPulse=true;if(edge(4))pendingBlock=true;if(edge(5))sneakDown('pad');if(prev[5]&&!now[5])sneakUp('pad');
     for(const [i,trait] of PAD_ABILITY)if(edge(i))queueAbility(trait);
     if(edge(9)){releasePad();pauseGame();return;}
     if(edge(8)){releasePad();openMap();}
     // D-pad up talks to a hermit while its card is showing (every face button is already a move).
     if(edge(12)){const t=$('hermitAccept');if(t&&!t.hidden&&t.offsetParent){releasePad();openHermit();}}
     return;
   }
   releasePad();padMenu(now,edge,lx,ly);if(ry){const root=padScope(),box=root&&padScrollBox(root);if(box)box.scrollTop+=ry*18;}
 }
 // The layer the controller may move in: the error screen, else the top-most open dialog, else the death screen
 // (a full-screen layer, not a dialog, so nothing behind it may be reached), else on the home screen the whole page
 // (its top-bar icons belong to it). During play there is no menu scope.
 function padScope(){if(!$('error').hidden)return $('error');const open=[...document.querySelectorAll('dialog[open]')];if(open.length)return open[open.length-1];if(mode==='end')return $('endScreen');if(mode==='menu')return document.body;return null;}
 // Only real controls are targets: never panels, tab panels or scroll boxes that carry a tabindex for keyboard reading.
 const PAD_TARGET='button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=option],[role=radio],[role=checkbox],[role=switch]';
 function padTargets(root){return[...root.querySelectorAll(PAD_TARGET)].filter(e=>!e.disabled&&e.getAttribute('aria-hidden')!=='true'&&!e.closest('[hidden],[inert]')&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).pointerEvents!=='none'&&parseFloat(getComputedStyle(e).opacity)>.05);}
 // Spatial move: candidates must lie ahead in the pressed direction. Same row/column (overlapping on the cross axis)
 // wins over anything diagonal; then the smallest edge-to-edge gap; then the closest cross-axis centre.
 function padPick(from,list,dir){
   const a=from.getBoundingClientRect(),vert=dir==='up'||dir==='down',sign=dir==='down'||dir==='right'?1:-1;let best=null,score=Infinity;
   for(const e of list){if(e===from||e.contains(from)||from.contains(e))continue;const b=e.getBoundingClientRect();if(!b.width&&!b.height)continue;
     const ac=vert?a.top+a.height/2:a.left+a.width/2,bc=vert?b.top+b.height/2:b.left+b.width/2;if((bc-ac)*sign<=2)continue;
     const gap=Math.max(0,vert?(sign>0?b.top-a.bottom:a.top-b.bottom):(sign>0?b.left-a.right:a.left-b.right));
     const overlap=vert?Math.min(a.right,b.right)-Math.max(a.left,b.left):Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
     const cross=Math.abs(vert?(b.left+b.width/2)-(a.left+a.width/2):(b.top+b.height/2)-(a.top+a.height/2));
     // Off-row/column candidates must sit within a ~63° cone of the pressed direction, so Left never drops to the footer.
     if(overlap<=0&&Math.abs(bc-ac)<cross*.5)continue;
     const sc=(overlap>0?0:1e5+(-overlap)*4)+gap*10+cross;if(sc<score){score=sc;best=e;}}
   return best;
 }
 // Marks the controller's selection with a class as well as focus, so the highlight shows even if the page lacks focus.
 function padFocus(e){for(const o of document.querySelectorAll('.pad-focus'))o.classList.remove('pad-focus');e.classList.add('pad-focus');e.focus();e.scrollIntoView({block:'nearest',inline:'nearest'});}
 function padNavigate(dir){
   const root=padScope();if(!root)return;const list=padTargets(root);if(!list.length)return;const cur=document.activeElement;
   if(!cur||cur===document.body||!root.contains(cur)){padFocus(list[0]);return;}
   // Down from a tab enters that tab's content at its first control, in reading order (top row first, then left to right),
   // rather than whatever happens to sit straight below the tab.
   if(dir==='down'&&cur.getAttribute('role')==='tab'){const r=cur.getBoundingClientRect(),row=e=>{const b=e.getBoundingClientRect();return Math.round(b.top/14);},below=list.filter(e=>e.getAttribute('role')!=='tab'&&e.getBoundingClientRect().top>=r.bottom-2).sort((a,b)=>(row(a)-row(b))||(a.getBoundingClientRect().left-b.getBoundingClientRect().left));
     if(below.length){const t=below[0];padFocus(t);if($('skillsDialog').open&&$('skillsDialog').dataset.tab==='mutations')padFollow(t);else if(t.classList.contains('tree-node'))padTreeFollow(t);return;}}
   {const m=padMutationsMove(cur,dir);if(m!==undefined){if(m){padFocus(m);padFollow(m);}return;}}
   {const t=padTreeMove(cur,dir);if(t!==undefined){if(t){padFocus(t);padTreeFollow(t);}return;}}
   // From a non-target (a focused panel or the dialog itself) still move relative to where it sits on screen.
   const best=padPick(cur,list,dir)||(!list.includes(cur)?list[0]:null);
   if(best){padFocus(best);if($('skillsDialog').open&&$('skillsDialog').dataset.tab==='mutations')padFollow(best);else if(best.classList.contains('tree-node'))padTreeFollow(best);return;}
   // Nothing further that way: up/down scroll the reading area instead (long guide pages have few buttons).
   if(dir==='up'||dir==='down'){const box=padScrollBox(root);if(box)box.scrollBy({top:(dir==='down'?1:-1)*Math.round(box.clientHeight*.4),behavior:'smooth'});}
 }
 // The scrollable area to move: the nearest scrolling ancestor of the focus, else the tallest scrolling box in the menu.
 function padScrollBox(root){
   const scrolls=el=>el.scrollHeight>el.clientHeight+4&&/(auto|scroll)/.test(getComputedStyle(el).overflowY);
   for(let e=document.activeElement;e&&e!==document.body;e=e.parentElement){if(scrolls(e))return e;if(e===root)break;}
   let best=null;for(const el of root.querySelectorAll('section,div,dl,ul,article,main')){if(el.closest('[hidden]')||!el.getClientRects().length)continue;if(scrolls(el)&&(!best||el.clientHeight>best.clientHeight))best=el;}
   return best||(root!==document.body&&scrolls(root)?root:null);
 }
 // The Mutations tab by controller. The six slots form a ring, so they get fixed neighbours instead of the spatial
 // search (which skipped the side slots): Mouth on top, Senses and Membrane down the left, Strike organ and Nucleus
 // down the right, Flagellum at the bottom. Right from the right-hand side goes into that slot's mutations; Left from
 // the first mutation goes back to the slot; Down from a mutation reaches its Equip button. Returns the element to
 // move to, null to stay put, or undefined to use the ordinary spatial move.
 const PAD_RING={mouth:{left:'senses',right:'organ',down:'senses'},senses:{up:'mouth',down:'membrane',right:'organ',left:null},organ:{up:'mouth',down:'nucleus',left:'senses',right:'chips'},membrane:{up:'senses',down:'flagellum',right:'nucleus',left:null},nucleus:{up:'organ',down:'flagellum',left:'membrane',right:'chips'},flagellum:{up:'membrane',left:'membrane',right:'nucleus'}};
 function padMutationsMove(cur,dir){
   const dlg=$('skillsDialog');if(!dlg.open||dlg.dataset.tab!=='mutations'||!dlg.contains(cur))return undefined;
   const chips=[...$('partTokens').querySelectorAll('.part-chip')].filter(e=>e.getClientRects().length),socket=k=>$('mutationsGrid').querySelector('.part-box[data-part="'+k+'"]'),selChip=()=>chips.find(c=>c.classList.contains('selected'))||chips[0]||null,act=$('mutationAction');
   if(cur.classList.contains('part-box')){const n=PAD_RING[cur.dataset.part];if(!n||!(dir in n))return undefined;const t=n[dir];if(t===null)return null;if(t==='chips')return selChip()||(act&&!act.disabled?act:null);return socket(t)||null;}
   if(cur.classList.contains('part-chip')){const i=chips.indexOf(cur);if(dir==='left'&&i===0)return socket(selectedPart);if(dir==='right'&&i===chips.length-1)return null;if(dir==='up')return padPick(cur,chips,'up')||null;if(dir==='down')return padPick(cur,chips,'down')||(act&&!act.disabled&&act.getClientRects().length?act:null);return undefined;}
   if(cur===act){if(dir==='up')return selChip();if(dir==='left')return socket(selectedPart);if(dir==='right')return null;}
   return undefined;
 }
 // The Lineage tree by controller: the d-pad follows the drawn lines. From a node it moves to the connected node whose
 // direction on screen is closest to the one pressed (I to its fork pair, II to III and to the hybrids beside it, and so
 // on; the five rank I nodes connect through the centre). Nothing in that direction: stay put rather than jump.
 function padTreeNeighbours(id){
   const m=/^(\w+?)(\d)([ab]?)$/.exec(id),ring=MorphosGame.FAMILY_RING,out=[];
   if(id.startsWith('hybrid-')){const h=MorphosGame.HYBRIDS[id.slice(7)];if(h)for(const f of h.families)out.push(f+'2a',f+'2b');return out;}
   if(!m)return out;const [,f,rs,side]=m,r=+rs,node=k=>k===1||k===3||k===5?f+k:null;
   if(r===1){out.push(f+'2a',f+'2b');for(const g of ring)if(g!==f)out.push(g+'1');}
   if(r===2){out.push(f+'1',f+'3',f+'2'+(side==='a'?'b':'a'));for(const [k,h] of Object.entries(MorphosGame.HYBRIDS))if(h.families.includes(f))out.push('hybrid-'+k);}
   if(r===3)out.push(f+'2a',f+'2b',f+'4a',f+'4b');
   if(r===4)out.push(f+'3',f+'5',f+'4'+(side==='a'?'b':'a'));
   if(r===5)out.push(f+'4a',f+'4b');
   return out;
 }
 function padTreeMove(cur,dir){
   const d=$('skillsDialog');if(!d.open||d.dataset.tab!=='evolution'||!cur.classList.contains('tree-node'))return undefined;
   const box=$('evoTree'),a=cur.getBoundingClientRect(),ax=a.left+a.width/2,ay=a.top+a.height/2,want={up:-Math.PI/2,down:Math.PI/2,left:Math.PI,right:0}[dir];let best=null,score=Infinity;
   for(const id of padTreeNeighbours(cur.dataset.node)){const e=box.querySelector('[data-node="'+id+'"]');if(!e)continue;const b=e.getBoundingClientRect(),dx=b.left+b.width/2-ax,dy=b.top+b.height/2-ay,dist=Math.hypot(dx,dy);if(dist<2)continue;
     let off=Math.abs(Math.atan2(dy,dx)-want);if(off>Math.PI)off=2*Math.PI-off;if(off>Math.PI*.42)continue;const sc=off*3+dist/400;if(sc<score){score=sc;best=e;}}
   return best;
 }
 // Landing on a node shows it, as a click would; A then moves to its Choose button when there is one (choosing is permanent).
 function padTreeFollow(e){if(e.classList.contains('selected'))return;const id=e.dataset.node;e.click();const nb=$('evoTree').querySelector('[data-node="'+id+'"]');if(nb)padFocus(nb);}
 // What the controller lands on is also chosen: a slot shows its mutations, a mutation shows its details.
 function padFollow(e){
   if(e.classList.contains('part-box')&&!e.classList.contains('selected')){const k=e.dataset.part;e.click();const nb=$('mutationsGrid').querySelector('.part-box[data-part="'+k+'"]');if(nb)padFocus(nb);}
   else if(e.classList.contains('part-chip')&&!e.classList.contains('selected'))selectMutation(e.dataset.mutationChoice);
 }
 // A on a slot opens it: the cursor moves to that slot's mutations, starting on the one worn (or the first).
 function padIntoSlot(box){
   const k=box.dataset.part;if(!box.classList.contains('selected'))box.click();
   const chips=[...$('partTokens').querySelectorAll('.part-chip')].filter(e=>e.getClientRects().length);
   const start=chips.find(c=>c.classList.contains('equipped'))||chips[0];
   if(start){padFocus(start);padFollow(start);}else{const nb=$('mutationsGrid').querySelector('.part-box[data-part="'+k+'"]');if(nb)padFocus(nb);}
 }
 // B inside a slot's mutations (or on its Equip button) goes back to the slot instead of closing the pause screen.
 function padOutOfSlot(){
   const d=$('skillsDialog'),f=document.activeElement;if(!d.open||!f)return false;
   if(d.dataset.tab==='evolution'&&$('treeDetail').contains(f)){const n=$('evoTree').querySelector('[data-node="'+treeSelected+'"]');if(n){padFocus(n);return true;}}
   if(d.dataset.tab!=='mutations'||!(f.classList.contains('part-chip')||f===$('mutationAction')))return false;
   const box=$('mutationsGrid').querySelector('.part-box[data-part="'+selectedPart+'"]');if(!box)return false;padFocus(box);return true;
 }
 // A on a mutation equips it (or takes it off) straight away, and the selection stays on that mutation.
 function padEquipChip(chip){const k=chip.dataset.mutationChoice;selectMutation(k);const act=$('mutationAction');if(act&&!act.disabled){act.click();const again=$('partTokens').querySelector('[data-mutation-choice="'+k+'"]');if(again)padFocus(again);}}
 function padBack(){
   const open=[...document.querySelectorAll('dialog[open]')],d=open[open.length-1];if(!d)return;
   const ev=new Event('cancel',{cancelable:true});d.dispatchEvent(ev);if(!ev.defaultPrevented)d.close();
 }
 function padTab(step){
   const root=padScope();const tabs=root?[...root.querySelectorAll('[role=tab]')].filter(t=>t.getClientRects().length):[];if(!tabs.length)return;
   const i=Math.max(0,tabs.findIndex(t=>t.getAttribute('aria-selected')==='true'));const next=tabs[(i+step+tabs.length)%tabs.length];next.click();next.focus();
 }
 function padMenu(now,edge,lx,ly){
   if(edge(0)){const f=document.activeElement,root=padScope(),mut=$('skillsDialog').open&&$('skillsDialog').dataset.tab==='mutations';if(root&&f&&root.contains(f)&&f!==root){if(mut&&f.classList.contains('part-chip'))padEquipChip(f);else if(mut&&f.classList.contains('part-box'))padIntoSlot(f);else if(f.classList.contains('tree-node')){padTreeFollow(f);const c=$('treeDetail').querySelector('button.btn');if(c)padFocus(c);}else{const inTree=$('treeDetail').contains(f);f.click();if(inTree&&!document.contains(f)){const n=$('evoTree').querySelector('[data-node="'+treeSelected+'"]');if(n)padFocus(n);}}}else padNavigate('down');return;}
   if(edge(1)){if(padOutOfSlot())return;padBack();return;}
   if(edge(9)){padBack();return;}
   if(edge(4)||edge(5)){padTab(edge(5)?1:-1);return;}
   const dir=now[12]||ly<-.5?'up':now[13]||ly>.5?'down':now[14]||lx<-.5?'left':now[15]||lx>.5?'right':'',t=performance.now();
   if(!dir){gpad.navDir='';return;}
   if(dir!==gpad.navDir){gpad.navDir=dir;gpad.navAt=t+380;padNavigate(dir);}else if(t>=gpad.navAt){gpad.navAt=t+150;padNavigate(dir);}
 }
 window.addEventListener('gamepadconnected',()=>{if(mode==='playing'||mode==='menu')notify('Controller connected.',4,2);});
 window.addEventListener('gamepaddisconnected',()=>{if(!readPad()){releasePad();if(padActive){setPadActive(false);if(mode==='playing')pauseGame();}}});
 // Any keyboard, mouse or touch use hands the hints back to that device.
 document.addEventListener('keydown',()=>setPadActive(false),{capture:true,passive:true});
 document.addEventListener('pointerdown',()=>setPadActive(false),{capture:true,passive:true});
 document.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&(Math.abs(e.movementX)+Math.abs(e.movementY))>2)setPadActive(false);},{capture:true,passive:true});
 function getInput(){
   const p=game.state.player;let x=0,y=0,aim={x:p.x+Math.cos(p.angle)*180,y:p.y+Math.sin(p.angle)*180};
   if(pointer.aimed&&!touchUI())aim=renderer.screenToWorld(pointer.x,pointer.y);
   // Touch aims like a joystick: Strikes and Venom fly where the stick points (or the way the cell faces when the stick rests).
   if(touch.active){x=touch.x;y=touch.y;if(Math.hypot(x,y)>.05)aim={x:p.x+x*250,y:p.y+y*250};}
   else{const kx=(held('right')?1:0)-(held('left')?1:0),ky=(held('down')?1:0)-(held('up')?1:0);if(kx||ky){const m=Math.hypot(kx,ky);x=kx/m;y=ky/m;if(!pointer.aimed)aim={x:p.x+x*200,y:p.y+y*200};}else if(pointer.active&&!mouseAimOnly){const dx=aim.x-p.x,dy=aim.y-p.y,d=Math.hypot(dx,dy),speed=clamp((d-12)/65,0,1);if(d>1){x=dx/d*speed;y=dy/d*speed;}}}
   if(padActive){if(gpad.x||gpad.y){x=gpad.x;y=gpad.y;}const m=Math.hypot(gpad.ax,gpad.ay),mv=Math.hypot(x,y);aim=gpad.aiming?{x:p.x+gpad.ax/m*250,y:p.y+gpad.ay/m*250}:mv>.05?{x:p.x+x/mv*250,y:p.y+y/mv*250}:{x:p.x+Math.cos(p.angle)*250,y:p.y+Math.sin(p.angle)*250};}
   // Hold position: keep aiming with the mouse but stop swimming towards it.
   if(held('hold')&&!touch.active){x=0;y=0;}
   const ability=pendingAbilities.shift()||'',pulse=pendingPulse||pointer.held||held('strike')||keys.has('abilityPulse')||(padActive&&gpad.strike);assistedAim=padActive&&gpad.aiming?aim:null;
   // A latched sneak ends when stealth is truly broken (attack, fast swim, being hit) or on exhaustion; Needle only halves it, so it stays latched.
   if(sneakToggle&&(p.exhausted||(p.concealCooldown>lastConceal+1e-6&&p.stealth===0)))sneakToggle=false;lastConceal=p.concealCooldown||0;
   if(ability&&abilityAim){aim=abilityAim;assistedAim=aim;}abilityAim=null;
   if(strikePress&&strikePress.dragged){aim=strikeAimPoint(strikePress);assistedAim=aim;}
   if(tapAim){aim=tapAim;assistedAim=aim;tapAim=null;}
   // The only touch assist: a Block turns to face an incoming shot that is about to land. Attacks are never auto-aimed.
   else if(touchUI()&&pendingBlock){
     const state=game.state,near=(a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y);
     const shot=state.projectiles.filter(o=>o.owner==='enemy'&&Math.hypot(o.x-p.x,o.y-p.y)<p.r+100).sort(near)[0];
     if(shot){aim={x:shot.x,y:shot.y};assistedAim=aim;}
   }
   const result={moveX:x,moveY:y,aimX:aim.x,aimY:aim.y,pulse,pulsePressed:pendingPulse,block:held('block')||blockButtonHeld||(padActive&&gpad.block),blockPressed:pendingBlock,sprint:sprintPointer||sprintButtonHeld||held('fastSwim')||(padActive&&gpad.sprint),sneak:sneakToggle||!!sneakPress,ability,faceAim:(held('hold')&&!touch.active)||(padActive&&gpad.aiming)||!!(strikePress&&strikePress.dragged)||!!(venomPress&&venomPress.dragged)||(pulse&&pointer.aimed&&!touchUI())||(mouseAimOnly&&pointer.aimed&&!touchUI()&&!touch.active&&!padActive&&!x&&!y)};
   pendingPulse=pendingBlock=false;return result;
 }
 function fail(e){failed=true;$('error').hidden=false;$('errorDetails').textContent=String(e&&e.message||e);$('loading').hidden=true;if(audio)audio.disable();setSound(false);}
 function tutorialTick(){
   const s=game.state,p=s.player;if(s.time>90||activeNotice||noticeQueue.length||s.bossEncounter)return;
 }
 // ---- Co-op: finding and talking to the other players ----------------------------------------------------
 // Players connect browser to browser (WebRTC). To set a connection up, the two browsers first have to swap a
 // block of connection details. Normally that goes through the small helper at SIGNAL_URL, which only passes
 // those details along; with "copy and paste" the players pass them to each other by hand instead. After that,
 // everything travels directly between the players. The host's browser sits in the middle: each guest talks
 // to the host, and the host passes on what is meant for the other guests.
 const SIGNAL_URL=(()=>{try{const u=new URLSearchParams(location.search).get('signal');if(u&&/^(localhost|127\.0\.0\.1)$/.test(location.hostname))return u;}catch{}return'https://coop.jza.app';})();
 const ICE={iceServers:[{urls:'stun:stun.cloudflare.com:3478'},{urls:'stun:stun.l.google.com:19302'}]};
 const COOP_MAX=8,CODE_LETTERS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
 const coopKey='morphos.coop.v1';
 let coop=null,coopTimer=0,coopStored=null,friendlyAt=0;
 const coopOn=()=>!!(coop&&coop.started);
 const randomText=(n,letters)=>{const v=new Uint32Array(n);crypto.getRandomValues(v);return[...v].map(x=>letters[x%letters.length]).join('');};
 const coopName=()=>{const v=$('coopName').value.trim().slice(0,14)||'Player';try{localStorage.setItem('morphos.name.v1',v);}catch{}return v;};
 function coopStatus(text,error=false){const e=$('coopStatus');e.textContent=text;e.classList.toggle('error-note',error);}
 let coopToastTimer=0;function coopToast(text){const e=$('coopToast');e.textContent=text;e.hidden=false;clearTimeout(coopToastTimer);coopToastTimer=setTimeout(()=>{e.hidden=true;},1800);}
 async function coopCopyCode(){if(!coop||!coop.code)return;let ok=false;try{await navigator.clipboard.writeText(coop.code);ok=true;}catch{try{const ta=document.createElement('textarea');ta.value=coop.code;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;opacity:0';$('coopDialog').append(ta);ta.select();ok=document.execCommand('copy');ta.remove();}catch{}}if(ok){const h=document.querySelector('#coopDialog .coop-hint');if(h){h.textContent='Copied';clearTimeout(coopToastTimer);coopToastTimer=setTimeout(()=>{h.textContent='Tap the code to copy it';},1800);}}else coopToast('Could not copy. The code is '+coop.code);}
 function coopScreen(name){for(const e of document.querySelectorAll('[data-coop-screen]'))e.hidden=e.dataset.coopScreen!==name;coopStatus('');}
 async function signalSend(box,data){const r=await fetch(SIGNAL_URL+'/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:box,msg:JSON.stringify(data)}),cache:'no-store'});if(!r.ok)throw Error('signal '+r.status);}
 async function signalRecv(box){const r=await fetch(SIGNAL_URL+'/recv?box='+encodeURIComponent(box),{cache:'no-store'});if(!r.ok)throw Error('signal '+r.status);const out=[];for(const text of (await r.json()).messages||[]){try{out.push(JSON.parse(text));}catch{}}return out;}
 // A browser needs a moment to work out every address it can be reached at; wait for that before sharing its details.
 // A mobile network can take several seconds to report the public address. Wait until the browser says it has
 // finished; give up waiting after 2.5 s only if a public address is already known, and after 7 s regardless.
 function gathered(pc){return new Promise(done=>{if(pc.iceGatheringState==='complete')return done();let over=false;const finish=()=>{if(!over){over=true;clearTimeout(soon);clearTimeout(late);done();}};
   const soon=setTimeout(()=>{if(/ typ srflx/.test((pc.localDescription&&pc.localDescription.sdp)||''))finish();},2500),late=setTimeout(finish,7000);
   pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete')finish();});});}
 // What each side offered, in a few words, for working out why two networks would not connect.
 function coopLinkDetails(pc){const read=d=>{const s=(d&&d.sdp)||'';return(/ typ srflx/.test(s)?'public address found':'no public address')+(/ [0-9a-f]{1,4}:[0-9a-f:]+ \d+ typ (host|srflx)/i.test(s)?', IPv6':'');};return'Details: this device: '+read(pc.localDescription)+'. Other device: '+read(pc.remoteDescription)+'.';}
 const packDetails=d=>'MORPHOS1:'+btoa(JSON.stringify(d)),unpackDetails=text=>{const m=/MORPHOS1:([A-Za-z0-9+/=]+)/.exec(String(text).replace(/\s+/g,''));if(!m)throw Error('That is not a MORPHOS invite or reply.');return JSON.parse(atob(m[1]));};
 function coopSendRaw(link,data){if(!link.dc||link.dc.readyState!=='open')return;
   const send=list=>{const text=JSON.stringify({...data,m:list});if(text.length>14000&&list.length>1){const half=list.length>>1;send(list.slice(0,half));send(list.slice(half));}else{try{link.dc.send(text);}catch{}}};
   if(data.m)send(data.m);else{try{link.dc.send(JSON.stringify(data));}catch{}}
 }
 function coopRoster(){
   if(!coop)return;const rows=coop.names.map((n,i)=>n===null?'':'<li><i class="coop-dot" style="--c:'+MorphosRenderer.PEER_COLOURS[i%8]+'"></i>'+escapeText(n)+(i===coop.me?' <small>you</small>':i===coop.hubId?' <small>host</small>':'')+'</li>').join('');
   const count=coop.names.filter(n=>n!==null&&n!==undefined).length,waitingRow=coop.host&&!coop.started&&count<COOP_MAX?'<li class="empty">Waiting for friends to join…</li>':'';
   for(const e of document.querySelectorAll('[data-coop-roster]'))e.innerHTML=rows+waitingRow;for(const e of document.querySelectorAll('[data-coop-count]'))e.textContent='In the pond · '+count+' of '+COOP_MAX;
   $('coopStart').disabled=$('coopStart2').disabled=!coop.host;$('coopStart').textContent=$('coopStart2').textContent=count>1?'Start':'Start on my own';
 }
 const escapeText=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // Host side: a guest's channel has opened.
 function coopAdmit(link){
   const started=coop.started;
   let id=0;while((id===coop.me||coop.names[id]!==undefined)&&id<63)id++;
   if(coop.names[id]!==undefined||id===coop.me){id=0;while((id===coop.me||coop.names[id]||coop.links.has(id))&&id<63)id++;}
   // A player coming back after a dropped link asks for the number they had, so everyone else still knows who they are.
   const back=link.want>=0&&link.want!==coop.me&&started&&(!(coop.links.get(link.want)&&!coop.links.get(link.want).direct&&coop.links.get(link.want).open)||(!!link.wantKey&&coop.keys[link.want]===link.wantKey));
   if(back){id=link.want;const old=coop.links.get(id);if(old&&old!==link){old.gone=true;try{old.pc.close();}catch{}}}
   else if(coop.names.filter(n=>n!==null&&n!==undefined).length>=COOP_MAX){coopSendRaw(link,{c:'full'});setTimeout(()=>{try{link.pc.close();}catch{}},600);return;}
   link.id=id;coop.names[id]=link.name||(back&&(coop.names[id]||(coop.lastNames&&coop.lastNames[id])))||'Player '+(id+1);if(link.wantKey)coop.keys[id]=link.wantKey;coop.links.set(id,link);coopRoster();
   for(const l of coop.links.values())coopSendRaw(l,{c:'names',names:coop.names,you:l.id});
   if(coop.started){coopSendRaw(link,{c:'start',seed:game.state.seed,me:id,names:coop.names,party:coop.party,hub:coop.me,late:1});if(!back)notify(coop.names[id]+' joined the pond.',3,2);}
 }
 function coopWire(link){
   const dc=link.dc,session=link.session=coop,stale=()=>{if(coop===session)return false;try{link.pc.close();}catch{}return true;};
   dc.onopen=()=>{if(stale())return;link.open=true;if(link.direct){const old=coop.links.get(link.id);if(old&&old!==link){if(old.open&&!old.direct){link.gone=true;try{link.pc.close();}catch{}return;}old.gone=true;try{old.pc.close();}catch{}}coop.links.set(link.id,link);return;}if(coop.host&&!link.seek)coopAdmit(link);else{coopSendRaw(link,{c:'hello',name:coopName(),key:coop.key});if(!coop.started)coopScreen('waiting');}};
   dc.onclose=()=>{if(coop===session)coopLost(link);};
   dc.onmessage=e=>{link.heard=performance.now();if(stale()||typeof e.data!=='string'||e.data.length>200000)return;let d;try{d=JSON.parse(e.data);}catch{return;}if(!d||typeof d!=='object')return;try{coopReceive(link,d);}catch(err){console.warn('co-op message ignored',err);}};
 }
 const coopApply=(from,list)=>{if(!coop.started)return;for(const m of list){try{game.applyNet(from,m);}catch(err){console.warn('co-op message ignored',err);}}};
 // The shape of the party. One player is the hub: everyone connects to the hub first, and the hub passes on
 // anything two guests cannot send each other directly. Guests then also open direct links to each other, with
 // the hub carrying the connection details between them. A message on a link is one of:
 //   {m}        straight from the player at the other end
 //   {t,x,m}    to the hub: for player t (or -1 for everyone except the players listed in x, already reached directly)
 //   {f,m}      from the hub: passed on for player f
 function coopReceive(link,d){
   if(d.c==='sig'){
     // Connection details for a direct link between two guests, carried by the hub.
     if(coop.host){const l=coop.links.get(d.to);if(l&&Number.isInteger(link.id)&&link.id>=0&&d.d&&typeof d.d==='object')coopSendRaw(l,{c:'sig',from:link.id,d:d.d});}
     else if(link.id===coop.hubId&&!link.direct&&coop.hubId>=0)coopSignal(d.from,d.d);
     return;
   }
   // My hub is dissolving its party to join a bigger one: go and find it too.
   if(d.c==='ping')return;
   if(d.c==='seek'){if(!coop.host&&(coop.started||coop.resume)&&link.id===coop.hubId&&!link.direct){link.gone=true;try{link.pc.close();}catch{}coop.links.delete(link.id);coopSeek(coop);}return;}
   if(coop.host){
     if(d.c==='hello'){if(Number.isInteger(link.id)&&link.id>=0&&typeof d.name==='string'){if(typeof d.key==='string')coop.keys[link.id]=d.key.slice(0,40);coop.names[link.id]=d.name.slice(0,14)||coop.names[link.id];coopRoster();for(const l of coop.links.values())coopSendRaw(l,{c:'names',names:coop.names});}return;}
     if(!Number.isInteger(link.id)||link.id<0||!Array.isArray(d.m))return;
     if(!Number.isInteger(d.t)){coopApply(link.id,d.m);return;}
     // Pass it on first, then use it: one bad message must not hold up the rest.
     const skip=Array.isArray(d.x)?d.x:[];
     for(const l of coop.links.values())if(l!==link&&!l.direct&&(d.t===-1?!skip.includes(l.id):d.t===l.id))coopSendRaw(l,{f:link.id,m:d.m});
     if(d.t===-1||d.t===coop.me)coopApply(link.id,d.m);
     return;
   }
   if(link.direct&&link.id!==coop.hubId){if(Array.isArray(d.m))coopApply(link.id,d.m);return;}
   if(d.c==='names'&&Array.isArray(d.names)){link.welcomed=true;if(!coop.started&&Number.isInteger(d.you)&&d.you>=0&&d.you<64)coop.me=d.you;coop.names=d.names.slice(0,64).map(n=>typeof n==='string'?n.slice(0,14):null);coopRoster();}
   else if(d.c==='full'){if(coop.started){link.gone=true;try{link.pc.close();}catch{}if(coop.links.get(link.id)===link)coop.links.delete(link.id);coopSeek(coop);}else{coopLeave();coopScreen('join');coopStatus('That pond is full (eight players).',true);}}
   else if(d.c==='start'&&typeof d.seed==='string'&&Number.isInteger(d.me)&&d.me>=0&&d.me<64){if(Array.isArray(d.names))coop.names=d.names.slice(0,64).map(n=>typeof n==='string'?n.slice(0,14):null);coop.me=d.me;if(typeof d.party==='string')coop.party=d.party.slice(0,24);
     // The hub is not always player 0: after a host leaves, another player takes over.
     const hub=Number.isInteger(d.hub)&&d.hub>=0&&d.hub<64&&d.hub!==d.me?d.hub:0;if(coop.links.get(link.id)===link)coop.links.delete(link.id);
     // If I already had a direct link to the player who is now my hub, the hub link replaces it.
     const prior=coop.links.get(hub);if(prior&&prior!==link){prior.gone=true;try{prior.pc.close();}catch{}}coop.hubId=hub;link.id=hub;link.direct=false;coop.links.set(hub,link);
     // Back after a dropped connection: the pond I am in carries on, under the player number the hub has just given me.
     link.welcomed=true;if(coop.started&&game.coop){game.coop.me=d.me;coop.seekSince=0;coop.tries.clear();notify('Reconnected to the pond.',4,3);return;}
     coopReadStored();startCoopLife(d.seed,d.me,coopStored&&coopStored.party===coop.party?coopStored:null,d.late===1);}
   else if(d.c==='left'&&Number.isInteger(d.id)&&d.id>=0&&d.id<64&&d.id!==coop.me){const l=coop.links.get(d.id);if(l&&l.direct&&l.open)return;if(coop.started)game.peerLeft(d.id);if(coop.names[d.id])notify(coop.names[d.id]+' left the pond.',3,2);coop.names[d.id]=null;}
   else if(Array.isArray(d.m))coopApply(Number.isInteger(d.f)?d.f:coop.hubId,d.m);
 }
 // Guests open direct links to each other. Of each pair, the player with the higher number starts.
 function coopMesh(){
   if(!coopOn()||coop.host)return;const hub=coop.links.get(coop.hubId);if(!hub||!hub.open)return;const now=performance.now();
   for(let id=0;id<coop.names.length;id++){if(!coop.names[id]||id===coop.me||id===coop.hubId||id>coop.me||coop.links.has(id))continue;
     const tried=coop.tries.get(id);if(tried&&(now-tried.at<30000||tried.n>=3))continue;coopDirectOffer(id,(tried?tried.n:0)+1);}
 }
 async function coopDirectOffer(id,n){
   const session=coop,pc=new RTCPeerConnection(ICE),link={pc,dc:pc.createDataChannel('morphos'),id,direct:true};session.tries.set(id,{at:performance.now(),n,link});
   try{coopWire(link);await pc.setLocalDescription(await pc.createOffer());await gathered(pc);if(coop!==session){pc.close();return;}
     const hub=session.links.get(session.hubId);if(hub)coopSendRaw(hub,{c:'sig',to:id,d:{k:'offer',sdp:pc.localDescription.sdp}});
     setTimeout(()=>{if(!link.open){link.gone=true;try{pc.close();}catch{}}},20000);}catch{try{pc.close();}catch{}}
 }
 async function coopSignal(from,d){
   if(!d||typeof d.sdp!=='string'||d.sdp.length>20000||!Number.isInteger(from)||from===coop.me)return;const session=coop;
   try{
     if(d.k==='offer'){const old=session.links.get(from);if(old&&old.open)return;const nowT=performance.now();session.offerTimes=(session.offerTimes||[]).filter(x=>nowT-x<30000);if(session.offerTimes.length>=16)return;session.offerTimes.push(nowT);const pc=new RTCPeerConnection(ICE),link={pc,dc:null,id:from,direct:true};
       pc.ondatachannel=e=>{link.dc=e.channel;coopWire(link);};await pc.setRemoteDescription({type:'offer',sdp:d.sdp});await pc.setLocalDescription(await pc.createAnswer());await gathered(pc);if(coop!==session){pc.close();return;}
       const hub=session.links.get(session.hubId);if(hub)coopSendRaw(hub,{c:'sig',to:from,d:{k:'answer',sdp:pc.localDescription.sdp}});setTimeout(()=>{if(!link.open){link.gone=true;try{pc.close();}catch{}}},20000);}
     else if(d.k==='answer'){const tried=session.tries.get(from);if(tried&&tried.link&&!tried.link.open&&!tried.link.gone)await tried.link.pc.setRemoteDescription({type:'answer',sdp:d.sdp});}
   }catch{}
 }
 // How many players this device is hub for (direct links to fellow guests do not count).
 const coopGuests=session=>{let n=0;for(const l of session.links.values())if(!l.direct&&l.open)n++;return n;};
 function coopLost(link){
   if(!coop||link.gone)return;link.gone=true;const session=coop;
   // Only the link currently in use for that player matters; one that was already replaced is ignored.
   if(session.links.get(link.id)!==link)return;session.links.delete(link.id);
   // A direct link to another guest: nothing is lost, the hub carries on passing messages between us.
   if(link.direct)return;
   if(session.host){
     if(!Number.isInteger(link.id)||link.id<0)return;const name=session.names[link.id];(session.lastNames||(session.lastNames={}))[link.id]=name;session.names[link.id]=null;if(session.started)game.peerLeft(link.id);
     for(const l of session.links.values())coopSendRaw(l,{c:'left',id:link.id});if(name)notify(name+' left the pond.',3,2);coopRoster();
     // A hub left with nobody looks for the rest of the party (they may have gathered around a new hub while it was away).
     if(session.started&&!coopGuests(session))setTimeout(()=>{if(coop===session&&session.host&&!coopGuests(session)&&!session.seekSince)coopSeek(session);},2500);
     return;
   }
   // Before Start: someone continuing a saved pond goes back to looking; someone who joined by code is told.
   if(!session.started){if(session.resume){coopSeek(session);return;}coopLeave();coopScreen('choose');coopStatus('The connection was lost. Try again.',true);return;}
   // The link to the hub has gone. One rule covers every case: keep playing, keep the direct links to the other
   // players, and look for the party through the pond's mailbox. If the hub is still there it lets me back in. If it
   // has gone for everyone, exactly one of us ends up hosting the rest (see coopSeekStep).
   notify('Lost the link to the host. Reconnecting. You can keep swimming meanwhile.',5,3);coopSeek(session);
 }
 // Host with nobody connected and look for the rest of the party at the same time (see coopSeekStep).
 function coopSeek(session){
   session.host=true;session.hubId=session.me;session.tries.clear();session.pruneAt=0;if(!session.code)session.code=randomText(6,CODE_LETTERS);
   if(!session.started){session.shownHost=false;coopScreen('gather');}
   const old=session.links.get(-1);if(old){old.gone=true;try{old.pc.close();}catch{}session.links.delete(-1);}
   if(session.attempt){try{session.attempt.link.gone=true;session.attempt.link.pc.close();}catch{}session.attempt=null;}
   // Rank decides which of two lone players hosts the other: whoever started looking first. A player already waiting
   // therefore answers a newcomer at once.
   if(!session.ranked){session.ranked=true;session.rank=String(Date.now()).padStart(15,'0')+session.rank;}
   session.seekSince=performance.now();session.patience=7000+Math.random()*3000;coopHostLoop(session);
 }
 // A hub that finds a bigger party of the same pond dissolves its own: everyone, itself included, goes looking, and the
 // bigger hub lets them all in. This is how two halves of a party that came apart find each other again.
 function coopDissolve(session){
   session.names=session.started?session.names:[];
   for(const l of [...session.links.values()])if(!l.direct){coopSendRaw(l,{c:'seek'});const link=l;setTimeout(()=>{link.gone=true;try{link.pc.close();}catch{}},400);l.gone=true;session.links.delete(l.id);}
   coopSeek(session);
 }
 function coopLeave(){if(!coop)return;clearTimeout(coopTimer);const c=coop;coop=null;$('coopBanner').hidden=true;if(c.attempt){try{c.attempt.link.pc.close();}catch{}}for(const l of c.links.values()){l.gone=true;try{l.pc.close();}catch{}}if(c.pending)for(const l of c.pending){try{l.pc.close();}catch{}}}
 function coopNew(host,resume=null){coopLeave();coop={host,me:0,started:false,names:host?[coopName()]:[],links:new Map(),pending:[],code:'',hubId:0,tries:new Map(),myId:'',attempt:null,answered:new Map(),keys:{},key:randomText(16,CODE_LETTERS),rank:randomText(16,'0123456789abcdef'),seekSince:0,patience:8000,noted:0,mine:new Set(),party:resume?resume.party:randomText(12,CODE_LETTERS),resume,checkpoint:resume?JSON.stringify(resume):'',restoredAt:0};}
 // The co-op pond saved in this browser, if there is one that still loads.
 function coopReadStored(){
   coopStored=null;try{const text=localStorage.getItem(coopKey);if(!text||text.length>8*1024*1024)return;const raw=JSON.parse(text);if(raw.format!=='morphos-coop'||![saveVersion,19,18].includes(raw.version)||typeof raw.party!=='string'||typeof raw.seed!=='string')return;const g=MorphosGame.fromSave(raw.game);if(g.state.status!=='playing'||!g.state.player.alive)return;coopStored=raw;}catch{}
   $('coopResume').hidden=!coopStored;if(coopStored){const p=coopStored.game.state.player,others=(Array.isArray(coopStored.names)?coopStored.names:[]).filter((n,i)=>typeof n==='string'&&i!==coopStored.me);$('coopResumeText').textContent=(p.cellCountText||p.cellCount)+' '+(p.cellCount===1?'cell':'cells')+(others.length?' · with '+others.join(', '):'')+' · '+String(coopStored.reason||'Checkpoint').slice(0,64);}
 }
 // A party checkpoint: every device saves its own player and the creatures it is running, at the same moment.
 function coopCheckpoint(reason,policy='',landmarkId='',fromPeer=false){
   if(!coopOn()||mode==='menu'||game.state.status!=='playing'||!game.state.player.alive)return false;
   if(!fromPeer&&(!checkpointAllows(game.state,policy,landmarkId)||game.coopPeers().some(b=>b.down>0)))return false;
   try{const text=JSON.stringify({format:'morphos-coop',version:saveVersion,party:coop.party,seed:game.state.seed,names:coop.names,me:coop.me,reason,savedAt:new Date().toISOString(),game:game.saveObject()});
     // Only a save that loads cleanly replaces the last one.
     MorphosGame.fromSave(JSON.parse(text).game);coop.checkpoint=text;
     // A pond that has only just begun does not replace a saved pond from another party; its first real checkpoint does.
     let other=false;if(policy==='initial'){try{const old=JSON.parse(localStorage.getItem(coopKey)||'null');other=!!old&&old.party!==coop.party;}catch{}}
     if(!other){try{localStorage.setItem(coopKey,text);}catch{}}
     if(!fromPeer&&policy!=='initial')game.coopSignal('cp',reason);return true;}catch{return false;}
 }
 function coopLoad(text,message,late=false){
   const raw=JSON.parse(text),restored=MorphosGame.fromSave(raw.game);if(restored.state.status!=='playing'||!restored.state.player.alive)throw Error('ended');
   closeAllDialogs();clearInput();rewardContext=null;game=restored;game.startCoop(coop.me,false,late);game.drainEvents();lastGrowth=null;growthUnseen=false;latestUnseen=false;treeSelected='';resultRecorded=false;accumulator=0;clearNotices();resetSpecimen();
   coop.started=true;coop.restoredAt=performance.now();renderer.resetView();setMode('playing');last=performance.now();updateUI(true);notify(message,6,3);
 }
 // The party went down: everyone returns to the last party checkpoint.
 function coopRestore(){
   if(!coopOn())return;
   try{if(!coop.checkpoint)throw Error('none');coopLoad(coop.checkpoint,'The party went down. You are back at the last checkpoint.');}
   catch{const session=coop;startLife(game.state.seed,session);game.startCoop(session.me);session.restoredAt=performance.now();notify('The party went down. The pond begins again.',6,3);}
 }
 function coopHud(){
   // Restarting the world belongs to a solo life; in a co-op pond you leave from the pause screen instead.
   const solo=!coopOn();for(const id of ['restart','saveLife','loadLife'])if($(id).hidden===solo)$(id).hidden=!solo;
   if(coopOn()&&!document.hidden){const now=performance.now();
     // Silence means a dead link even when the browser has not noticed yet: a guest drops a silent hub after 9 seconds, a hub drops a silent guest after 15.
     if(!coop.host){const l=coop.links.get(coop.hubId);if(l&&l.open&&l.heard&&now-l.heard>9000){try{l.pc.close();}catch{}coopLost(l);}coopMesh();}
     else for(const l of [...coop.links.values()])if(!l.direct&&l.open&&l.heard&&now-l.heard>15000){try{l.pc.close();}catch{}coopLost(l);}}
   // The other players: name, health, and whether they are down, resting or far away.
   const party=$('partyList'),show=coopOn()&&(mode==='playing'||mode==='paused');
   if(!show){if(!party.hidden)party.hidden=true;}
   else{const me=game.state.player,rows=(()=>{const all=game.coopPeers();return innerHeight<=500&&all.length>2?[...all].sort((a,b)=>(b.down>0)-(a.down>0)).slice(0,2):all;})().map(q=>{const name=coop.names[q.peer]||'Player',far=Math.hypot(q.x-me.x,q.y-me.y),state=q.down>0?'down':q.active===false?'away':'';
       const note=q.down>0?'Down · '+Math.ceil(q.down)+'s':q.active===false?'Resting':far>2400?'Far away':'';
       return '<div class="party-row '+state+'" style="--c:'+MorphosRenderer.PEER_COLOURS[q.peer%8]+';--hp:'+Math.round(clamp((q.hp||0)/(q.maxHp||1),0,1)*100)+'"><i></i><b>'+escapeText(name)+'</b><span class="party-bar"><u></u></span>'+(note?'<small>'+note+'</small>':'')+'</div>';}).join('')+(innerHeight<=500&&game.coopPeers().length>2?'<div class="party-row" style="--c:#77978d"><i></i><b>+'+(game.coopPeers().length-2)+' more</b></div>':'');
     if(party.dataset.rows!==rows){party.dataset.rows=rows;party.innerHTML=rows;}party.hidden=!rows;}
   const b=$('coopBanner'),d=coopOn()&&mode==='playing'?game.coopDownState():null;if(!d&&!(coopOn()&&mode==='playing'&&game.coop.reviving)){if(!b.hidden)b.hidden=true;return;}
   if(d===null&&coopOn()&&mode==='playing'&&game.coop.reviving){const r=game.coop.reviving;b.hidden=false;b.classList.add('helping');b.textContent='Reviving '+(coop.names[r[0]]||'your friend')+' · '+Math.round(r[1]*100)+'%. Stay on them.';return;}
   b.classList.remove('helping');b.hidden=false;b.textContent=d.helper>=0?(coop.names[d.helper]||'A friend')+' is reviving you · '+Math.round(d.progress*100)+'%':game.coopPeers().length?'You are down. A friend can revive you by staying on you · '+Math.ceil(d.time)+'s':'You are down. Returning to the checkpoint…';
 }
 // Host: wait for guests who type the pond code. Each sends its connection details to the pond's mailbox; the
 // host answers into the guest's own mailbox.
 // Host: answer every guest who asks. Guests leave their connection details in the pond's mailboxes (one named
 // by the pond code, and for a saved pond one named by the pond's own secret); the host answers into each
 // guest's own mailbox.
 // The hub's loop: answer everyone who asks to come in. Requests wait in the pond's mailboxes (one named by the pond
 // code; for a saved or running pond, one named by the pond's own secret) and each is answered into the asker's own mailbox.
 // The hub's loop: answer everyone who asks to come in. Requests wait in the pond's mailboxes (one named by the pond
 // code; for a saved or running pond, one named by the pond's own secret) and each is answered into the asker's own mailbox.
 function coopHostLoop(session){
   if(session.looping)return;session.looping=true;let failures=0;
   // Reading a mailbox empties it, so a note that was not for me goes back in (a few times at most) for the right reader.
   const putBack=async m=>{const hops=Number.isInteger(m.hops)&&m.hops>=0?m.hops:4;if(hops>=4)return;try{await signalSend('p-'+session.party,{...m,hops:hops+1});}catch{}};
   const answer=async(m,party)=>{
     if(!m||typeof m!=='object')return;
     if(m.hub){
       // Another hub of this same pond says how many players it has. The smaller party (on a tie, the higher rank) dissolves and joins it.
       if(!party||typeof m.rank!=='string'||m.rank===session.rank||!Number.isFinite(m.at)||Math.abs(Date.now()-m.at)>45000)return;const mine=coopGuests(session),theirs=Number.isInteger(m.n)?m.n:0;
       if(mine>0&&!!m.started===!!session.started&&(theirs>mine||(theirs===mine&&m.rank<session.rank)))coopDissolve(session);
       return;
     }
     if(typeof m.id!=='string'||typeof m.sdp!=='string'||m.sdp.length>20000||!/^g-[a-f0-9]{24}$/.test(m.id)||session.answered.has(m.id))return;
     if(m.id===session.myId){if(session.attempt&&session.attempt.id===m.id)await putBack({...m,hops:0});return;}
     if(session.mine.has(m.id))return;
     if(party&&!session.started&&Number.isInteger(m.was)&&m.was>=0){await putBack(m);return;}
     // While I am alone and looking for the party myself, I only answer a fellow seeker if my rank is the lower:
     // of two lone players exactly one hosts the other.
     // A pond that is running always takes in a player who is only just coming back to it (one who has reloaded and
     // tapped Continue), whatever the ranks: otherwise the two could each wait for the other.
     if(party&&!coopGuests(session)&&session.seekSince&&typeof m.rank==='string'&&m.rank<session.rank&&(!session.started||(Number.isInteger(m.was)&&m.was>=0))){await putBack(m);return;}
     session.answered.set(m.id,performance.now());
     const pc=new RTCPeerConnection(ICE),link={pc,dc:null,name:'',made:performance.now(),want:Number.isInteger(m.was)&&m.was>=0&&m.was<64?m.was:-1,wantKey:typeof m.key==='string'?m.key.slice(0,40):''};session.pending.push(link);
     try{pc.ondatachannel=e=>{link.dc=e.channel;coopWire(link);};
       await pc.setRemoteDescription({type:'offer',sdp:m.sdp});await pc.setLocalDescription(await pc.createAnswer());await gathered(pc);
       if(coop!==session||!session.host){pc.close();return;}
       await signalSend(m.id,{sdp:pc.localDescription.sdp,hid:session.rank,n:coopGuests(session),st:session.started?1:0});}
     catch(err){session.answered.delete(m.id);try{pc.close();}catch{}}
   };
   const poll=async()=>{
     if(coop!==session||!session.host){session.looping=false;return;}
     // Continuing a saved pond: after waiting a while with no answer, show the host's screen (a code for anyone new).
     if(!session.started&&session.seekSince&&!session.shownHost&&performance.now()-session.seekSince>session.patience){session.shownHost=true;session.names=[coopName()];$('coopHostLabel').textContent='Continuing your pond · code for anyone new';$('coopCode').textContent=session.code;coopScreen('host');coopRoster();}
     try{
       const now=performance.now(),waiting=session.seekSince&&!coopGuests(session)&&now-session.seekSince<session.patience;
       const boxes=(session.code?['h-'+session.code]:[]).concat((session.resume||session.started)&&!waiting?['p-'+session.party]:[]);
       for(const box of boxes)for(const m of await signalRecv(box)){if(coop!==session||!session.host)break;try{await answer(m,box[0]==='p');}catch{}}
       if(coop!==session||!session.host){session.looping=false;return;}
       // Tidy up: answers nobody took up, and the list of requests already answered.
       session.pending=session.pending.filter(l=>{if(l.open||now-l.made<30000)return !l.gone;try{l.pc.close();}catch{}return false;});for(const [id,at] of session.answered)if(now-at>150000)session.answered.delete(id);
       if(session.pruneAt&&now>session.pruneAt&&session.started){session.pruneAt=0;let changed=false;for(let i=0;i<session.names.length;i++)if(i!==session.me&&session.names[i]&&!session.links.has(i)){(session.lastNames||(session.lastNames={}))[i]=session.names[i];session.names[i]=null;game.peerLeft(i);changed=true;}if(changed)for(const l of session.links.values())coopSendRaw(l,{c:'names',names:session.names});}
       // A hub with players says so in the pond's mailbox now and then, so that two halves of a split party can find each other.
       if((session.started||session.resume)&&coopGuests(session)&&now-(session.noted||0)>12000){session.noted=now;await signalSend('p-'+session.party,{hub:1,rank:session.rank,n:coopGuests(session),started:session.started?1:0,at:Date.now()});}
       await coopSeekStep(session);
       failures=0;if(!session.started&&coop===session)coopStatus('');}
     catch(err){if(++failures>=2&&!session.started&&!session.manual&&coop===session)coopStatus('The connection helper cannot be reached. Check your internet, or connect by copy and paste.',true);}
     if(coop===session&&session.host)coopTimer=setTimeout(poll,session.started&&coopGuests(session)?2500:1300);else session.looping=false;
   };
   poll();
 }
 // Looking for the rest of the party while hosting nobody. I leave my own request in the pond's mailbox, a new one
 // every twelve seconds. If a hub that has players answers it, or a lone host of lower rank does, I join them.
 async function coopSeekStep(session){
   if(!session.seekSince||!session.host)return;const now=performance.now();let a=session.attempt;
   if(coopGuests(session)){if(a){a.link.gone=true;try{a.link.pc.close();}catch{}session.attempt=null;}session.seekSince=0;
     // The party has gathered around me. Say so, and in a little while drop the names of players who never came back.
     if(session.started){notify('You are hosting the pond now. Code for anyone new: '+session.code,8,3);session.pruneAt=now+25000;}
     return;}
   if(!a||now-a.at>12000){
     if(a){a.link.gone=true;try{a.link.pc.close();}catch{}}
     const pc=new RTCPeerConnection(ICE),link={pc,dc:pc.createDataChannel('morphos'),id:-1,seek:true};a=session.attempt={link,id:'g-'+randomText(24,'0123456789abcdef'),at:now};session.myId=a.id;session.mine.add(a.id);coopWire(link);
     await pc.setLocalDescription(await pc.createOffer());await gathered(pc);if(coop!==session||session.attempt!==a)return;
     await signalSend('p-'+session.party,{id:a.id,sdp:pc.localDescription.sdp,was:session.started?session.me:-1,key:session.key,rank:session.rank});return;
   }
   const got=(await signalRecv(a.id)).filter(m=>m&&typeof m.sdp==='string'&&(m.n>0||(m.st&&!session.started)||(typeof m.hid==='string'&&m.hid&&m.hid<session.rank))).sort((x,y)=>(y.n||0)-(x.n||0)||(String(x.hid)<String(y.hid)?-1:1));
   if(!got.length||coop!==session||session.attempt!==a||!session.host||coopGuests(session))return;
   // Step down and join them. If the hub has not welcomed me in fifteen seconds, go back to looking.
   session.host=false;session.seekSince=0;session.attempt=null;session.hubId=-1;for(const l of session.pending){l.gone=true;try{l.pc.close();}catch{}}session.pending=[];
   const link=a.link;session.links.set(-1,link);if(!session.started)coopScreen('gather');
   setTimeout(()=>{if(coop===session&&!session.host&&!link.welcomed&&!link.gone){link.gone=true;try{link.pc.close();}catch{}if(session.links.get(link.id)===link)session.links.delete(link.id);coopSeek(session);}},15000);
   try{await link.pc.setRemoteDescription({type:'answer',sdp:got[0].sdp});}catch{}
 }
 function coopHost(){
   coopNew(true);coop.code=randomText(6,CODE_LETTERS);$('coopHostLabel').textContent='Your pond code';$('coopCode').textContent=coop.code;coopScreen('host');coopRoster();coopHostLoop(coop);
 }
 // Continue a saved pond with no code to type. Everyone who has the pond saved taps Continue; their browsers find
 // each other through a mailbox named by the pond's own secret, which only its players hold. Whoever is there
 // first hosts, and the rest join that player automatically.
 function coopContinue(){
   const saved=coopStored;if(!saved)return;coopNew(false,saved);coop.names=[];coopScreen('gather');coopSeek(coop);
 }
 async function coopJoin(){
   const code=$('coopCodeInput').value.toUpperCase().replace(/[^A-Z0-9]/g,'');if(code.length!==6){coopStatus('Type the six-character pond code your host can see.',true);return;}
   coopNew(false);const session=coop;$('coopConnectingTo').textContent='Finding pond '+code;coopScreen('connecting');const failed=text=>{coopLeave();coopScreen('join');coopStatus(text,true);};
   try{
     const pc=new RTCPeerConnection(ICE),link={pc,dc:pc.createDataChannel('morphos'),id:0};session.links.set(0,link);coopWire(link);
     const id='g-'+randomText(24,'0123456789abcdef');await pc.setLocalDescription(await pc.createOffer());await gathered(pc);
     await signalSend('h-'+code,{id,sdp:pc.localDescription.sdp,key:session.key});
     let answer=null;for(let i=0;i<24&&!answer&&coop===session;i++){await new Promise(r=>setTimeout(r,1000));answer=(await signalRecv(id)).find(m=>m&&typeof m.sdp==='string');}
     if(coop!==session)return;
     if(!answer){failed('No pond answered to that code. Check the code, and that your host still has the game open.');return;}
     $('coopConnectingTo').textContent='Pond found. Joining…';
     await pc.setRemoteDescription({type:'answer',sdp:answer.sdp});
     setTimeout(()=>{if(coop===session&&!link.open)failed('The pond was found, but your two networks would not connect directly. This is common when a player is on mobile data (4G or 5G). Use Wi-Fi or a wired connection on every device. '+coopLinkDetails(pc));},15000);
   }catch(err){if(coop===session)failed('The connection helper cannot be reached. Check your internet, or use copy and paste.');}
 }
 // Copy and paste, for when the helper cannot be reached. Host: Copy invite → guest: Paste invite, Copy reply → host: Paste reply.
 async function coopManualInvite(){
   if(!coop||!coop.host){coopNew(true);coop.code=randomText(6,CODE_LETTERS);coopHostLoop(coop);}const session=coop;session.manual=true;coopScreen('manualHost');coopRoster();$('coopInvite').value='Preparing…';$('coopReplyIn').value='';
   const pc=new RTCPeerConnection(ICE),link={pc,dc:pc.createDataChannel('morphos'),name:'',made:performance.now()+600000};session.pending.push(link);session.manualLink=link;coopWire(link);
   await pc.setLocalDescription(await pc.createOffer());await gathered(pc);if(coop!==session)return;
   $('coopInvite').value=packDetails({sdp:pc.localDescription.sdp});
 }
 async function coopManualConnect(){
   if(!coop||!coop.manualLink||coop.manualLink.answered)return;try{const d=unpackDetails($('coopReplyIn').value);coop.manualLink.answered=true;await coop.manualLink.pc.setRemoteDescription({type:'answer',sdp:d.sdp});coopStatus('Connecting…');const link=coop.manualLink,session=coop;setTimeout(()=>{if(coop===session&&!link.open)coopStatus('Your two networks would not connect directly. This is common when a player is on mobile data (4G or 5G). Use Wi-Fi or a wired connection on every device.',true);},15000);}
   catch(err){if(coop&&coop.manualLink)coop.manualLink.answered=false;coopStatus(err.message&&err.message.startsWith('That is not')?err.message:'That reply did not work. Ask your friend to copy it again.',true);}
 }
 async function coopManualReply(){
   try{const d=unpackDetails($('coopInviteIn').value);coopNew(false);const session=coop,pc=new RTCPeerConnection(ICE),link={pc,dc:null,id:0};session.links.set(0,link);
     pc.ondatachannel=e=>{link.dc=e.channel;coopWire(link);};
     await pc.setRemoteDescription({type:'offer',sdp:d.sdp});await pc.setLocalDescription(await pc.createAnswer());await gathered(pc);if(coop!==session)return;
     $('coopReply').value=packDetails({sdp:pc.localDescription.sdp});$('coopReplyStep').hidden=false;coopStatus('');}
   catch(err){coopStatus(err.message&&err.message.startsWith('That is not')?err.message:'That invite did not work. Ask your host to copy it again.',true);}
 }
 async function coopCopy(id,button){const text=$(id).value;try{await navigator.clipboard.writeText(text);}catch{$(id).select();try{document.execCommand('copy');}catch{}}const old=button.textContent;button.textContent='Copied ✓';setTimeout(()=>button.textContent=old,1600);}
 async function coopPaste(id){try{const text=await navigator.clipboard.readText();if(text)$(id).value=text;}catch{$(id).focus();coopStatus('Tap the box and choose Paste.');}}
 function coopBegin(){if(!coop||!coop.host||coop.started)return;for(const l of coop.links.values())l.heard=performance.now();const seed=coop.resume?coop.resume.seed:safeSeed();for(const l of coop.links.values())coopSendRaw(l,{c:'start',seed,me:l.id,names:coop.names,party:coop.party,hub:coop.me});startCoopLife(seed,coop.me,coop.resume);if(coop&&coop.code)notify('Friends can still join with code '+coop.code+'. It is on the pause screen.',7,2);}
 function startCoopLife(seed,me,saved=null,late=false){
   const session=coop,others=session.names.filter((n,i)=>n&&i!==me),hello=others.length?'You are in the pond with '+others.join(', ')+'.':'You are in the pond.';
   if(saved){try{session.checkpoint=JSON.stringify(saved);coopLoad(session.checkpoint,hello+' Continuing from your last checkpoint.',late);session.restoredAt=0;return;}catch{}}
   startLife(seed,session);game.startCoop(me,true,late);session.started=true;renderer.resetView();notify(hello,5,2);coopCheckpoint('A new pond','initial');
 }
 // Each frame: let the engine prepare its messages, then send them on their way.
 function coopPump(dt){
   if(!coopOn())return;game.coopTick(dt);const out=game.drainNet();if(!out.length)return;
   const by=new Map();for(const {to,msg} of out){let list=by.get(to);if(!list)by.set(to,list=[]);list.push(msg);}
   for(const [to,list] of by){
     if(coop.host){for(const l of coop.links.values())if(to===-1||to===l.id)coopSendRaw(l,{f:coop.me,m:list});continue;}
     const hub=coop.links.get(coop.hubId);
     if(to===-1){
       // To everyone: straight down every direct link, and once to the hub for itself and whoever I cannot reach directly.
       const reached=[];for(const [id,l] of coop.links)if(id!==coop.hubId&&l.direct&&l.open&&l.dc.readyState==='open'){coopSendRaw(l,{m:list});reached.push(id);}
       if(hub)coopSendRaw(hub,{t:-1,x:reached,m:list});
     }else{
       const l=coop.links.get(to);
       if(to!==coop.hubId&&l&&l.direct&&l.open&&l.dc.readyState==='open')coopSendRaw(l,{m:list});else if(hub)coopSendRaw(hub,{t:to,m:list});
     }
   }
 }
 function coopDowned(){clearInput();game.coopDown();coopHud();}
 function coopPeersForDraw(){if(!coopOn())return null;const list=game.coopPeers(),mine=game.coop.reviving;for(const b of list){b.name=coop.names[b.peer]||'';b.colour=MorphosRenderer.PEER_COLOURS[b.peer%8];let rev=mine&&mine[0]===b.peer?mine[1]:0;for(const o of list)if(o.rv&&o.rv[0]===b.peer)rev=Math.max(rev,o.rv[1]);b.reviveShown=rev;}return list;}
 // Every link carries a small heartbeat, so silence always means a dead link and never just a quiet player.
 // Swipe left or right on a dialog with tabs (pause screen, How to play, Field guide) to move to the next or previous tab, wrapping round.
 // Touch only, and only a clear sideways swipe, so taps, scrolling and dragging on sliders are unaffected.
 for(const d of document.querySelectorAll('dialog')){const list=d.querySelector('[role=tablist]');if(!list)continue;let sx=0,sy=0,st=0,id=null;
   d.addEventListener('touchstart',e=>{if(e.touches.length!==1||e.target.closest('input,textarea,select,[role=slider],.pond-map')){id=null;return;}const p=e.touches[0];id=p.identifier;sx=p.clientX;sy=p.clientY;st=performance.now();},{passive:true});
   d.addEventListener('touchend',e=>{const p=[...e.changedTouches].find(q=>q.identifier===id);if(!p)return;id=null;const dx=p.clientX-sx,dy=p.clientY-sy;if(Math.abs(dx)<60||Math.abs(dx)<Math.abs(dy)*1.8||performance.now()-st>700)return;
     const tabs=[...list.querySelectorAll('[role=tab]')].filter(b=>!b.hidden&&!b.disabled&&b.offsetParent);if(tabs.length<2)return;const now=tabs.findIndex(b=>b.getAttribute('aria-selected')==='true');
     const next=tabs[((now<0?0:now)+(dx<0?1:-1)+tabs.length)%tabs.length];next.click();next.focus({preventScroll:true});},{passive:true});
   }
 setInterval(()=>{if(!coop)return;for(const l of coop.links.values())if(l.open)coopSendRaw(l,{c:'ping'});if(!coop.started&&!coop.host){const now=performance.now();for(const l of [...coop.links.values()])if(l.open&&l.heard&&now-l.heard>10000){try{l.pc.close();}catch{}coopLost(l);break;}}},3000);
 document.addEventListener('visibilitychange',()=>{if(coop&&!document.hidden)for(const l of coop.links.values())l.heard=performance.now();if(coopOn()){game.coopAway(document.hidden);coopPump(1e-4);}});
 try{$('coopName').value=localStorage.getItem('morphos.name.v1')||'';}catch{}
 coopReadStored();
 $('homeCoop').addEventListener('click',()=>{coopLeave();coopReadStored();coopScreen('choose');$('coopDialog').showModal();});
 $('coopResume').addEventListener('click',coopContinue);

 $('coopDialog').addEventListener('close',()=>{if(coop&&!coop.started)coopLeave();});
 $('coopHostGo').addEventListener('click',()=>coopHost());$('coopJoinShow').addEventListener('click',()=>{coopScreen('join');$('coopCodeInput').focus();});
 $('coopJoinGo').addEventListener('click',coopJoin);$('coopJoinCancel').addEventListener('click',()=>{coopLeave();coopScreen('join');});$('coopCode').addEventListener('click',coopCopyCode);$('coopCodeInput').addEventListener('keydown',e=>{if(e.key==='Enter')coopJoin();e.stopPropagation();});
 $('coopName').addEventListener('keydown',e=>e.stopPropagation());
 $('coopStart').addEventListener('click',coopBegin);$('coopStart2').addEventListener('click',coopBegin);
 for(const b of document.querySelectorAll('[data-coop-manual-host]'))b.addEventListener('click',coopManualInvite);
 for(const b of document.querySelectorAll('[data-coop-manual-join]'))b.addEventListener('click',()=>{coopLeave();coopScreen('manualJoin');$('coopReplyStep').hidden=true;$('coopInviteIn').value='';});
 for(const b of document.querySelectorAll('[data-coop-back]'))b.addEventListener('click',()=>{coopLeave();coopScreen('choose');});
 $('coopInviteCopy').addEventListener('click',e=>coopCopy('coopInvite',e.currentTarget));$('coopReplyCopy').addEventListener('click',e=>coopCopy('coopReply',e.currentTarget));
 $('coopReplyPaste').addEventListener('click',async()=>{await coopPaste('coopReplyIn');if($('coopReplyIn').value.trim())coopManualConnect();});$('coopReplyConnect').addEventListener('click',coopManualConnect);
 $('coopInvitePaste').addEventListener('click',async()=>{await coopPaste('coopInviteIn');if($('coopInviteIn').value.trim())coopManualReply();});$('coopInviteUse').addEventListener('click',coopManualReply);
 function typingInField(){const e=document.activeElement;return !!e&&(e.tagName==='INPUT'||e.tagName==='TEXTAREA');}
 // The on-screen keyboard covers the lower part of the screen without telling the page it has shrunk. While a text
 // field in the Co-Op dialog is in use, the dialog is fitted into the part of the screen still visible.
 function fitDialogToKeyboard(){
   const vv=window.visualViewport,d=$('coopDialog');if(!vv)return;
   if(d.open&&typingInField()&&innerHeight-vv.height>120){d.style.top=(vv.offsetTop+8)+'px';d.style.bottom='auto';d.style.marginTop='0';d.style.marginBottom='0';d.style.maxHeight=Math.max(160,vv.height-16)+'px';const e=document.activeElement;if(d.contains(e))e.scrollIntoView({block:'center'});}
   else for(const k of ['top','bottom','margin-top','margin-bottom','max-height'])d.style.removeProperty(k);
 }
 if(window.visualViewport){visualViewport.addEventListener('resize',fitDialogToKeyboard);visualViewport.addEventListener('scroll',fitDialogToKeyboard);}
 $('coopDialog').addEventListener('focusin',()=>setTimeout(fitDialogToKeyboard,350));$('coopDialog').addEventListener('focusout',()=>setTimeout(fitDialogToKeyboard,100));$('coopDialog').addEventListener('close',fitDialogToKeyboard);
 function frame(now){
   if(failed)return;requestAnimationFrame(frame);
   const raw=(now-last)/1000;last=now;if(document.hidden)return;
   const dt=clamp(raw,0,.1);time+=dt;uiTimer+=dt;audioTimer+=dt;
   try{
     pollPad();
     if(mode==='playing'){
       // Frame pacing. The simulation ticks once per screen refresh (60 or 120 a second), and a frame time close to a
       // whole number of ticks is treated as exactly that. Without this, tiny timing drift makes some frames run two
       // ticks and others none, which shows as a small stutter even when nothing is slow.
       if(raw>0&&raw<.05)refreshEstimate+=(raw-refreshEstimate)*.05;
       const tick=refreshEstimate<.0105?1/120:1/60,ticks=dt/tick,whole=Math.round(ticks);
       accumulator+=whole>=1&&whole<=4&&Math.abs(ticks-whole)<.25?whole*tick:dt;let steps=0;const cap=tick<.01?12:7;
       while(accumulator>=tick-1e-9&&steps<cap&&mode==='playing'){game.update(tick,getInput());consumeEvents();accumulator-=tick;steps++;}
       if(steps>=cap||accumulator<0)accumulator=0;
              if(mode==='playing')tutorialTick();
     }else accumulator=0;
     if(coop)coopPump(dt);
     updateNotices(dt);
     const aim=assistedAim||(pointer.aimed&&!padActive?renderer.screenToWorld(pointer.x,pointer.y):{x:game.state.player.x+Math.cos(game.state.player.angle)*180,y:game.state.player.y+Math.sin(game.state.player.angle)*180});
     // iPhone Safari can report the old size during a rotation: re-fit whenever the window and canvas disagree.
     if(renderer&&(renderer.width!==innerWidth||renderer.height!==innerHeight))resize();
     // The game never scrolls. iPhone Safari can leave the page scrolled after a rotation or a toolbar change,
     // which slides the fixed game layer down and leaves a blank band at the top; put it back.
     // Not while typing: with the on-screen keyboard up, the browser moves the view to keep the text field in sight.
     if((window.__morphosScrollTick=((window.__morphosScrollTick|0)+1)%20)===0&&!typingInField()&&(scrollX||scrollY||document.documentElement.scrollTop||document.body.scrollTop||(window.visualViewport&&Math.abs(visualViewport.offsetTop)>1))){scrollTo(0,0);document.documentElement.scrollTop=0;document.body.scrollTop=0;resize();}
     if(playAreaDirty&&mode!=='menu')measurePlayArea();const venomGuide=strikePress&&strikePress.dragged&&mode==='playing'?strikeAimPoint(strikePress):venomPress&&mode==='playing'&&(venomPress.dragged||performance.now()-venomPress.at>220)?venomAimPoint(venomPress):null;
     if(qualityResize){qualityResize=false;resize();}
     const still=mode!=='playing'&&(mode!=='menu'||reduced)&&!coopOn();if(!still||!frozenDrawn)renderer.draw(game.state,{venomAim:venomGuide&&[venomGuide.x,venomGuide.y,strikePress&&strikePress.dragged?'strike':venomPress?venomPress.trait:'strike'],time:reduced&&mode==='menu'?0:time,aim:[aim.x,aim.y],pointer:[pointer.x,pointer.y],menu:mode==='menu',paused:mode!=='playing',quality:pixelScale,playArea,viewZoom,peers:coopPeersForDraw(),reach:game.loadReach()});frozenDrawn=still;if(renderer.viewHalf)game.setView(renderer.viewHalf[0],renderer.viewHalf[1]);
     drawSpecimenView();
     zoomNoticeTime=Math.max(0,zoomNoticeTime-dt);{const zf=$('zoomFeedback'),zh=mode!=='playing'||zoomNoticeTime<=0;if(zf.hidden!==zh)zf.hidden=zh;}
     if(mode==='playing')drawMiniMap();if(uiTimer>.12){uiTimer=0;if(mode!=='menu')updateUI();coopHud();}
     if(audio&&soundOn&&audioTimer>.1){audioTimer=0;audio.update(game.state,.1);}
     if(raw>0&&(mode==='playing'||mode==='menu')){renderWarmup+=Math.min(raw,1);renderAverage=renderAverage*.9+Math.min(raw*1000,250)*.1;qualityTimer+=Math.min(raw,1);if(renderWarmup>2&&qualityTimer>2){const old=pixelScale;// Step resolution down as soon as frames average slower than about 42 a second, not only below 30.
       if(renderAverage>24&&pixelScale>.65){pixelScale=Math.max(.65,pixelScale-(renderAverage>50?.2:.1));qualityUp=0;}else if(renderAverage<15&&pixelScale<1){qualityUp+=qualityTimer;if(qualityUp>20){pixelScale=Math.min(1,pixelScale+.1);qualityUp=0;}}else qualityUp=0;if(old!==pixelScale)qualityResize=true;qualityTimer=0;}}
   }catch(e){fail(e);}
 }
 try{
   if(typeof ResizeObserver==='function'){const layoutObserver=new ResizeObserver(()=>{playAreaDirty=true;});for(const el of [$('vitals'),document.querySelector('.stage-panel'),document.querySelector('.score-panel'),$('bossHUD'),document.querySelector('.control-cluster'),$('quickNavigation')])layoutObserver.observe(el);}
   game=new MorphosGame(safeSeed());renderer=new MorphosRenderer(canvas);$('elderUnlocks').textContent=Object.values(MorphosGame.BOSSES).map(def=>def.level).join(', ');resize();refreshRecords();setMode('menu');readCheckpoint();setSound(true);void startSound(true);
   
   renderer.draw(game.state,{time:0,aim:[game.state.player.x,game.state.player.y-100],pointer:[innerWidth/2,innerHeight/2],menu:true,paused:true,quality:1});
   $('loading').classList.add('ready');setTimeout(()=>$('loading').hidden=true,600);requestAnimationFrame(frame);
 }catch(e){fail(e);}
 // A read-only diagnostic snapshot is useful when testing this entirely local game.
 Object.defineProperty(window,'morphos',{value:{get snapshot(){const s=game.state;return{mode,seed:s.seed,time:s.time,status:s.status,cells:s.player.cellCount,hp:s.player.hp,stamina:s.player.energy,nutrition:s.player.nutrition,biomass:s.biomass,score:s.score,traits:{...s.player.traits},evidence:{...s.player.evidence},abilities:{...s.player.abilityCooldowns},discoveries:discovered(),quality:pixelScale,skillPoints:s.player.skillPoints,attributes:{...s.player.attributes},mutations:[...(s.player.mutations||[])],exhausted:!!s.player.exhausted,sprinting:!!s.player.sprinting,genomes:[...(s.player.genomes||[])],boss:s.bossEncounter?{type:s.bossEncounter.type,hp:s.bossEncounter.hp,phase:s.bossEncounter.phase}:null,x:s.player.x,y:s.player.y,pendingEvolution:!!s.pendingEvolution,activeDialog,colonyLevel:s.player.colonyLevel};}}});
})();
