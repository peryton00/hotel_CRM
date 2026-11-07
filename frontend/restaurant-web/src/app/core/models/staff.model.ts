export type StaffRole =
  | 'ADMIN'
  | 'EXECUTIVE_CHEF'
  | 'SOUS_CHEF'
  | 'MANAGER'
  | 'CAPTAIN'
  | 'SERVICE_CREW'
  | 'CASHIER'
  | 'BEVERAGE_SPECIALIST';

export interface StaffMember {
  id: string;
  restaurant_id?: string;
  name: string;
  role: StaffRole;
  email: string;
  phone: string;
  shift: string;
  status: 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';
  assignedSection?: string;
  loginId?: string;
  password?: string;
  pin_hash?: string;
  monthlySalary?: number;
  payrollCycleStartDay?: number;
  created_at?: string;
}
