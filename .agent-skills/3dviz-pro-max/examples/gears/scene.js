import {mountScene} from '../shared/standalone-runtime.js';
import {breadth} from '../shared/catalog.js';
import {LOOKS} from '../shared/breadth/src/looks.js';
import {createCoupledGears} from '../shared/breadth/src/coupled-gears.js';
mountScene({meta:breadth['gears'],createScene:()=>createCoupledGears(LOOKS.studio,{crafted:true}),kind:'breadth',look:'studio',views:breadth['gears'].views});
