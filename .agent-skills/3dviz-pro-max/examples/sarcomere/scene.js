import {mountScene} from '../shared/standalone-runtime.js';
import {artScience} from '../shared/catalog.js';
import {createScene} from '../shared/art-science/scenes/sarcomere.js';
mountScene({meta:artScience['sarcomere'],createScene});
