// Ready-made starter templates. Each item is self-contained HTML+CSS (no JS), like everything on the canvas.
const ARROW = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
const CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

const hero = `<style>
.lh{position:relative;height:760px;box-sizing:border-box;overflow:hidden;font-family:system-ui,sans-serif;color:#fafafa}
.lh:before{content:"";position:absolute;left:50%;top:-260px;width:1100px;height:700px;transform:translateX(-50%);background:radial-gradient(closest-side,#9e7aff55,#fe8bbb22 55%,transparent);filter:blur(30px)}
.lh-nav{position:relative;display:flex;align-items:center;justify-content:space-between;max-width:1200px;margin:0 auto;padding:24px 32px}
.lh-logo{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px}
.lh-logo i{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#9e7aff,#fe8bbb)}
.lh-links{display:flex;gap:32px;color:#a1a1aa;font-size:14px}
.lh-cta-sm{padding:9px 16px;border-radius:9px;background:#fafafa;color:#18181b;font-size:14px;font-weight:600}
.lh-body{position:relative;max-width:900px;margin:72px auto 0;text-align:center;padding:0 32px}
.lh-badge{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border:1px solid #ffffff1f;border-radius:999px;background:#ffffff0a;color:#d4d4d8;font-size:13px}
.lh-badge b{padding:2px 8px;border-radius:999px;background:#9e7aff;color:#fff;font-size:11px}
.lh h1{margin:28px 0 20px;font-size:68px;line-height:1.02;letter-spacing:-3px;font-weight:800}
.lh h1 span{background:linear-gradient(90deg,#c4b5fd,#fe8bbb);-webkit-background-clip:text;background-clip:text;color:transparent}
.lh p{max-width:600px;margin:0 auto;color:#a1a1aa;font-size:19px;line-height:1.6}
.lh-actions{display:flex;justify-content:center;gap:12px;margin-top:36px}
.lh-btn{display:inline-flex;align-items:center;gap:8px;height:48px;padding:0 24px;border-radius:12px;font-size:15px;font-weight:600}
.lh-btn.p{background:#fafafa;color:#18181b;box-shadow:0 10px 30px -10px #fff6}
.lh-btn.s{border:1px solid #3f3f46;color:#fafafa;background:#09090b}
.lh-trust{display:flex;justify-content:center;gap:40px;margin-top:64px;color:#52525b;font-weight:700;font-size:18px;letter-spacing:.5px}
</style><section class="lh"><nav class="lh-nav"><div class="lh-logo"><i></i>Nova</div><div class="lh-links"><span><a href="#product" style="color:inherit;text-decoration:none">Product</a></span><span><a href="#pricing" style="color:inherit;text-decoration:none">Pricing</a></span><span><a href="#blog" style="color:inherit;text-decoration:none">Blog</a></span><span><a href="#docs" style="color:inherit;text-decoration:none">Docs</a></span></div><a class="lh-cta-sm" href="#" style="text-decoration:none">Log in</a></nav><div class="lh-body"><span class="lh-badge"><b>New</b> Version 2.0 is out now</span><h1>Ship products <span>10x faster</span></h1><p>Nova brings analytics, tasks and your team together in one place. No complicated setup — just connect and go.</p><div class="lh-actions"><a class="lh-btn p" href="#" style="text-decoration:none">Try it free ${ARROW}</a><a class="lh-btn s" href="#" style="text-decoration:none">Watch demo</a></div><div class="lh-trust"><span>ACME</span><span>Globex</span><span>Initech</span><span>Umbrella</span><span>Hooli</span></div></div></section>`;

