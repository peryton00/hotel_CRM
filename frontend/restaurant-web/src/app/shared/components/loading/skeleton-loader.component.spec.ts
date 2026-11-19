import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { SkeletonLoaderComponent } from './skeleton-loader.component';

describe('SkeletonLoaderComponent', () => {
  let component: SkeletonLoaderComponent;
  let fixture: ComponentFixture<SkeletonLoaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonLoaderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SkeletonLoaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render base skeleton text by default', () => {
    expect(component).toBeTruthy();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.skeleton-text')).toBeTruthy();
  });

  it('should render multiple items when count is specified', () => {
    fixture.componentRef.setInput('variant', 'stat-card');
    fixture.componentRef.setInput('count', 4);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const cards = el.querySelectorAll('.skeleton-stat-card');
    expect(cards.length).toBe(4);
  });

  it('should render realistic order card variant matching order queue cards', () => {
    fixture.componentRef.setInput('variant', 'order-card');
    fixture.componentRef.setInput('count', 2);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const cards = el.querySelectorAll('.skeleton-order-card');
    expect(cards.length).toBe(2);
    expect(el.querySelector('.order-card-stepper')).toBeTruthy();
    expect(el.querySelector('.order-card-dishes')).toBeTruthy();
  });

  it('should render realistic horizontal food card matching customer menu', () => {
    fixture.componentRef.setInput('variant', 'food-card');
    fixture.componentRef.setInput('count', 3);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const cards = el.querySelectorAll('.skeleton-food-card');
    expect(cards.length).toBe(3);
    expect(el.querySelector('.food-card-left')).toBeTruthy();
    expect(el.querySelector('.food-card-right')).toBeTruthy();
  });

  it('should render realistic customer row with avatar and action placeholders', () => {
    fixture.componentRef.setInput('variant', 'customer-row');
    fixture.componentRef.setInput('count', 2);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('.customer-row-layout');
    expect(rows.length).toBe(2);
  });

  it('should render realistic floor plan canvas skeleton', () => {
    fixture.componentRef.setInput('variant', 'canvas-floor');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.skeleton-canvas-floor')).toBeTruthy();
    expect(el.querySelector('.canvas-corridor')).toBeTruthy();
    expect(el.querySelectorAll('.canvas-room-box').length).toBe(2);
  });

  it('should enable contents layout for grid and card variants so cards render side-by-side in CSS grids', () => {
    fixture.componentRef.setInput('variant', 'order-card');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.classList.contains('skeleton-contents')).toBe(true);
    expect(host.querySelector('.skeleton-host.layout-contents')).toBeTruthy();

    fixture.componentRef.setInput('variant', 'customer-row');
    fixture.detectChanges();
    expect(host.classList.contains('skeleton-contents')).toBe(false);
    expect(host.classList.contains('skeleton-block')).toBe(true);
  });
});
