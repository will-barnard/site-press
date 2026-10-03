import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({ ...config.db, max: 4 });
pool.on('error', (err) => console.error('[db] idle client error', err.message));
export const query = (text, params) => pool.query(text, params);
