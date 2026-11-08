// SEO pages for the gallery examples: /templates and /templates/<name>. Each one shows a preview, what's
// inside, how to change it with AI, and opens the example in the editor (/?remix=<slug>).
// Run: node scripts/templates-pages.mjs   (previews are public/templates/img/<slug>.webp, made separately)
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const ORIGIN = 'https://openconstructor.pw';
const T = [
  { slug: 'lumen-studio', path: 'led-studio-website-template', kind: 'cinematic', name: 'LED & light studio website template', short: 'Light studio',
    who: 'LED, light-art and AV installation studios', sections: ['header with menu', 'hero with a glowing CSS 3D frame', 'scroll-lit mission statement', 'product grid with a particle cube', 'numbered services 01–04', 'case study showcase', 'selected work rail', 'client logo marquee', 'neon grid call to action and footer'],
    prompts: ['Make it about a wedding lighting company in Barcelona', 'Change the accent to warm amber', 'Add a pricing section with three packages'] },
  { slug: 'orbit-labs', path: 'ai-startup-website-template', kind: 'cinematic', name: 'AI startup website template', short: 'AI startup',
    who: 'AI labs, developer tools and tech startups', sections: ['header with menu', 'hero with a glowing CSS 3D frame', 'scroll-lit mission statement', 'model lineup', 'platform features 01–04', 'customer case study', 'production deployments', 'logo marquee', 'call to action and footer'],
    prompts: ['Rename it to Nova AI and write it for a legal-tech product', 'Add an API code example section', 'Make the hero headline shorter and bolder'] },
  { slug: 'ember-roasters', path: 'coffee-shop-website-template', kind: 'cinematic', name: 'Coffee shop website template', short: 'Coffee roasters',
    who: 'coffee shops, roasteries and cafés', sections: ['header with menu', 'hero with a glowing amber 3D frame', 'craft statement', 'bean lineup with tasting notes', 'what we do 01–04', 'roastery showcase', 'café locations', 'press logos', 'subscription call to action and footer'],
    prompts: ['Make it a bakery called Crumb in Lisbon', 'Add a menu with prices', 'Translate the whole page into Spanish'] },
  { slug: 'velocity-ev', path: 'car-brand-website-template', kind: 'cinematic', name: 'Electric car brand website template', short: 'Electric cars',
    who: 'car brands, EV startups and dealerships', sections: ['header with menu', 'hero with a glowing cyan 3D frame', 'engineering statement', 'model lineup with specs', 'ownership services 01–04', 'record-lap case study', 'milestones', 'press logos', 'test drive call to action and footer'],
    prompts: ['Make it an electric motorbike brand', 'Add a specs comparison table', 'Change the accent to racing red'] },
  { slug: 'aurum-residences', path: 'luxury-real-estate-website-template', kind: 'cinematic', name: 'Luxury real estate website template', short: 'Luxury residences',
    who: 'luxury real estate, developers and agencies', sections: ['header with menu', 'hero with a glowing gold 3D frame', 'philosophy statement', 'residence types with sizes', 'amenities 01–04', 'sky garden showcase', 'neighbourhood highlights', 'partner logos', 'viewing request call to action and footer'],
    prompts: ['Make it a beach villa resort in Bali', 'Add a floor plan section', 'Add a contact form for viewing requests'] },
  { slug: 'pulse-fitness', path: 'gym-website-template', kind: 'cinematic', name: 'Gym & fitness club website template', short: 'Fitness club',
    who: 'gyms, boutique fitness studios and personal trainers', sections: ['header with menu', 'hero with a glowing magenta 3D frame', 'energy statement', 'class types with durations', 'membership perks 01–04', 'studio showcase', 'studio locations', 'member logos', 'free class call to action and footer'],
    prompts: ['Make it a yoga studio with a calm green accent', 'Add a weekly class timetable', 'Add pricing with three membership plans'] },
  { slug: 'brewline-bistro', path: 'restaurant-website-template', kind: 'landing', name: 'Restaurant website template', short: 'Bistro',
    who: 'restaurants, bistros and bars', sections: ['header with menu', 'restaurant menu with prices', 'guest testimonials', 'contact details and form', 'footer'],
    prompts: ['Make it a sushi bar called Kaze', 'Add a table booking form', 'Make the design dark and moody'] },
  { slug: 'tempo-planner', path: 'waitlist-landing-page-template', kind: 'landing', name: 'Waitlist landing page template', short: 'Waitlist',
    who: 'startups collecting early sign-ups before launch', sections: ['waitlist hero with an e-mail form', 'how it works in three steps', 'big number metrics', 'two-column FAQ', 'footer'],
    prompts: ['Make it for a habit-tracking app called Streak', 'Add a countdown to the launch date', 'Change the colours to deep blue'] },
  { slug: 'flowdesk-saas', path: 'saas-landing-page-template', kind: 'landing', name: 'SaaS landing page template', short: 'SaaS',
    who: 'SaaS products and B2B software', sections: ['mesh gradient hero', 'alternating feature rows', 'pricing tiers', 'security and trust', 'gradient call to action', 'footer'],
    prompts: ['Make it for an invoicing tool called Ledgerly', 'Add a customer logo strip', 'Add a monthly / yearly pricing toggle'] },
  { slug: 'olive-grove-hotel', path: 'boutique-hotel-website-template', kind: 'landing', name: 'Boutique hotel website template', short: 'Boutique hotel',
    who: 'boutique hotels, B&Bs and guest houses', sections: ['header with menu', 'image gallery hero', 'portfolio grid of rooms and places', 'featured story', 'team grid', 'footer'],
    prompts: ['Make it a mountain chalet in the Alps', 'Add a booking form with dates', 'Add guest reviews'] },
  { slug: 'summit-conference', path: 'conference-website-template', kind: 'landing', name: 'Conference & event website template', short: 'Conference',
    who: 'conferences, meetups and events', sections: ['header with menu', 'video showcase', 'event agenda', 'press and awards', 'ticket call to action', 'footer'],
    prompts: ['Make it a design conference in Berlin', 'Add a speakers grid', 'Add ticket pricing'] },
  { slug: 'pocket-money', path: 'mobile-app-landing-page-template', kind: 'landing', name: 'Mobile app landing page template', short: 'Mobile app',
    who: 'mobile apps and app launches', sections: ['app download hero with a phone mockup', 'alternating feature rows', 'product roadmap', 'featured blog post', 'footer'],
    prompts: ['Make it a meditation app called Still', 'Add App Store ratings and reviews', 'Add a FAQ section'] },
];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nav = cur => `<header class="top">
  <a class="home" href="/"><img src="/favicon.svg" alt="" width="24" height="24"><span><i>open</i>constructor</span></a>
  <nav aria-label="Guides">
    <a href="/templates"${cur === 'templates' ? ' aria-current="page"' : ''}>Templates</a>
    <a href="/components">Components</a>
    <a href="/ai-ui-generator">AI generator</a>
    <a href="/gallery">Gallery</a>
  </nav>
</header>`;
const foot = `<footer><a href="/">openconstructor</a><a href="/templates">Templates</a><a href="/gallery">Gallery</a><a href="https://github.com/Kuloka/openconstructor">GitHub</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></footer>`;
const head = ({ title, desc, url, image, ld }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#0c0a09">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta property="og:type" content="article">
<meta property="og:site_name" content="openconstructor">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${image}">
<link rel="stylesheet" href="/pages.css">
<style>
  .shot { display: block; margin: 22px 0 8px; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--panel); }
  .shot img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; object-position: top; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 18px 0 6px; }
  .actions .cta { margin: 0; }
  .ghost { display: inline-flex; padding: 13px 22px; border: 1px solid var(--line); border-radius: 10px; color: var(--head); text-decoration: none; font-weight: 600; }
  .ghost:hover { border-color: var(--accent); }
  .tpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; margin: 18px 0; padding: 0; list-style: none; }
  .tpl-grid a { display: block; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--panel); color: var(--head); text-decoration: none; }
  .tpl-grid a:hover { border-color: var(--accent); }
  .tpl-grid img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; object-position: top; }
  .tpl-grid b { display: block; padding: 10px 12px 2px; font-size: 15px; }
  .tpl-grid span { display: block; padding: 0 12px 12px; color: var(--muted); font-size: 13.5px; }
  blockquote { margin: 8px 0; padding: 10px 14px; border-left: 3px solid var(--accent); border-radius: 6px; background: var(--panel); color: var(--head); font-family: ui-monospace, Consolas, monospace; font-size: 14px; }
