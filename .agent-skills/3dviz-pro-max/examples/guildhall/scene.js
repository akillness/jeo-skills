import {mountScene} from '../shared/standalone-runtime.js';
import {breadth} from '../shared/catalog.js';
import {house} from '../shared/breadth/src/crafted-architecture.js';
mountScene({meta:breadth['guildhall'],createScene:()=>house('guildhall'),kind:'breadth',views:breadth['guildhall'].views});
