# Design System & Styling Guide

## 1. Brand Identity & Color System
The platform adheres strictly to the 5 authoritative brand colors:

| Color Name | Hex Code | Primary Semantic Purpose |
|------------|----------|--------------------------|
| **Crimson Ember** | `#C21807` | Primary buttons, active tabs, urgency accents, customer "Add" buttons, key CTAs |
| **Bone White** | `#F6F2EB` | App canvas background, light cards, customer menu background |
| **Onyx Black** | `#121212` | Dark sidebar, primary typography, high-contrast badges, headers |
| **Gold Leaf** | `#D4AF37` | Premium badges, special discounts, VIP customer highlights, loyalty crowns |
| **Warm Taupe** | `#A39181` | Muted subtitles, subtle borders, inactive step indicators, meta labels |

### Semantic Color Variables (Tokens)
```scss
:root {
  --color-crimson: #C21807;
  --color-bone: #F6F2EB;
  --color-onyx: #121212;
  --color-gold: #D4AF37;
  --color-taupe: #A39181;

  --color-primary: var(--color-crimson);
  --color-primary-hover: #a11406;
  --color-background: var(--color-bone);
  --color-text-primary: var(--color-onyx);
  --color-accent: var(--color-gold);
  --color-muted: var(--color-taupe);

  --color-surface: #FFFFFF;
  --color-surface-hover: #FAF7F2;
  --color-border: #E5DED4;
  --color-border-subtle: #F0EAE1;

  --color-success: #26734D;
  --color-success-bg: #EAF4EE;
  --color-warning: #946200;
  --color-warning-bg: #FEF6E7;
  --color-danger: #B42318;
  --color-danger-bg: #FDF2F2;
  --color-info: #245B8F;
  --color-info-bg: #EEF4F9;
}
```

---

## 2. Typography
- **Primary Display Font**: `Libre Baskerville` (serif)
  - Used selectively for restaurant brand title, major hero headers, promotional discount callouts, and printed invoice headers.
- **Interface Font**: `Inter` (sans-serif)
  - Used for navigation, high-density data tables, forms, pricing numbers, dashboard metrics, button labels, and order line items.

---

## 3. Component Design Rules
- **No CSS frameworks**: Vanilla SCSS only. No Bootstrap, no Tailwind CSS, no Material UI, no PrimeNG.
- **Elevation**: Subtle layered shadows (`0 2px 8px rgba(18, 18, 18, 0.06)`).
- **Radius**: Consistent 8px for cards and inputs, 20px / 9999px for pill badges and circular avatars.
- **Iconography**: Phosphor Icons (SVG / web fonts) with consistent 20px / 24px bounding box and 1.5 - 2px stroke weight.
- **Accessibility & Contrast**: High contrast text on Bone White (minimum 4.5:1 ratio for body copy). Gold is never used for unbacked text on white/bone backgrounds.