</style>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>`;

const img = t => `/templates/img/${t.slug}.webp`;
const card = t => `<li><a href="/templates/${t.path}"><img src="${img(t)}" alt="${esc(t.name)} preview" loading="lazy" width="960" height="600"><b>${esc(t.short)}</b><span>${esc(t.name)}</span></a></li>`;

function page(t){
  const url = `${ORIGIN}/templates/${t.path}`;
  const style = t.kind === 'cinematic' ? 'a dark, cinematic 3D style — neon CSS 3D objects, glowing light and scroll animations' : 'a clean, modern light style';
  const title = `Free ${t.name} — edit with AI | openconstructor`;
  const desc = `A free ${t.name.toLowerCase()} for ${t.who}: ${style.split(' — ')[0]}. Open it in the browser, change texts and colours by asking the AI, publish or export HTML.`;
  const faq = [
    ['Is this template free?', 'Yes. The template and the editor are free and open source (MIT). You can use the result in personal and commercial projects.'],
    ['Do I need to know how to code?', 'No. Open the template, then type what you want changed — “make it a bakery in Lisbon”, “change the accent to green” — and the AI rewrites the page. You can also edit any text or the HTML and CSS by hand.'],
    ['Can I publish it on my own domain?', 'Yes. Publish in one click to a free openconstructor.pw link, connect your own domain, or export a static HTML site or a React / Vue / Svelte project.'],
    ['Does it work on phones?', 'Yes. The sections are responsive and stack into one column on small screens.'],
  ];
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', name: title, description: desc, url, inLanguage: 'en', isPartOf: { '@type': 'WebSite', name: 'openconstructor', url: ORIGIN + '/' } },
    { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ] };
  const others = T.filter(x => x !== t).sort((a, b) => (a.kind === t.kind ? -1 : 1) - (b.kind === t.kind ? -1 : 1)).slice(0, 6);
  return `${head({ title, desc, url, image: ORIGIN + img(t), ld })}
