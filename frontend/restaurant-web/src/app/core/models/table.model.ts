export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'DIRTY';
export type TableSection = 'Main Dining' | 'Terrace Garden' | 'Private Lounge' | 'Bar' | string;

export interface Table {
  id: string;
  number: string;
  capacity: number;
  section: TableSection;
  status: TableStatus;
  qrToken: string;
  qrUrl: string;
  orderingEnabled: boolean;
  assignedStaffId?: string;
  activeOrderId?: string;
  posX?: number;
  posY?: number;
  shape?: 'ROUND' | 'RECT';
}

export type FloorElementType = 'ENTRANCE' | 'KITCHEN' | 'BAR' | 'RESTROOM' | 'WALL' | 'STAGE';

export interface FloorElement {
  id: string;
  type: FloorElementType;
  label: string;
  section: string;
  posX: number;
  posY: number;
  width?: number;
  height?: number;
}
