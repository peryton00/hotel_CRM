import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmptyStateComponent } from './empty-state.component';

describe('EmptyStateComponent', () => {
  let component: EmptyStateComponent;
  let fixture: ComponentFixture<EmptyStateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmptyStateComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EmptyStateComponent);
    component = fixture.componentInstance;
  });

  it('renders default empty state without action button', () => {
    fixture.componentRef.setInput('title', 'No Records Found');
    fixture.componentRef.setInput('message', 'Try adjusting your filters or date range.');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty-title')?.textContent).toContain('No Records Found');
    expect(compiled.querySelector('.empty-description')?.textContent).toContain(
      'Try adjusting your filters or date range.',
    );
    expect(compiled.querySelector('.empty-action-btn')).toBeNull();
  });

  it('renders action button and emits actionClick on user click', () => {
    fixture.componentRef.setInput('title', 'No Active Orders');
    fixture.componentRef.setInput('actionText', 'Create Manual Order');
    fixture.componentRef.setInput('actionIcon', 'ph-plus-circle');
    fixture.detectChanges();

    const emitSpy = vi.fn();
    component.actionClick.subscribe(emitSpy);

    const compiled = fixture.nativeElement as HTMLElement;
    const actionBtn = compiled.querySelector('.empty-action-btn') as HTMLButtonElement;
    expect(actionBtn).not.toBeNull();
    expect(actionBtn.textContent).toContain('Create Manual Order');
    expect(actionBtn.querySelector('.ph-plus-circle')).not.toBeNull();

    actionBtn.click();
    expect(emitSpy).toHaveBeenCalledTimes(1);
  });

  it('renders secondary action when provided', () => {
    fixture.componentRef.setInput('title', 'No Tables Found');
    fixture.componentRef.setInput('actionText', 'Add Table');
    fixture.componentRef.setInput('secondaryActionText', 'Reset Filter');
    fixture.detectChanges();

    const secondarySpy = vi.fn();
    component.secondaryActionClick.subscribe(secondarySpy);

    const compiled = fixture.nativeElement as HTMLElement;
    const secondaryBtn = compiled.querySelector('.empty-secondary-btn') as HTMLButtonElement;
    expect(secondaryBtn).not.toBeNull();
    expect(secondaryBtn.textContent).toContain('Reset Filter');

    secondaryBtn.click();
    expect(secondarySpy).toHaveBeenCalledTimes(1);
  });

  it('supports compact mode and custom icon', () => {
    fixture.componentRef.setInput('title', 'No items');
    fixture.componentRef.setInput('icon', 'ph-fork-knife');
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty-state-wrapper.compact')).not.toBeNull();
    expect(compiled.querySelector('.ph-fork-knife')).not.toBeNull();
  });
});
