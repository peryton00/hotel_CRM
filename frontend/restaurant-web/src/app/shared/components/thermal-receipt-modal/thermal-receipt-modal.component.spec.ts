import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { ThermalReceiptModalComponent } from './thermal-receipt-modal.component';
import { ThermalPrinterService } from '../../../core/services/thermal-printer.service';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { Order } from '../../../core/models/order.model';
import { Restaurant } from '../../../core/models/restaurant.model';

describe('ThermalReceiptModalComponent', () => {
  let component: ThermalReceiptModalComponent;
  let fixture: ComponentFixture<ThermalReceiptModalComponent>;
  let thermalService: ThermalPrinterService;
  let adminAuthService: AdminAuthService;

  const mockOrder: Order = {
    id: 'ord-test-101',
    orderNumber: 'ORD-101',
    restaurantSlug: 'gurukripa-dhaba',
    tableNumber: 'T-01',
    customerName: 'Aarav Sharma',
    customerPhone: '9876543210',
    orderType: 'DINE_IN',
    status: 'SERVED',
    paymentStatus: 'PAID',
    paymentMethod: 'UPI',
    items: [
      {
        id: 'oi-1',
        menuItemId: 'mi-1',
        name: 'Paneer Butter Masala',
        quantity: 2,
        unitPrice: 340,
        itemTotal: 680,
        selectedVariants: [],
        selectedAddons: [],
      },
      {
        id: 'oi-2',
        menuItemId: 'mi-2',
        name: 'Butter Naan',
        quantity: 4,
        unitPrice: 60,
        itemTotal: 240,
        selectedVariants: [],
        selectedAddons: [],
      },
    ],
    subtotal: 920,
    cgstAmount: 23,
    sgstAmount: 23,
    taxAmount: 46,
    discountAmount: 0,
    totalAmount: 966,
    createdAt: '2026-11-17T12:00:00Z',
    updatedAt: '2026-11-17T12:00:00Z',
    timeline: [],
    printCount: 0,
  };

  const mockRestaurant: Partial<Restaurant> = {
    name: 'Gurukripa Dhaba',
    tagline: 'Artisanal Awadhi Bistro',
    address: {
      street: 'G.T. Road',
      area: 'Near Highway Plaza',
      city: 'Ludhiana',
      state: 'Punjab',
      zip: '141001',
    },
    contact: {
      phone: '+91 98765 43210',
      email: 'info@gurukripadhaba.in',
      website: 'https://gurukripadhaba.in',
    },
    taxSettings: {
      gstNumber: '03AABCG1234F1Z5',
      cgstRate: 2.5,
      sgstRate: 2.5,
      enableGst: true,
      serviceChargeRate: 0,
    },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ThermalReceiptModalComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ThermalReceiptModalComponent);
    component = fixture.componentInstance;
    thermalService = TestBed.inject(ThermalPrinterService);
    adminAuthService = TestBed.inject(AdminAuthService);
  });

  it('does not render modal overlay when isOpen is false', () => {
    component.isOpen = false;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.modal-overlay')).toBeNull();
  });

  it('renders modal with connection details and thermal preview when isOpen is true', () => {
    component.isOpen = true;
    component.order = mockOrder;
    component.restaurant = mockRestaurant;
    component.effectivePrintCount = 0;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.modal-overlay')).not.toBeNull();
    expect(compiled.querySelector('.modal-title')?.textContent).toContain(
      'Thermal Receipt Print & Preview',
    );

    const monoContent = compiled.querySelector('.paper-mono-content')?.textContent;
    expect(monoContent).toContain('Gurukripa Dhaba');
    expect(monoContent).toContain('Paneer Butter Masala');
    expect(monoContent).toContain('966.00');
  });

  it('switches paper width to 58mm and updates monospace preview width', () => {
    component.isOpen = true;
    component.order = mockOrder;
    component.restaurant = mockRestaurant;
    fixture.detectChanges();

    component.onPaperWidthChange('58mm');
    fixture.detectChanges();

    expect(component.config().paperWidth).toBe('58mm');
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.receipt-paper.paper-58mm')).not.toBeNull();
  });

  it('emits close event when close button or backdrop is clicked', () => {
    component.isOpen = true;
    fixture.detectChanges();

    const closeSpy = vi.fn();
    component.close.subscribe(closeSpy);

    component.onClose();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('triggers window.print and emits printed event on system print fallback', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const printedSpy = vi.fn();
    component.printed.subscribe(printedSpy);

    component.isOpen = true;
    component.order = mockOrder;
    component.effectivePrintCount = 0;
    fixture.detectChanges();

    component.onSystemPrint();

    expect(printSpy).toHaveBeenCalled();
    expect(printedSpy).toHaveBeenCalledWith({
      method: 'BROWSER',
      printCount: 1,
    });
    printSpy.mockRestore();
  });

  it('dispatches test ticket to hardware on testHardwareConnection', () => {
    const testPrintSpy = vi
      .spyOn(thermalService, 'testPrint')
      .mockReturnValue(of({ success: true, message: 'OK', bytes_written: 420 }));

    component.isOpen = true;
    component.restaurant = mockRestaurant;
    fixture.detectChanges();

    component.testHardwareConnection();

    expect(testPrintSpy).toHaveBeenCalled();
    expect(component.statusMessage()?.type).toBe('success');
    expect(component.statusMessage()?.text).toContain('Hardware communication verified');
  });

  it('requires admin password for duplicate reprint when effectivePrintCount > 0', async () => {
    component.isOpen = true;
    component.order = mockOrder;
    component.effectivePrintCount = 1;
    fixture.detectChanges();

    component.onThermalPrintClick();
    expect(component.showAdminAuth()).toBe(true);

    // Wrong password
    vi.spyOn(adminAuthService, 'verifyAdminPassword').mockResolvedValue(false);
    component.adminPasswordInput = 'wrong';
    await component.authorizeAndPrint();
    expect(component.adminAuthError()).toContain('Incorrect admin password');

    // Correct password
    vi.spyOn(adminAuthService, 'verifyAdminPassword').mockResolvedValue(true);
    const printOrderSpy = vi
      .spyOn(thermalService, 'printOrderReceipt')
      .mockReturnValue(of({ success: true, message: 'OK', bytes_written: 850 }));

    component.adminPasswordInput = '1234';
    await component.authorizeAndPrint();

    expect(component.showAdminAuth()).toBe(false);
    expect(printOrderSpy).toHaveBeenCalled();
  });
});
