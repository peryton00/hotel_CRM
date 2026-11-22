import { initGlobalDoubleClickPrevention } from './prevent-double-click';

describe('Global Double-Click Prevention', () => {
  beforeAll(() => {
    initGlobalDoubleClickPrevention();
  });

  it('allows the first click on a button and sets data-click-locked', () => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    document.body.appendChild(btn);

    let clicked = false;
    btn.addEventListener('click', () => {
      clicked = true;
    });

    btn.click();
    expect(clicked).toBe(true);
    expect(btn.getAttribute('data-click-locked')).toBe('true');

    document.body.removeChild(btn);
  });

  it('blocks a second rapid click on the same button', () => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    document.body.appendChild(btn);

    let clickCount = 0;
    btn.addEventListener('click', () => {
      clickCount++;
    });

    // First click
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(clickCount).toBe(1);

    // Rapid second click (detail 2 or while locked)
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 }));
    expect(clickCount).toBe(1); // Still 1, 2nd click blocked

    document.body.removeChild(btn);
  });

  it('exempts quantity buttons from double-click blocking', () => {
    const qtyBtn = document.createElement('button');
    qtyBtn.className = 'qty-btn';
    qtyBtn.setAttribute('aria-label', 'Increase quantity');
    document.body.appendChild(qtyBtn);

    let clickCount = 0;
    qtyBtn.addEventListener('click', () => {
      clickCount++;
    });

    qtyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    qtyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 }));
    qtyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 3 }));

    expect(clickCount).toBe(3); // All registered
    document.body.removeChild(qtyBtn);
  });

  it('exempts text inputs from click blocking', () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);

    let clickCount = 0;
    input.addEventListener('click', () => {
      clickCount++;
    });

    input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 }));

    expect(clickCount).toBe(2);
    document.body.removeChild(input);
  });
});
