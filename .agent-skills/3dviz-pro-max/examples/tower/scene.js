import {mountScene} from '../shared/standalone-runtime.js';
import {breadth} from '../shared/catalog.js';
import {tower} from '../shared/breadth/src/crafted-architecture.js';
mountScene({meta:breadth['tower'],createScene:tower,kind:'breadth',views:breadth['tower'].views});
