import {mountScene} from '../shared/standalone-runtime.js';
import {breadth} from '../shared/catalog.js';
import {house} from '../shared/breadth/src/crafted-architecture.js';
mountScene({meta:breadth['hall'],createScene:()=>house('hall'),kind:'breadth',views:breadth['hall'].views});
