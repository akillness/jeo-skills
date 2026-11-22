import {mountScene} from '../shared/standalone-runtime.js';
import {breadth} from '../shared/catalog.js';
import {market} from '../shared/breadth/src/crafted-architecture.js';
mountScene({meta:breadth['market'],createScene:market,kind:'breadth',views:breadth['market'].views});
