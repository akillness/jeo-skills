import {mountScene} from '../shared/standalone-runtime.js';
import {artScience} from '../shared/catalog.js';
import {createScene} from '../shared/art-science/scenes/neuron.js';
mountScene({meta:artScience['neuron'],createScene});
