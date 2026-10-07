import { parentPort, workerData } from 'node:worker_threads';
import { group } from '../ai/grouping.ts';
import type { Candidate } from '../ai/grouping.ts';
const candidates = workerData as Candidate[];
parentPort?.postMessage({ groups: group(candidates), candidates });
parentPort?.close();