const features = `<style>
.lf{height:560px;box-sizing:border-box;padding:80px 32px;font-family:system-ui,sans-serif;color:#fafafa;border-top:1px solid #ffffff0f}
.lf-head{max-width:1200px;margin:0 auto 48px;display:flex;justify-content:space-between;align-items:end;gap:40px}
.lf-head small{color:#c4b5fd;font-weight:600;letter-spacing:1.5px;font-size:12px}
.lf-head h2{margin:10px 0 0;font-size:42px;letter-spacing:-1.5px;line-height:1.1;max-width:560px}
.lf-head p{max-width:380px;margin:0;color:#a1a1aa;font-size:16px;line-height:1.6}
.lf-grid{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.lf-card{padding:28px;border:1px solid #27272a;border-radius:18px;background:linear-gradient(180deg,#18181b,#0f0f12)}
.lf-ic{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:#9e7aff1f;color:#c4b5fd;margin-bottom:20px}
.lf-card h3{margin:0 0 8px;font-size:19px}
.lf-card p{margin:0;color:#a1a1aa;font-size:15px;line-height:1.6}
</style><section class="lf"><div class="lf-head"><div><small>FEATURES</small><h2>Everything your team needs, out of the box</h2></div><p>We took care of the busywork so you can focus on what matters: your product and your users.</p></div><div class="lf-grid"><div class="lf-card"><div class="lf-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg></div><h3>Live analytics</h3><p>Metrics update in real time, and reports build themselves.</p></div><div class="lf-card"><div class="lf-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M17 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-6"/></svg></div><h3>Teamwork</h3><p>Comments, mentions and shared boards without switching between apps.</p></div><div class="lf-card"><div class="lf-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div><h3>Security</h3><p>Encryption, SSO and audit logs for teams of any size.</p></div></div></section>`;

const ctaFooter = `<style>
.lc{height:440px;box-sizing:border-box;padding:40px 32px 0;font-family:system-ui,sans-serif;color:#fafafa}
.lc-box{position:relative;overflow:hidden;max-width:1200px;margin:0 auto;padding:56px;border-radius:24px;background:linear-gradient(120deg,#5b3fd1,#b0508f);display:flex;justify-content:space-between;align-items:center}
.lc-box:after{content:"";position:absolute;right:-80px;top:-120px;width:360px;height:360px;border-radius:50%;background:#ffffff1a}
.lc-box h2{margin:0 0 8px;font-size:36px;letter-spacing:-1px}
.lc-box p{margin:0;color:#ffffffcc;font-size:16px}
.lc-btn{position:relative;z-index:1;padding:14px 24px;border-radius:12px;background:#fff;color:#18181b;font-weight:700}
.lc-foot{max-width:1200px;margin:56px auto 0;padding-top:24px;border-top:1px solid #27272a;display:flex;justify-content:space-between;color:#71717a;font-size:14px}
.lc-foot div{display:flex;gap:24px}
</style><section class="lc"><div class="lc-box"><div><h2>Ready to get started?</h2><p>14 days free. No card required.</p></div><a class="lc-btn" href="#" style="text-decoration:none">Create account</a></div><footer class="lc-foot"><span>© 2026 Nova</span><div><span>Privacy</span><span>Terms</span><span>Contact</span></div></footer></section>`;

const login = `<style>
.au{width:380px;box-sizing:border-box;padding:32px;border:1px solid #ffffff1a;border-radius:20px;background:#0c0a14cc;font-family:system-ui,sans-serif;color:#fafafa;box-shadow:0 30px 80px -20px #000}
.au-logo{width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#9e7aff,#fe8bbb);margin-bottom:20px}
.au h2{margin:0 0 6px;font-size:24px;letter-spacing:-.5px}
.au>p{margin:0 0 24px;color:#a1a1aa;font-size:14px}
.au-sso{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.au-sso span{display:flex;justify-content:center;align-items:center;gap:8px;height:40px;border:1px solid #27272a;border-radius:10px;font-size:14px;background:#18181b}
.au-or{display:flex;align-items:center;gap:12px;margin:20px 0;color:#52525b;font-size:12px}
.au-or:before,.au-or:after{content:"";flex:1;height:1px;background:#27272a}
.au label{display:block;margin-bottom:14px;font-size:13px;color:#d4d4d8}
.au input{display:block;width:100%;box-sizing:border-box;margin-top:6px;height:42px;padding:0 12px;border:1px solid #27272a;border-radius:10px;background:#09090b;color:#fafafa;font-size:14px}
.au-row{display:flex;justify-content:space-between;font-size:13px;color:#a1a1aa;margin:4px 0 20px}
.au-row b{color:#c4b5fd;font-weight:500}
.au-btn{display:block;width:100%;height:44px;border:0;border-radius:10px;background:#fafafa;color:#18181b;font-weight:700;font-size:15px}
.au-foot{margin:18px 0 0;text-align:center;color:#71717a;font-size:13px}
.au-foot b{color:#fafafa}
</style><div class="au"><div class="au-logo"></div><h2>Welcome back</h2><p>Sign in to continue</p><div class="au-sso"><span>Google</span><span>GitHub</span></div><div class="au-or">or</div><label>Email<input placeholder="you@example.com"></label><label>Password<input type="password" value="password"></label><div class="au-row"><span>☐ Remember me</span><b>Forgot password?</b></div><button class="au-btn">Sign in</button><p class="au-foot">No account yet? <b>Sign up</b></p></div>`;

