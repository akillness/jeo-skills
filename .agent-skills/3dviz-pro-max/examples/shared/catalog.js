export const artScience={
 heart:{kicker:'01 / THE LIVING BODY',title:'The Living Heart',description:'An intimate study of cardiac form. Reveal the wall, inspect the valves and follow the coronary network.',accent:'#e68c82'},
 'muscle-atlas':{kicker:'02 / THE LIVING BODY',title:'Upper-body Muscle Atlas',description:'Separate muscle families and inspect their distinctive shapes around the skeletal framework.',accent:'#d7a094'},
 brain:{kicker:'03 / THE LIVING BODY',title:'Inside the Brain',description:'Travel between the folded surface and the structures sheltered beneath it.',accent:'#e3bdad'},
 sarcomere:{kicker:'04 / THE LIVING BODY',title:'Inside a Sarcomere',description:'Watch the Z discs approach as actin slides past myosin; neither filament becomes shorter.',accent:'#e8909c'},
 arm:{kicker:'05 / THE LIVING BODY',title:'Arm in Motion',description:'Explore how bones, tendons and muscles share a movement.',accent:'#daa587'},
 neuron:{kicker:'06 / THE LIVING BODY',title:'The Neural Signal',description:'Watch a signal move through a branching cellular landscape.',accent:'#a5bfd9'},
 breathing:{kicker:'07 / THE LIVING BODY',title:'Breath by Breath',description:'Explore the lung lobes and the changing dome of the diaphragm.',accent:'#d9a0b2'},
 knee:{kicker:'08 / THE LIVING BODY',title:'The Moving Knee',description:'Peel back the layers and explore a joint in motion.',accent:'#e4c4a6'},
 svd:{kicker:'09 / THE SHAPE OF IDEAS',title:'Space, Rewritten',description:'Rotate, stretch and rotate again to reveal a matrix’s geometric structure.',accent:'#95cdbf'},
 fourier:{kicker:'10 / THE SHAPE OF IDEAS',title:'Fourier Sculpture',description:'Add odd sine harmonics to approach a square wave.',accent:'#ddb577'},
 topology:{kicker:'11 / THE SHAPE OF IDEAS',title:'The Topology Atelier',description:'Discover what changes and what stays connected.',accent:'#c4a7dd'},
 complex:{kicker:'12 / THE SHAPE OF IDEAS',title:'Complex Observatory',description:'Compare z and 1/z through stereographic projection.',accent:'#a2c8e3'},
 probability:{kicker:'13 / THE SHAPE OF IDEAS',title:'Probability in Glass',description:'Shape a distribution and watch its geometry emerge.',accent:'#b4ccaa'},
 chaos:{kicker:'14 / FORCES & MOTION',title:'The Chaos Desk',description:'Release two nearly identical pendulums and follow their diverging stories.',accent:'#dfa66d'},
 optics:{kicker:'15 / FORCES & MOTION',title:'Light Through Matter',description:'Trace the path of light as it meets a new medium.',accent:'#9bcfd4'},
 resonance:{kicker:'16 / FORCES & MOTION',title:'Membrane Modes',description:'Find the shapes hidden inside a vibrating surface.',accent:'#c6b3dd'},
 magnetic:{kicker:'17 / FORCES & MOTION',title:'Magnetic Atelier',description:'Explore the field around a current-carrying loop.',accent:'#dcab7e'},
 differential:{kicker:'18 / FORCES & MOTION',title:'The Differential',description:'Open the mechanism and discover the geometry of a turn.',accent:'#c9be96'},
 orrery:{kicker:'19 / FORCES & MOTION',title:'Orbital Clockwork',description:'Follow curved paths through a brass-and-ink celestial study.',accent:'#d9bb80'},
 cavern:{kicker:'20 / IMAGINED WORLDS',title:'Crystal Conservatory',description:'Follow the light between crystal, water and living things.',accent:'#92d6bd'}
};

const standard={position:[.52,.34,.67],target:[0,.17,0]};
const camera=(overview)=>({overview,detail:{position:overview.position.map((v,i)=>overview.target[i]+(v-overview.target[i])*.7),target:[...overview.target]}});
export const breadth={
 bloch:{kicker:'CRAFTED STATE STUDY',title:'The Qubit Compass',accent:'#6aaea9',views:camera(standard)},
 gears:{kicker:'CRAFTED MECHANISM',title:'Machined in Motion',description:'Steel and brass gears on fixed shafts. The 24:16 tooth count enforces a 3:2 angular-speed ratio. Straight illustrative tooth flanks are not involute profiles; contact forces and tooth interference are not solved.',accent:'#c9a75e',views:camera({position:[.06,.28,.72],target:[0,.135,0]})},
 stag:{kicker:'CRAFTED CREATURE',title:'The Moon Stag',accent:'#9fc1b1',views:camera(standard)},
 cottage:{kicker:'CRAFTED ARCHITECTURE',title:'Timber Cottage',accent:'#c49b69',views:camera(standard)},
 hall:{kicker:'CRAFTED ARCHITECTURE',title:'Long Hall',accent:'#c49b69',views:camera(standard)},
 guildhall:{kicker:'CRAFTED ARCHITECTURE',title:'Stone Guildhall',accent:'#c49b69',views:camera(standard)},
 tower:{kicker:'CRAFTED ARCHITECTURE',title:'Watchtower',accent:'#9bb3ad',views:camera(standard)},
 market:{kicker:'CRAFTED ARCHITECTURE',title:'Market Pavilion',accent:'#d4a75d',views:camera(standard)},
 lantern:{kicker:'CRAFTED PROP',title:'The Lamplighter’s Lantern',accent:'#ffc46e',views:camera(standard)},
 well:{kicker:'CRAFTED PROP',title:'The Wishing Well',accent:'#86aca8',views:camera(standard)},
 tree:{kicker:'CRAFTED NATURE',title:'The Windwritten Tree',accent:'#8caa76',views:camera(standard)},
 village:{kicker:'CRAFTED WORLD',title:'Copperleaf Hollow',accent:'#c49b69',views:camera({position:[.36,.29,.45],target:[0,.03,0]})},
 'blue-hour':{kicker:'LIGHTING STUDY',title:'The Last Light',accent:'#ffc588',views:camera({position:[.36,.26,.44],target:[0,.03,0]})},
 'night-river':{kicker:'LIGHTING STUDY',title:'Lanterns by the River',accent:'#ffbe79',views:camera({position:[.36,.26,.44],target:[0,.03,0]})},
 'night-bridge':{kicker:'LIGHTING STUDY',title:'Across the Lantern Bridge',accent:'#ffbe79',views:camera({position:[.17,.115,.235],target:[.043,.032,.07]})},
 'night-doorway':{kicker:'LIGHTING STUDY',title:'A Light at the Door',accent:'#ffbe79',views:camera({position:[-.015,.135,.09],target:[-.085,.052,.002]})},
 'night-mill':{kicker:'LIGHTING STUDY',title:'The Mill After Dark',accent:'#ffbe79',views:camera({position:[.018,.093,.18],target:[-.076,.043,.053]})}
};
