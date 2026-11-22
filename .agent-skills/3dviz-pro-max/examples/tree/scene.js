import {mountScene} from '../shared/standalone-runtime.js';
import {breadth} from '../shared/catalog.js';
import {tree} from '../shared/breadth/src/crafted-props.js';
mountScene({meta:breadth['tree'],createScene:tree,kind:'breadth',views:breadth['tree'].views});
