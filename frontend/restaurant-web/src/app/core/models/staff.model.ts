export type StaffRole =
  | 'EXECUTIVE_CHEF'
  | 'SOUS_CHEF'
  | 'MANAGER'
  | 'CAPTAIN'
  | 'SERVICE_CREW'
  | 'CASHIER'
  | 'BEVERAGE_SPECIALIST';

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  email: string;
  phone: string;
  shift: string;
  status: 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';
  assignedSection?: string;
}
