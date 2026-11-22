import {mountScene} from '../shared/standalone-runtime.js';
import {breadth} from '../shared/catalog.js';
import {village} from '../shared/breadth/src/crafted-village.js';
mountScene({meta:breadth['night-river'],createScene:village,kind:'breadth',nightName:'night-river',views:breadth['night-river'].views});
