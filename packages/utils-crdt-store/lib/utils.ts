import type { EventEmitter } from 'node:events';

export function eventToPromise(event: EventEmitter): Promise<void> {
  return new Promise((resolve, reject) =>
    event.on('end', resolve).on('error', reject));
}