const pricing = `<style>
.pr{height:820px;box-sizing:border-box;padding:88px 32px;font-family:system-ui,sans-serif;color:#fafafa;text-align:center}
.pr small{color:#c4b5fd;font-weight:600;letter-spacing:1.5px;font-size:12px}
.pr h2{margin:12px 0 12px;font-size:48px;letter-spacing:-2px}
.pr>p{margin:0 auto 48px;color:#a1a1aa;font-size:17px}
.pr-grid{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:20px;text-align:left;align-items:start}
.pr-card{padding:32px;border:1px solid #27272a;border-radius:20px;background:#111114}
.pr-card.hot{position:relative;border-color:#9e7aff;background:linear-gradient(180deg,#1d1533,#111114);box-shadow:0 30px 80px -30px #9e7aff99;transform:translateY(-12px)}
.pr-tag{position:absolute;top:-12px;left:32px;padding:4px 12px;border-radius:999px;background:linear-gradient(90deg,#9e7aff,#fe8bbb);font-size:12px;font-weight:700}
.pr-card h3{margin:0;font-size:18px;color:#d4d4d8}
.pr-price{margin:16px 0 4px;font-size:48px;font-weight:800;letter-spacing:-2px}
.pr-price span{font-size:16px;font-weight:500;color:#71717a;letter-spacing:0}
.pr-card>p{margin:0 0 24px;color:#71717a;font-size:14px}
.pr-btn{display:block;text-align:center;padding:12px;border-radius:11px;border:1px solid #3f3f46;font-weight:600;margin-bottom:24px}
.hot .pr-btn{background:#fafafa;color:#18181b;border-color:#fafafa}
.pr ul{list-style:none;margin:0;padding:0;display:grid;gap:12px;color:#d4d4d8;font-size:14px}
.pr li{display:flex;gap:10px;align-items:center}
.pr li svg{color:#86efac;flex-shrink:0}
</style><section class="pr"><small>PRICING</small><h2>Simple, honest pricing</h2><p>Start for free and upgrade to a paid plan when you are ready.</p><div class="pr-grid"><div class="pr-card"><h3>Starter</h3><div class="pr-price">$0<span> /mo</span></div><p>For personal projects</p><a class="pr-btn" href="#" style="text-decoration:none">Get started</a><ul><li>${CHECK}3 projects</li><li>${CHECK}Basic analytics</li><li>${CHECK}Community support</li></ul></div><div class="pr-card hot"><span class="pr-tag">Popular</span><h3>Team</h3><div class="pr-price">$12<span> /mo</span></div><p>For growing teams</p><a class="pr-btn" href="#" style="text-decoration:none">Try free for 14 days</a><ul><li>${CHECK}Unlimited projects</li><li>${CHECK}Advanced analytics</li><li>${CHECK}Priority support</li><li>${CHECK}Integrations</li></ul></div><div class="pr-card"><h3>Business</h3><div class="pr-price">$29<span> /mo</span></div><p>For companies</p><a class="pr-btn" href="#" style="text-decoration:none">Contact sales</a><ul><li>${CHECK}Everything in Team</li><li>${CHECK}SSO and audit logs</li><li>${CHECK}Dedicated account manager</li></ul></div></div></section>`;

