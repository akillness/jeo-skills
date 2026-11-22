import {mountScene} from '../shared/standalone-runtime.js';
import {breadth} from '../shared/catalog.js';
import {lantern} from '../shared/breadth/src/crafted-props.js';
mountScene({meta:breadth['lantern'],createScene:lantern,kind:'breadth',views:breadth['lantern'].views});
