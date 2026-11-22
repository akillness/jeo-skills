import {mountScene} from '../shared/standalone-runtime.js';
import {breadth} from '../shared/catalog.js';
import {village} from '../shared/breadth/src/crafted-village.js';
mountScene({meta:breadth['village'],createScene:village,kind:'breadth',views:breadth['village'].views});
