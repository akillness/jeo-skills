import {mountScene} from '../shared/standalone-runtime.js';
import {breadth} from '../shared/catalog.js';
import {village} from '../shared/breadth/src/crafted-village.js';
mountScene({meta:breadth['night-bridge'],createScene:village,kind:'breadth',nightName:'night-bridge',views:breadth['night-bridge'].views});