<body>
${nav('templates')}
<main>
  <p class="kicker">Free template · ${t.kind === 'cinematic' ? 'cinematic 3D' : 'landing page'}</p>
  <h1>${esc(t.name)}</h1>
  <p class="lead">A ready-made website for ${esc(t.who)}, in ${esc(style)}. Open it in the editor, tell the AI what your business is, and get your own page in a minute — no code, no sign-up needed to start.</p>
  <div class="actions"><a class="cta" href="/?remix=${t.slug}">Open in the editor →</a><a class="ghost" href="/p/${t.slug}" target="_blank" rel="noopener">View live ↗</a></div>
  <a class="shot" href="/p/${t.slug}" target="_blank" rel="noopener"><img src="${img(t)}" alt="${esc(t.name)} — preview of the first screen" width="960" height="600"></a>

  <h2>What's inside</h2>
  <ul>${t.sections.map(s => `<li>${esc(s[0].toUpperCase() + s.slice(1))}</li>`).join('')}</ul>
  <p>Every section is plain HTML and CSS with no framework${t.kind === 'cinematic' ? ', and the 3D objects and scroll effects are pure CSS too — the page runs without JavaScript' : ''}.</p>

  <h2>Make it yours with AI</h2>
  <p>Click <b>Open in the editor</b>, then type requests like these in the AI chat:</p>
  ${t.prompts.map(p => `<blockquote>${esc(p)}</blockquote>`).join('\n  ')}
  <p>The free built-in AI needs no key: 3 tries a day without an account, 20 a day with a free account. Select one block to change only that part.</p>

  <h2>Publish or export</h2>
  <ul>
    <li><b>Publish</b> to a free link in one click, optionally on your own domain — forms on the page send messages to you.</li>
    <li><b>Export</b> a static HTML site or a ready <a href="/html-to-react-vue-svelte">React, Vue or Svelte</a> project as a .zip.</li>
  </ul>

  <h2 id="faq">FAQ</h2>
  ${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n  ')}

  <h2>More free templates</h2>
  <ul class="tpl-grid">${others.map(card).join('')}</ul>
  <p><a href="/templates">All templates →</a></p>
</main>
${foot}
</body>
</html>
`;
}

function index(){
  const url = `${ORIGIN}/templates`;
  const title = 'Free website templates you can edit with AI | openconstructor';
  const desc = 'Free website and landing page templates — cinematic 3D sites, SaaS, restaurant, coffee shop, gym, real estate, waitlist and more. Open in the browser, change them with AI, publish or export HTML.';
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description: desc, url, inLanguage: 'en',
    hasPart: T.map(t => ({ '@type': 'WebPage', name: t.name, url: `${ORIGIN}/templates/${t.path}` })) };
  const group = kind => T.filter(t => t.kind === kind).map(card).join('');
  return `${head({ title, desc, url, image: ORIGIN + img(T[0]), ld })}
<body>
${nav('templates')}
<main>
  <p class="kicker">Templates</p>
  <h1>Free website templates you can change with AI</h1>
  <p class="lead">Pick a template, open it in the editor and describe your business — the AI rewrites the texts, colours and sections for you. Free, open source, no sign-up needed to start.</p>
  <a class="cta" href="/">Or start from a blank page →</a>
  <h2>Cinematic 3D websites</h2>
  <p>Dark, award-style sites with neon CSS 3D objects and scroll animations.</p>
  <ul class="tpl-grid">${group('cinematic')}</ul>
  <h2>Landing pages</h2>
  <p>Clean, light pages for products, places and events.</p>
  <ul class="tpl-grid">${group('landing')}</ul>
  <h2>Need something else?</h2>
  <p>Describe it in the <a href="/">editor</a> — “a portfolio for a wedding photographer”, “a pricing page for my app” — or browse <a href="/components">320+ components</a> and what others built in the <a href="/gallery">gallery</a>.</p>
</main>
${foot}
</body>
</html>
`;
}

mkdirSync('public/templates/img', { recursive: true });
writeFileSync('public/templates.html', index());
for (const t of T) writeFileSync(`public/templates/${t.path}.html`, page(t));
const missing = T.filter(t => !existsSync(`public/templates/img/${t.slug}.webp`)).map(t => t.slug);
console.log('pages', T.length + 1, missing.length ? 'missing previews: ' + missing.join(', ') : 'all previews present');
export { T };