const card = (cls, body, extra = '') => `<style>.${cls}{box-sizing:border-box;padding:22px;border:1px solid #27272a;border-radius:18px;background:#111114;font-family:system-ui,sans-serif;color:#fafafa}.${cls} small{color:#71717a;font-size:13px}${extra}</style><div class="${cls}">${body}</div>`;
const stat = (cls, label, value, delta, up = true) => card(cls, `<small>${label}</small><div class="${cls}-v">${value}</div><span class="${cls}-d">${up ? '▲' : '▼'} ${delta}</span>`, `.${cls}{width:250px}.${cls}-v{margin:8px 0 6px;font-size:32px;font-weight:800;letter-spacing:-1px}.${cls}-d{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;background:${up ? '#4ade801f' : '#f871711f'};color:${up ? '#86efac' : '#fca5a5'}}`);
const bars = [42, 65, 50, 80, 58, 92, 74, 88, 61, 96, 83, 100];
const chart = card('dc', `<div class="dc-h"><div><small>Annual revenue</small><div class="dc-v">$420K</div></div><span class="dc-t">2026</span></div><div class="dc-bars">${bars.map((h, i) => `<i style="height:${h}%"${i === 11 ? ' class="on"' : ''}></i>`).join('')}</div><div class="dc-m">${['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map(m => `<span>${m}</span>`).join('')}</div>`,
  `.dc{width:540px}.dc-h{display:flex;justify-content:space-between;align-items:start}.dc-v{font-size:28px;font-weight:800;margin-top:4px}.dc-t{padding:4px 10px;border:1px solid #27272a;border-radius:8px;font-size:12px;color:#a1a1aa}.dc-bars{display:flex;align-items:end;gap:10px;height:180px;margin-top:24px}.dc-bars i{flex:1;border-radius:6px 6px 2px 2px;background:#27272a}.dc-bars i.on{background:linear-gradient(#fe8bbb,#9e7aff)}.dc-m{display:flex;gap:10px;margin-top:8px}.dc-m span{flex:1;text-align:center;color:#52525b;font-size:11px}`);
const people = [['AK', 'Anna K.', 'upgraded to the Team plan', '#c4b5fd'], ['MS', 'Mark S.', 'invited 3 teammates', '#86efac'], ['TW', 'Tom W.', 'created the “Nova” project', '#fda4af'], ['EL', 'Emily L.', 'left a ★★★★★ review', '#93c5fd']];
const activity = card('da', `<small>Recent activity</small><ul>${people.map(([i, n, t, c]) => `<li><b style="background:${c}">${i}</b><div><strong>${n}</strong><span>${t}</span></div></li>`).join('')}</ul>`,
  `.da{width:320px}.da ul{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:14px}.da li{display:flex;gap:12px;align-items:center}.da li b{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;color:#18181b;font-size:12px}.da strong{display:block;font-size:14px}.da span{color:#71717a;font-size:13px}`);

export const templates = [
  {
    id: 'landing', name: 'Startup landing', desc: 'Header, hero, features, call to action and footer',
    page: { w: 1440, h: 900, bg: '#09090b' },
    items: [
      { name: 'Hero', code: hero, full: true, x: 0, y: 0 },
      { name: 'Features', code: features, full: true, x: 0, y: 760 },
      { name: 'CTA and footer', code: ctaFooter, full: true, x: 0, y: 1320 },
    ],
  },
  {
    id: 'pricing', name: 'Pricing page', desc: 'Three plans with the popular one highlighted',
    page: { w: 1440, h: 900, bg: 'linear-gradient(160deg,#1e1338 0%,#0b0a12 55%)' },
    items: [{ name: 'Pricing', code: pricing, full: true, x: 0, y: 0 }],
  },
  {
    id: 'dashboard', name: 'Dashboard', desc: 'Metrics, a chart and an activity feed in a free-form layout',
    page: { w: 1440, h: 900, bg: '#09090b' },
    items: [
      { name: 'Revenue', code: stat('ds1', 'Monthly revenue', '$41,230', '12.4%'), x: 160, y: 96 },
      { name: 'Users', code: stat('ds2', 'Active users', '8,214', '5.1%'), x: 452, y: 96 },
      { name: 'Conversion', code: stat('ds3', 'Conversion rate', '3.8%', '0.4%', false), x: 744, y: 96 },
      { name: 'NPS', code: stat('ds4', 'NPS score', '72', '6 pts'), x: 1036, y: 96 },
      { name: 'Chart', code: chart, x: 160, y: 288 },
      { name: 'Activity', code: activity, x: 744, y: 288 },
    ],
  },
  {
    id: 'login', name: 'Login screen', desc: 'Sign-in card with SSO on a gradient background',
    page: { w: 1280, h: 800, bg: 'radial-gradient(120% 80% at 50% 0%,#3a1530 0%,#0c090c 60%)' },
    items: [{ name: 'Login form', code: login, x: 434, y: 120 }],
  },
];
