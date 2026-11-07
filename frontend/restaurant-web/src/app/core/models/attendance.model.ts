export type AttendanceStatus = 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'PAID_LEAVE';

export interface StaffAttendance {
  id: string;
  restaurant_id: string;
  staff_id: string;
  attendance_date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  check_in_time?: string;
  check_out_time?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface StaffPerformanceSummary {
  staff_id: string;
  staff_name: string;
  role: string;
  shift?: string;
  monthly_salary_paise: number;
  total_days_in_month: number;
  present_days: number;
  half_days: number;
  absent_days: number;
  leave_days: number;
  effective_working_days: number;
  calculated_salary_paise: number;
  orders_served_count: number;
  orders_served_total_paise: number;
  payroll_cycle_start_day?: number;
  cycle_start_date?: string;
  cycle_end_date?: string;
}
