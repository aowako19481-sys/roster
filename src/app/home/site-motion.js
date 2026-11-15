/**
 * The movement on the public landing page: the opening sequence, the silk
 * background (a hand-written WebGL shader, no library), the tier preview, the
 * six moments, the calculators and the Get started dialog. Plain browser code
 * working on the page's own HTML. Every string put on the page comes from the
 * constants in this file, never from the visitor.
 */
export function startSite() {
  const ac = new AbortController();
  const listen = (type, fn, options) => addEventListener(type, fn, { ...(options || {}), signal: ac.signal });

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id), clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), ease = (t) => 1 - Math.pow(1 - t, 3);
  const usd = (n, d = 2) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  // ---- liquid silver silk, drawn on the graphics card by a hand-written shader (no library) ----
  const cv = $("silk"); let mx = .5, my = .5, sx = .5, sy = .5, surge = 0, clock = 20, lastMs = 0, glow = 1;
  const gl = cv.getContext("webgl", { antialias: false, alpha: false });
  if (gl) {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}"));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision highp float;uniform vec2 r;uniform float t;uniform vec2 m;uniform float g;
      float h(vec2 p){p+=.4*vec2(sin(p.y*1.3+t*.22),cos(p.x*1.1-t*.18));float a=sin(p.x*1.7+t*.3+sin(p.y*2.1-t*.2)*1.25)*.5;a+=sin(p.y*2.3-t*.26+sin(p.x*1.9+t*.14)*1.4)*.36;a+=sin((p.x+p.y)*3.9+t*.45)*.1;return a;}
      void main(){vec2 uv=(gl_FragCoord.xy-.5*r)/r.y;uv+=(m-.5)*vec2(.22,.14);vec2 p=uv*3.3;p=vec2(p.x*.85+p.y*.5,p.y*1.5-p.x*.35);
        float e=.012;vec3 n=normalize(vec3(h(p-vec2(e,0.))-h(p+vec2(e,0.)),h(p-vec2(0.,e))-h(p+vec2(0.,e)),e*3.6));
        vec3 l1=normalize(vec3(.35+m.x*.5,.75,.55)),l2=normalize(vec3(-.8,-.25,.5));
        float d=max(dot(n,l1),0.),s=pow(max(reflect(-l1,n).z,0.),34.),s2=pow(max(reflect(-l2,n).z,0.),10.);
        vec3 c=mix(vec3(.03,.032,.038),vec3(.62,.63,.66),d*d)+s*1.1+s2*vec3(.42,.45,.52)*.35;
        c*=.72+.28*h(p);c*=mix(.3,1.,smoothstep(1.6,.1,length(uv)))*(.5+.5*g);gl_FragColor=vec4(c,1.);}`));
    gl.linkProgram(prog); gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, "a"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const U = (n) => gl.getUniformLocation(prog, n), uR = U("r"), uT = U("t"), uM = U("m"), uG = U("g");
    const size = () => { const d = Math.min(devicePixelRatio || 1, 1.5), r = cv.getBoundingClientRect(); cv.width = r.width * d; cv.height = r.height * d; gl.viewport(0, 0, cv.width, cv.height); };
    let seen = true, raf = 0; const frame = (ms) => { const dt = Math.min(.05, (ms - lastMs) / 1000 || 0); lastMs = ms; clock += dt * (1 + surge * 5); sx += (mx - sx) * .05; sy += (my - sy) * .05;
      gl.uniform2f(uR, cv.width, cv.height); gl.uniform1f(uT, clock); gl.uniform2f(uM, sx, 1 - sy); gl.uniform1f(uG, reduce ? 1 : glow); gl.drawArrays(gl.TRIANGLES, 0, 3); if (seen && !reduce && !ac.signal.aborted) raf = requestAnimationFrame(frame); };
    size(); frame(0); listen("resize", () => { size(); if (reduce) frame(0); });
    new IntersectionObserver(([e]) => { seen = e.isIntersecting; cancelAnimationFrame(raf); if (seen && !reduce) raf = requestAnimationFrame(frame); }).observe(cv);
  } else { cv.style.background = "radial-gradient(80% 60% at 60% 40%, #55565a, #0b0c0e)"; }
  listen("pointermove", (e) => { mx = e.clientX / innerWidth; my = e.clientY / innerHeight; }, { passive: true });

  // ---- the opening: one run of the whole job ----
  const run = $("run"), cards = [...run.querySelectorAll(".card")], th = $("hThread"); let pts = [], T = 1;
  const layout = () => { const w = run.clientWidth, h = run.clientHeight; th.setAttribute("d", `M0 ${h * .5} C${w * .18} ${h * .2}, ${w * .3} ${h * 1.05}, ${w * .5} ${h * .55} S${w * .82} ${h * .1}, ${w} ${h * .86}`);
    const len = th.getTotalLength(); pts = cards.map((_, i) => { const p = th.getPointAtLength(len * (.1 + i * .2)); return [p.x, p.y]; }); setT(T); };
  const logo = $("logo"), tg = $("tg"); tg.innerHTML = tg.textContent.split(" ").map((w) => `<span>${w}</span>`).join(" "); const tgw = [...tg.children];
  const setT = (t) => { T = t; const flash = Math.exp(-Math.pow((t - .66) / .05, 2));
    surge = t < 1 ? Math.sin(Math.PI * clamp(t)) : 0; glow = .25 + .75 * ease(clamp(t / .4)) + 1.6 * flash;
    const a = ease(clamp(t / .1)); $("hA").style.transform = `translateY(${(1 - a) * 60}px)`; $("hA").style.opacity = a;
    th.style.strokeDashoffset = 1 - ease(clamp((t - .05) / .36)); th.style.opacity = 1 - .72 * clamp((t - .5) / .14);
    const cx = run.clientWidth / 2, cy = run.clientHeight / 2;
    cards.forEach((el, i) => { const k = ease(clamp((t - .09 - i * .055) / .15)), inv = 1 - k, c = ease(clamp((t - .5 - i * .014) / .13)), [px, py] = pts[i] || [0, 0];
      const x = px + (cx - px) * c, y = py + (cy - py) * c;
      el.style.transform = `translate(${x}px,${y}px) translate(-50%,-52%) translate3d(${inv * (i - 2) * 90}px,${inv * -220}px,${inv * -1500 - c * 500}px) rotateY(${inv * 80 + c * (i - 2) * 30}deg) rotateX(${inv * 40}deg) rotateZ(${(i - 2) * 3 * k + c * (i - 2) * 16}deg) scale(${1 - .8 * c})`;
      el.style.opacity = clamp(k * 2.5) * (1 - c); el.style.setProperty("--st", k > .9 ? 1 : 0); });
    const L = ease(clamp((t - .6) / .15)); logo.style.opacity = clamp((t - .6) / .05); logo.style.setProperty("--ls", (1.7 - 1.2 * L) + "em");
    logo.style.transform = `translate(-50%,-50%) translate(${(sx - .5) * -20 * L}px,${(sy - .5) * -12 * L}px) scale(${2.2 - 1.2 * L})`; logo.style.filter = L < 1 ? `blur(${(1 - L) * 16}px)` : "none";
    tgw.forEach((w, j) => { const o = ease(clamp((t - .75 - j * .022) / .06)); w.style.opacity = o; w.style.transform = `translateY(${(1 - o) * 14}px)`; });
    const b = ease(clamp((t - .86) / .14)); $("hB").style.transform = `translateY(${(1 - b) * 60}px)`; $("hB").style.opacity = b; $("hAmt").textContent = usd(37179 * b);
    $("hFoot").style.opacity = clamp((t - .9) / .1); };
  let playing = 0; const play = () => { if (reduce) return setT(1); const id = ++playing, t0 = performance.now() + 250, step = (now) => { if (id !== playing || ac.signal.aborted) return; const t = clamp((now - t0) / 5600); setT(t); if (t < 1) requestAnimationFrame(step); }; setT(0); requestAnimationFrame(step); };
  listen("resize", layout); layout(); play(); $("again").addEventListener("click", play);
  if (!reduce) (function tilt() { if (ac.signal.aborted) return; if (T >= 1 && scrollY < innerHeight) setT(1); requestAnimationFrame(tilt); })();

  // ---- see how it's done: switch tiers on, the product fills in ----
  const P = {
    ops: { name: "Ops", price: 2.5, group: "Onboarding", nav: ["Home", "Agents", "Teams", "Riders", "Paperwork", "Files", "Reports"], head: "Onboarding that finishes itself.", sub: "Every new agent, every document, and a clear answer to “who is ready?”", gets: ["Private onboarding link per agent", "Licence and W‑9 tracking", "Riders, tiers and approvals with undo", "Your own packet: sign, acknowledge, upload", "Signature records both sides keep", "Teams, offices and custom roles"], rows: [["Maya Chen", "Brooklyn", "Ready", 1], ["Corin Vale", "W‑9 waiting", "4 of 5", 0], ["Jordan Ellis", "Team Ellis", "Ready", 1], ["Rosa Alvarez", "Licence to review", "Needs a look", 0]] },
    fin: { name: "Finance", price: 2.5, group: "Finance", nav: ["Overview", "Deals", "Payments", "Payroll", "Documents", "Calculator", "Statements"], head: "Commission payroll you can stand behind.", sub: "Every payout traced to a signed rider. Every change with a name beside it.", gets: ["Deals checked against the rider on save", "Payments split across deals, proof attached", "Deposit records that fill themselves in", "Your own PDF forms, filled in", "Payroll calendar, held folder, release, close", "Agent statements in plain language"], rows: [["410 Mercer St, PH", "$37,179.00", "Matches", 1], ["88 Wythe Ave, 6C", "$9,112.50", "Matches", 1], ["31 Garden Pl", "$18,400.00", "Matches", 1], ["245 Example St, 4B", "$10,260.00", "Held", 0]] },
    ret: { name: "Retention Insights + Exit Kit", price: 4, group: "Add‑ons", nav: ["Retention", "Exit kit"], head: "Keep the agents you worked to win.", sub: "A gentle early signal from your own data, and a clean checklist when someone does leave.", gets: ["Risk view from your own deal and payroll data", "Suggested conversation openers", "Exit checklist per departing agent", "Open deals to reassign, final payout task"], rows: [["Jordan Ellis", "Steady", "No action", 1], ["Sam Okafor", "Quieter than usual", "Check in", 0], ["Lena Park", "Leaving 30 Nov", "3 of 7 done", 0]] },
    shi: { name: "Finance Shield", price: 1, group: "Add‑ons", nav: ["Payout checks"], head: "A second pair of eyes on every payout.", sub: "Overrides need authority and a reason, and patterns worth a look are raised.", gets: ["Authority‑only overrides with reasons", "Pattern watch on splits and referral payees", "Monthly integrity report"], rows: [["Override · 31 Garden Pl", "Owner One", "Reason logged", 1], ["Referral payee seen 4×", "Coastal Referral", "Review", 0], ["November report", "0 unexplained", "Signed", 1]] },
    com: { name: "Compliance pack", price: 1, group: "Add‑ons", nav: ["Audit files"], head: "Audit day becomes a download.", sub: "One file per agent or deal, and year‑end exports for your accountant.", gets: ["One‑click audit file per agent or deal", "Year‑end 1099 export matched to W‑9s", "Kinu prepares; your accountant files"], rows: [["Maya Chen · agent file", "14 documents", "Ready", 1], ["410 Mercer St · deal file", "9 documents", "Ready", 1], ["1099 export 2026", "62 agents", "Ready", 1]] },
  };
  const order = ["ops", "fin", "ret", "shi", "com"], on = new Set(["ops"]); let focus = "ops", fresh = null;
  const draw = () => {
    const groups = {}; order.forEach((k) => { (groups[P[k].group] ||= []).push(k); });
    $("rail").innerHTML = `<span class="mark" style="padding:0">Kinu</span>` + Object.entries(groups).map(([g, ks]) => `<p class="label">${g}</p>` + ks.map((k) => P[k].nav.map((n, i) => `<span class="${on.has(k) ? (k === focus && i === (k === "fin" ? 1 : 1 % P[k].nav.length) ? "cur" : "") : "off"} ${k === fresh ? "pop" : ""}" style="animation-delay:${i * 45}ms">${n}</span>`).join("")).join("")).join("");
    const p = P[focus], live = on.has(focus);
    $("screen").innerHTML = `<p class="label">${live ? "Included in your Kinu" : "Not switched on"} · ${p.name}</p><h3>${p.head}</h3><p>${p.sub}</p><ul class="gets">${p.gets.map((g) => `<li>${g}</li>`).join("")}</ul><div class="tbl">${p.rows.map((r) => `<div><span>${r[0]}</span><span>${r[1]}</span><span class="pill ${r[3] ? "" : "w"}">${r[2]}</span></div>`).join("")}</div>`;
    const each = [...on].reduce((s, k) => s + P[k].price, 0), all = on.size === 5, per = all ? 9.5 : each, total = Math.max(on.size ? 500 : 0, per * 500);
    $("bTotal").textContent = usd(total, 0); $("bWas").textContent = all ? usd(each * 500, 0) : "";
    $("bSave").textContent = all ? "Everything together: you keep $750 every month." : on.size === 0 ? "Switch a piece on to begin." : !on.has("fin") ? "Add Finance to run payroll from the same record." : !on.has("ops") ? "Add Ops so onboarding feeds payroll." : `Add the remaining ${5 - on.size} to unlock the $4,750 bundle.`;
    $("s-plan").value = all ? "Everything ($4,750 for 500 agents)" : [...on].map((k) => P[k].name).join(", ") || "Not sure yet"; fresh = null;
  };
  document.querySelectorAll(".pick").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.k, was = on.has(k); if (was) on.delete(k); else on.add(k); b.setAttribute("aria-pressed", !was); focus = k; fresh = was ? null : k; draw(); })); draw();

  // ---- scroll work: nav, lit words, the drum ----
  const say = $("say"); say.innerHTML = say.textContent.split(" ").map((w) => `<span>${w}</span>`).join(" "); const words = [...say.children];
  const onScroll = () => {
    $("nav").classList.toggle("solid", (() => { const y = 60; return [...document.querySelectorAll("main > section, footer")].some((s) => { const r = s.getBoundingClientRect(); return r.top <= y && r.bottom > y && !s.matches(".night, .hero"); }); })());
    $("nav").classList.toggle("dim", scrollY > innerHeight * .6);
    const r = say.getBoundingClientRect(), p = clamp((innerHeight * .85 - r.top) / (r.height + innerHeight * .35)); words.forEach((w, i) => w.classList.toggle("lit", reduce || i < p * words.length * 1.15));
  };
  let tick = false; listen("scroll", () => { if (tick) return; tick = true; requestAnimationFrame(() => { onScroll(); tick = false; }); }, { passive: true }); listen("resize", onScroll); onScroll();

  // ---- six moments: phone and screen in step, playing like a story ----
  const M = [
    { say: "Invited. The agent gets a private link; your screen shows them as invited.", ph: `<h3>Welcome to Sample Brokerage, Corin.</h3><div class="f in" style="--d:1"><span>5 quick steps</span><small>about 10 min</small></div><div class="f in" style="--d:2"><span>No account to create</span><small>private link</small></div><div class="go in" style="--d:3">Start</div>`, dk: ["Invite sent.", "Corin has a private link. Nothing for him to set up.", [["Corin Vale", "Brooklyn", "Invited", 0], ["Maya Chen", "Brooklyn", "Ready", 1], ["Jordan Ellis", "Team Ellis", "Ready", 1]]] },
    { say: "Licence. The agent enters it once; your screen shows it checked.", ph: `<h3>Your licence</h3><div class="f in" style="--d:1"><span>Number</span><small>10401•••123</small></div><div class="f in" style="--d:2"><span>Expires</span><small>31 Jan 2029</small></div><div class="f in" style="--d:3"><span>Photo</span><small>Added</small></div><div class="go in" style="--d:4">Continue</div>`, dk: ["Licence checked.", "Number, expiry and photo are on file. A mismatch would be raised here for a person.", [["Licence", "NY · expires 31 Jan 2029", "Checked", 1], ["W‑9", "Not started", "Waiting", 0], ["Rider", "Sent", "Waiting", 0]]] },
    { say: "W-9. Only the last four digits are typed; your screen shows it received.", ph: `<h3>W‑9</h3><div class="f in" style="--d:1"><span>Legal name</span><small>Corin Vale</small></div><div class="f in" style="--d:2"><span>Last four only</span><small>•••• 7730</small></div><p class="in" style="--d:3;color:var(--faint);font-size:.78rem">Never type your full number here.</p><div class="go in" style="--d:4">Continue</div>`, dk: ["W‑9 received.", "Handled by a specialist provider. Kinu never holds a full taxpayer number.", [["Licence", "NY · expires 31 Jan 2029", "Checked", 1], ["W‑9", "Name matches", "Received", 1], ["Rider", "Sent", "Waiting", 0]]] },
    { say: "Signed. The agent signs and downloads a copy; your screen shows the records and marks him ready.", ph: `<h3>Your commission rider</h3><div class="f in" style="--d:1"><span>Your split</span><small>80%</small></div><div class="sig in" style="--d:2">Corin Vale</div><div class="f in" style="--d:3"><span>Download your copy</span><small>PDF</small></div><div class="go in" style="--d:4">Signed</div>`, dk: ["Ready to sell.", "Every signature has a record both sides keep.", [["Commission rider v1", "E‑signature", "Signed", 1], ["Contractor agreement", "E‑signature", "Signed", 1], ["Direct deposit", "Checking ••6789", "Authorised", 1], ["Corin Vale", "5 of 5", "Ready", 1]]] },
    { say: "First deal. Finance saves the deal and the payout is checked against the rider.", ph: `<h3>Your first deal</h3><div class="f in" style="--d:1"><span>245 Example St, 4B</span></div><div class="amt in" style="--d:2">$10,260.00</div><div class="f in" style="--d:3"><span>Status</span><small>In Thursday’s payroll</small></div>`, dk: ["The split checks itself.", "Finance saves the deal. The payout is compared with the rider Corin signed.", [["Gross commission", "245 Example St, 4B", "$14,250.00", 1], ["Split per rider v1", "80%", "$10,260.00", 1], ["Rider check", "Compared on save", "Matches", 1]]] },
    { say: "Paid. The agent sees a clear statement; your payroll is released and closed.", ph: `<p class="label in">Thursday payroll</p><h3 class="in" style="--d:1">You’re paid.</h3><div class="amt in" style="--d:2">$10,260.00</div><div class="f in" style="--d:3"><span>To</span><small>Checking ••6789</small></div><div class="f in" style="--d:4"><span>Statement</span><small>View</small></div>`, dk: ["Payroll released.", "Deposit records filled in, proof attached, released by the people you chose.", [["Thursday payroll", "14 deals", "$212,480.00", 1], ["Deposit records", "14 of 14 filled in", "Filed", 1], ["Released by", "Fin Manager · 4:02 pm", "Closed", 1]]] },
  ];
  const stepBtns = [...$("steps").children], mBox = $("moments"); let cur = -1, mStart = 0, mSeen = false, mHold = false;
  const go = (i) => { cur = i; mStart = performance.now(); const m = M[i];
    $("mPhone").innerHTML = `<span class="mark">Kinu</span>` + m.ph;
    $("mDesk").innerHTML = `<h3 class="in">${m.dk[0]}</h3><p class="in" style="--d:1">${m.dk[1]}</p><div class="tbl">${m.dk[2].map((r, j) => `<div style="animation-delay:${200 + j * 90}ms"><span>${r[0]}</span><span>${r[1]}</span><span class="pill ${r[3] ? "" : "w"}">${r[2]}</span></div>`).join("")}</div>`;
    stepBtns.forEach((b, j) => { b.setAttribute("aria-selected", j === i); b.firstElementChild.style.setProperty("--p", j < i ? 1 : 0); });
    $("mLive").textContent = m.say; const pu = $("mPulse"); pu.classList.remove("go"); void pu.getBoundingClientRect(); if (!reduce) pu.classList.add("go"); };
  stepBtns.forEach((b, i) => b.addEventListener("click", () => go(i)));
  mBox.addEventListener("pointerenter", () => { mHold = true; }); mBox.addEventListener("pointerleave", () => { mHold = false; mStart = performance.now() - (stepBtns[cur].firstElementChild.style.getPropertyValue("--p") || 0) * 4200; });
  new IntersectionObserver(([e]) => { mSeen = e.isIntersecting; if (mSeen) mStart = performance.now(); }, { threshold: .25 }).observe(mBox);
  go(0); if (!reduce) (function story(now) { if (ac.signal.aborted) return; if (mSeen && !mHold) { const p = clamp((now - mStart) / 4200); stepBtns[cur].firstElementChild.style.setProperty("--p", p); if (p >= 1) go((cur + 1) % M.length); } requestAnimationFrame(story); })(performance.now());

  // ---- the ten-minute ring ----
  const ring = $("ring"); let rung = false;
  const runRing = () => { if (rung || ring.getBoundingClientRect().top > innerHeight * .8) return; rung = true; if (reduce) return ring.style.setProperty("--off", 0);
    const t0 = performance.now(); const step = (now) => { const p = clamp((now - t0) / 2600), e = ease(p), secs = Math.round(600 * e); ring.style.setProperty("--off", 100 - 100 * e); $("ringN").textContent = Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0"); if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); };
  listen("scroll", runRing, { passive: true }); runRing();

  // ---- your number ----
  const calc = () => { const a = +$("c-agents").value, m = +$("c-mins").value, d = +$("c-deals").value; $("o-agents").textContent = a; $("o-mins").textContent = m; $("o-deals").textContent = d; const hours = Math.round((a * m + d * 6) * 12 / 60); $("c-hours").textContent = hours.toLocaleString("en-US"); $("c-weeks").textContent = (hours / 40).toFixed(1); };
  ["c-agents", "c-mins", "c-deals"].forEach((id) => $(id).addEventListener("input", calc)); calc();

  // ---- the offer ----
  const price = () => { const n = +$("p-agents").value, now = Math.max(500, n * 9.5), was = n * 11; $("pN").textContent = n.toLocaleString("en-US"); $("pNow").textContent = usd(now, 0); $("pWas").textContent = usd(was, 0); $("pSave").textContent = was > now ? `You keep ${usd(was - now, 0)} every month` : "Monthly minimum applies"; };
  $("p-agents").addEventListener("input", price); price();

  // ---- get started ----
  const dlg = $("start");
  document.querySelectorAll("[data-start]").forEach((b) => b.addEventListener("click", () => { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }));
  $("startX").addEventListener("click", () => dlg.close());
  return () => ac.abort();
}
