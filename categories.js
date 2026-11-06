// Catalog sections, in the order they appear in the side panel.
// `icon` is the inner markup of a 24×24 stroke SVG.
export const CATEGORIES = [
  { id: 'AI & Chat', icon: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>' },
  { id: 'Buttons', icon: '<rect x="3" y="8" width="18" height="8" rx="4"/>' },
  { id: 'Forms & Inputs', icon: '<rect x="3" y="5" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="11" height="5" rx="1.5"/>' },
  { id: 'Navigation', icon: '<path d="M4 6h16M4 12h10M4 18h16"/>' },
  { id: 'Cards', icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/>' },
  { id: 'Data & Dashboard', icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>' },
  { id: 'Feedback & Overlays', icon: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>' },
  { id: 'Auth', icon: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>' },
  { id: 'Pricing & Commerce', icon: '<path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>' },
  { id: 'Landing sections', icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M8 13h8M10 16h4"/>' },
  { id: 'Content & Media', icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>' },
  { id: 'Effects', icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>' },
];

// Older components were tagged with broad categories; move each into its specialised section.
const MOVE = {
  'Forms & Inputs': ['Search', 'Text field', 'Switch', 'Checkbox', 'Select', 'Text area with counter', 'Slider', 'File upload', 'Radio cards', 'Segmented control', 'Tags input', 'Star rating', 'Date field', 'Color swatches', 'Contact form'],
  'AI & Chat': ['Chat bubbles', 'Typewriter'],
  'Navigation': ['Navbar', 'Tabs', 'Breadcrumbs', 'Pagination', 'Steps', 'Dropdown menu', 'Keyboard shortcuts'],
  'Cards': ['Card', 'Profile', 'Review', 'Avatars', 'Kanban card', 'Spotlight card'],
  'Data & Dashboard': ['Table', 'Metric', 'Progress', 'Progress ring', 'Calendar', 'Dashboard shell', 'Stats band'],
  'Feedback & Overlays': ['Status', 'Notification', 'Notification bell', 'Warning', 'Error', 'Toast', 'Tooltip', 'Modal dialog', 'Empty state', 'Skeleton', 'Loading dots'],
  'Auth': ['Sign-in form', 'Social sign-in', 'SMS code', 'Password strength'],
  'Pricing & Commerce': ['Pricing', 'Plan picker'],
  'Landing sections': ['Hero', 'Features', 'Testimonials', 'Call to action', 'Footer', 'FAQ', 'Logo cloud', 'Blog cards', 'Team', 'Bento grid', 'Changelog', '404 page', 'Newsletter signup'],
  'Content & Media': ['Code block', 'Accordion'],
};
const LOOKUP = Object.fromEntries(Object.entries(MOVE).flatMap(([cat, names]) => names.map(n => [n, cat])));
const FALLBACK = { Inputs: 'Forms & Inputs', Elements: 'Cards', Sections: 'Landing sections' };

export const categorize = list => list.map(p => ({ ...p, category: LOOKUP[p.name] || FALLBACK[p.category] || p.category }));
