import {mountScene} from '../shared/standalone-runtime.js';
import {breadth} from '../shared/catalog.js';
import {craftedBloch} from '../shared/breadth/src/crafted-bloch.js';
mountScene({meta:breadth['bloch'],createScene:craftedBloch,kind:'breadth',views:breadth['bloch'].views});
