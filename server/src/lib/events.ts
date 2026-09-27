import { EventEmitter } from 'events';

export type AdminEvent = {
  type: 'booking.created' | 'order.created' | 'corporate.created' | 'status.changed' | 'product.pending';
  id: string;
  title: string;
  at: string;
};

/** ناقل أحداث داخلي لإشعار لوحة الأدمن لحظيًا (SSE) */
export const adminBus = new EventEmitter();
adminBus.setMaxListeners(100);

export function emitAdmin(ev: Omit<AdminEvent, 'at'>) {
  adminBus.emit('event', { ...ev, at: new Date().toISOString() } satisfies AdminEvent);
}
