import {mountScene} from '../shared/standalone-runtime.js';
import {artScience} from '../shared/catalog.js';
import {createScene} from '../shared/art-science/scenes/complex.js';
mountScene({meta:artScience['complex'],createScene});
