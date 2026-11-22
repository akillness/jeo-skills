import {mountScene} from '../shared/standalone-runtime.js';
import {breadth} from '../shared/catalog.js';
import {village} from '../shared/breadth/src/crafted-village.js';
mountScene({meta:breadth['night-mill'],createScene:village,kind:'breadth',nightName:'night-mill',views:breadth['night-mill'].views});
