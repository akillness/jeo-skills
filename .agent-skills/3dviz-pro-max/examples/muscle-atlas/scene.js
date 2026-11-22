import {mountScene} from '../shared/standalone-runtime.js';
import {artScience} from '../shared/catalog.js';
import {createScene} from '../shared/art-science/scenes/muscle-atlas.js';
mountScene({meta:artScience['muscle-atlas'],createScene});
