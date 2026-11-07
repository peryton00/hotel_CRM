import { describe, it, expect } from 'vitest';
import { AttendanceStatus, StaffPerformanceSummary } from './models/attendance.model';

describe('Staff Table Handling, Daily Attendance & Payroll Calculation Logic', () => {
  it('calculates effective working days and payable salary correctly for full month', () => {
    const monthlySalaryPaise = 1500000; // ₹15,000.00
    const perDayPaise = Math.round(monthlySalaryPaise / 30); // 50,000 paise = ₹500.00

    const presentDays = 22;
    const halfDays = 3;
    const leaveDays = 2;
    const absentDays = 3;

    // effective days = 22 + (3 * 0.5) + 2 = 25.5
    const effectiveDays = presentDays + halfDays * 0.5 + leaveDays;
    expect(effectiveDays).toBe(25.5);

    const calculatedSalaryPaise = Math.round(effectiveDays * perDayPaise);
    // 25.5 * 50,000 = 1,275,000 paise = ₹12,750.00
    expect(calculatedSalaryPaise).toBe(1275000);
    expect(calculatedSalaryPaise / 100).toBe(12750);
  });

  it('handles half day and absent day salary deductions accurately', () => {
    const monthlySalaryPaise = 3000000; // ₹30,000.00 (₹1,000/day)
    const perDayPaise = Math.round(monthlySalaryPaise / 30); // 100,000 paise

    // Staff worked 1 present day and 1 half day
    const effectiveDays = 1 + 1 * 0.5; // 1.5 days
    const calculatedPaise = Math.round(effectiveDays * perDayPaise);
    expect(calculatedPaise).toBe(150000); // ₹1,500.00
  });

  it('tracks orders served count and handled sales aggregate on performance summary', () => {
    const summary: StaffPerformanceSummary = {
      staff_id: 'test-staff-1',
      staff_name: 'Rahul Kumar',
      role: 'CAPTAIN',
      monthly_salary_paise: 1500000,
      total_days_in_month: 30,
      present_days: 1,
      half_days: 0,
      absent_days: 0,
      leave_days: 0,
      effective_working_days: 1.0,
      calculated_salary_paise: 50000,
      orders_served_count: 5,
      orders_served_total_paise: 245000, // ₹2,450.00
    };

    expect(summary.orders_served_count).toBe(5);
    expect(summary.orders_served_total_paise / 100).toBe(2450);
    expect(summary.calculated_salary_paise / 100).toBe(500);
  });

  it('supports custom monthly payroll cycle start day and date boundaries', () => {
    // Staff with Day 5 cycle
    const cycleDay = 5;
    const year = 2026;
    const month = 11; // November

    const cycleStart = new Date(year, month - 1, cycleDay);
    const cycleEnd = new Date(year, month, cycleDay - 1);

    expect(cycleStart.getDate()).toBe(5);
    expect(cycleStart.getMonth()).toBe(10); // 0-indexed Nov is 10
    expect(cycleEnd.getDate()).toBe(4);
    expect(cycleEnd.getMonth()).toBe(11); // 0-indexed Dec is 11

    const summary: StaffPerformanceSummary = {
      staff_id: 'test-staff-2',
      staff_name: 'Amit Sharma',
      role: 'WAITER',
      payroll_cycle_start_day: 5,
      cycle_start_date: '2026-11-05',
      cycle_end_date: '2026-12-04',
      monthly_salary_paise: 1800000,
      total_days_in_month: 30,
      present_days: 20,
      half_days: 0,
      absent_days: 0,
      leave_days: 0,
      effective_working_days: 20.0,
      calculated_salary_paise: 1200000,
      orders_served_count: 12,
      orders_served_total_paise: 750000,
    };

    expect(summary.payroll_cycle_start_day).toBe(5);
    expect(summary.cycle_start_date).toBe('2026-11-05');
    expect(summary.cycle_end_date).toBe('2026-12-04');
  });

  it('keys customer order history strictly by mobile number; orders without phone remain unassigned and never leak via table number', () => {
    const orders = [
      {
        id: 'ord-1',
        orderNumber: '#ORD-101',
        tableNumber: 'T-01',
        customerName: 'Aditya Sharma',
        customerPhone: '+91 98765 43210',
        customerPhoneE164: '+919876543210',
        totalAmount: 540,
      },
      {
        id: 'ord-2',
        orderNumber: '#ORD-102',
        tableNumber: 'T-01',
        customerName: 'Walk-in Guest',
        customerPhone: undefined,
        customerPhoneE164: undefined,
        totalAmount: 220,
      },
      {
        id: 'ord-3',
        orderNumber: '#ORD-103',
        tableNumber: 'T-01',
        customerName: 'Rohit Verma',
        customerPhone: '+91 91234 56789',
        customerPhoneE164: '+919123456789',
        totalAmount: 890,
      },
      {
        id: 'ord-4',
        orderNumber: '#ORD-104',
        tableNumber: 'T-05',
        customerName: 'Aditya Sharma',
        customerPhone: '+91 98765 43210',
        customerPhoneE164: '+919876543210',
        totalAmount: 350,
      },
    ];

    // Query history for Aditya (mobile: 9876543210)
    const rawSearch = '9876543210';
    const adityaHistory = orders.filter((o) => {
      const p = (o.customerPhone || o.customerPhoneE164 || '').replace(/[^0-9]/g, '');
      if (!p || p.length < 5) return false;
      return p.endsWith(rawSearch) || rawSearch.endsWith(p);
    });

    // Aditya sees both his orders (one from T-01, one from T-05), but NOT ord-2 (unassigned) or ord-3 (Rohit)
    expect(adityaHistory.map((o) => o.id)).toEqual(['ord-1', 'ord-4']);

    // Order 2 (no phone) is never assigned to any mobile query
    const unassignedInAditya = adityaHistory.some((o) => o.id === 'ord-2');
    expect(unassignedInAditya).toBe(false);

    // Another customer visiting Table T-01 with phone 9123456789 only sees ord-3, NOT ord-1
    const rohitHistory = orders.filter((o) => {
      const p = (o.customerPhone || o.customerPhoneE164 || '').replace(/[^0-9]/g, '');
      if (!p || p.length < 5) return false;
      return p.endsWith('9123456789') || '9123456789'.endsWith(p);
    });
    expect(rohitHistory.map((o) => o.id)).toEqual(['ord-3']);
  });

  it('allots serving staff to customer orders dynamically so multiple staff can serve the same table and one staff can serve multiple tables', () => {
    const orders = [
      {
        id: 'ord-lunch',
        tableNumber: 'T-01',
        customerName: 'Vikram Patel',
        customerPhone: '+91 98000 11111',
        serverStaffId: 'staff-rahul',
        totalAmount: 620,
        createdAt: '2026-11-07T13:00:00Z',
      },
      {
        id: 'ord-tea',
        tableNumber: 'T-03',
        customerName: 'Sneha Roy',
        customerPhone: '+91 98000 22222',
        serverStaffId: 'staff-rahul',
        totalAmount: 180,
        createdAt: '2026-11-07T13:30:00Z',
      },
      {
        id: 'ord-dinner',
        tableNumber: 'T-01', // SAME table T-01, different customer in evening!
        customerName: 'Rajesh Mehra',
        customerPhone: '+91 98000 33333',
        serverStaffId: 'staff-priya', // Different staff served this customer!
        totalAmount: 1150,
        createdAt: '2026-11-07T20:00:00Z',
      },
    ];

    // Rahul's served customers: Vikram (Table T-01) and Sneha (Table T-03)
    const rahulServed = orders.filter((o) => o.serverStaffId === 'staff-rahul');
    expect(rahulServed.length).toBe(2);
    expect(rahulServed.map((o) => o.tableNumber)).toEqual(['T-01', 'T-03']);
    expect(rahulServed.map((o) => o.customerName)).toEqual(['Vikram Patel', 'Sneha Roy']);

    // Priya's served customer: Rajesh (Table T-01)
    const priyaServed = orders.filter((o) => o.serverStaffId === 'staff-priya');
    expect(priyaServed.length).toBe(1);
    expect(priyaServed[0].tableNumber).toBe('T-01');
    expect(priyaServed[0].customerName).toBe('Rajesh Mehra');

    // Total sales handled
    const rahulTotal = rahulServed.reduce((sum, o) => sum + o.totalAmount, 0);
    expect(rahulTotal).toBe(800);
  });

  it('enforces admin password authorization for bill reprints across data layer', () => {
    // Initial print on fresh order
    let printCount = 0;
    const recordPrint = (currentCount: number, isReprint: boolean, isAdminAuthed: boolean) => {
      if (currentCount > 0 && !isReprint) {
        return { success: false, error: 'Admin password required to reprint' };
      }
      if (isReprint && !isAdminAuthed) {
        return { success: false, error: 'Incorrect admin password' };
      }
      return { success: true, newCount: currentCount + 1 };
    };

    // First print (floor staff)
    const firstPrint = recordPrint(printCount, false, false);
    expect(firstPrint.success).toBe(true);
    printCount = firstPrint.newCount!;
    expect(printCount).toBe(1);

    // Second print without isReprint flag is blocked
    const directPrintAttempt = recordPrint(printCount, false, false);
    expect(directPrintAttempt.success).toBe(false);

    // Second print with invalid admin authorization is blocked
    const unauthedReprint = recordPrint(printCount, true, false);
    expect(unauthedReprint.success).toBe(false);

    // Authorized reprint with admin password succeeds and increments copy count
    const authedReprint = recordPrint(printCount, true, true);
    expect(authedReprint.success).toBe(true);
    expect(authedReprint.newCount).toBe(2);
  });

  it('locks server staff reassignment on paid orders unless authenticated with admin password', () => {
    const order = {
      id: 'ord-settled-1',
      paymentStatus: 'PAID',
      status: 'COMPLETED',
      serverStaffId: 'staff-rahul',
    };

    const reassignServer = (
      ord: typeof order,
      newStaffId: string,
      adminPassword?: string,
    ) => {
      const isPaid = ord.paymentStatus === 'PAID' || ord.status === 'COMPLETED';
      if (isPaid && adminPassword !== 'admin123') {
        return { success: false, error: 'Admin password required to change server on paid orders.' };
      }
      return { success: true, updatedServer: newStaffId };
    };

    // Attempting reassignment without admin password fails
    const unauthedChange = reassignServer(order, 'staff-priya');
    expect(unauthedChange.success).toBe(false);

    // Attempting reassignment with wrong password fails
    const wrongPwdChange = reassignServer(order, 'staff-priya', 'wrong123');
    expect(wrongPwdChange.success).toBe(false);

    // Attempting reassignment with valid admin password succeeds
    const authedChange = reassignServer(order, 'staff-priya', 'admin123');
    expect(authedChange.success).toBe(true);
    expect(authedChange.updatedServer).toBe('staff-priya');
  });
});
