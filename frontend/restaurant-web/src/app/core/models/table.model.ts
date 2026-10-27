export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'DIRTY';
export type TableSection = 'Main Dining' | 'Terrace Garden' | 'Private Lounge' | 'Bar';

export interface Table {
  id: string;
  number: string;
  capacity: number;
  section: TableSection;
  status: TableStatus;
  qrToken: string;
  qrUrl: string;
  orderingEnabled: boolean;
}
