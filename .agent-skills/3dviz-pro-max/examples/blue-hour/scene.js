import {mountScene} from '../shared/standalone-runtime.js';
import {breadth} from '../shared/catalog.js';
import {village} from '../shared/breadth/src/crafted-village.js';
mountScene({meta:breadth['blue-hour'],createScene:village,kind:'breadth',nightName:'blue-hour',views:breadth['blue-hour'].views});
