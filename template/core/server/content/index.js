import { config } from '../config.js';
import * as pgRepo from './pg.js';
import * as seedRepo from './seed.js';

export const content = config.preview ? seedRepo : pgRepo;
