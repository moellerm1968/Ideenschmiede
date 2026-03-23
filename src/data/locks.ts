import { Mutex } from 'async-mutex';

// One mutex per backlog file to prevent concurrent write corruption
export const ideaBacklogMutex = new Mutex();
export const productBacklogMutex = new Mutex();
export const detailedPlansMutex = new Mutex();
export const costsMutex = new Mutex();
