import {mountScene} from '../shared/standalone-runtime.js';
import {breadth} from '../shared/catalog.js';
import {moonStag} from '../shared/breadth/src/crafted-creatures.js';
mountScene({meta:breadth['stag'],createScene:moonStag,kind:'breadth',views:breadth['stag'].views});
