/**
 * The movement on the public landing page: the opening sequence, the silk
 * background (a hand-written WebGL shader, no library), the product views, the
 * walkthrough, the plan builder, the
 * six moments, the calculators and the Get started dialog. Plain browser code
 * working on the page's own HTML. Every string put on the page comes from the
 * constants in this file, never from the visitor.
 */
const RETEN = `<div class="strip mono"><span class="live"><i></i> RETENTION INSIGHTS</span><span>62 AGENTS READ</span></div><div class="rt3"><div><small>High risk</small><b>2</b></div><div><small>Watch</small><b>5</b></div><div><small>Healthy</small><b>55</b></div></div><div class="rrow a" style="--d:900"><span>Agent 3<small>Fewer deals than their usual pace</small></span><svg class="spark" viewBox="0 0 60 20" aria-hidden="true"><path d="M1 4 L12 5 L22 4 L32 9 L42 13 L59 17"/></svg><b class="hi">High</b></div><div class="rrow a" style="--d:1100"><span>Agent 7<small>Quieter than last quarter</small></span><svg class="spark" viewBox="0 0 60 20" aria-hidden="true"><path d="M1 7 L12 6 L22 8 L32 8 L42 11 L59 12"/></svg><b class="wa">Watch</b></div><div class="rrow a" style="--d:1300"><span>Agent 2<small>Steady</small></span><svg class="spark" viewBox="0 0 60 20" aria-hidden="true"><path d="M1 14 L12 12 L22 12 L32 9 L42 8 L59 5"/></svg><b>Healthy</b></div><div class="opener a" style="--d:1900"><small>Suggested opener</small><q>Agent 3, I wanted to check in. How are things going, and what would make this quarter easier?</q></div>`;

const TOUR = `<div class="tourTop"><span class="mark">Kinu</span><span class="mono" id="wCount">01 / 06</span><button class="btn" id="wClose">Skip <span aria-hidden="true">✕</span></button></div>
  <div class="stage"><div class="world" id="world">
      <section class="sc" aria-label="The welcome"><div class="cap"><p class="mono a">01 · THE WELCOME</p><h2 class="a" style="--d:120">One link. Your new agent takes it from there.</h2><p class="lede a" style="--d:260">They add their licence, tax details and bank details from their own phone.</p></div><div class="prop"><div class="float"><div class="ph"><div class="phs"><span class="label">Your brokerage</span><h3 style="margin:2px 0 8px">Welcome, Agent 1</h3><div class="ck a" style="--d:500">Licence<em></em></div><div class="ck a" style="--d:800">W‑9 tax details<em></em></div><div class="ck a" style="--d:1100">Rider signed<em></em></div><div class="ck a" style="--d:1400">Direct deposit<em></em></div><div class="pbar"><i></i></div><small style="color:var(--faint)">Ready to sell</small></div></div></div></div></section>
      <section class="sc" aria-label="Paperwork"><div class="cap"><p class="mono a">02 · PAPERWORK</p><h2 class="a" style="--d:120">Your forms, signed on screen.</h2><p class="lede a" style="--d:260">Your own riders and policies, e‑signed with a record of who signed, when, and from where.</p></div><div class="prop"><div class="float" style="--fy:14deg"><div class="sheet"><span class="label">Independent contractor rider</span><i></i><i></i><i style="width:70%"></i><i></i><i style="width:55%"></i><div class="sgn"><svg viewBox="0 0 200 50" aria-hidden="true"><path pathLength="1" d="M6 36 C 20 4, 30 4, 34 30 S 50 44, 58 22 S 76 10, 80 30 S 100 40, 112 20 S 140 34, 194 26"/></svg></div><small style="color:var(--faint)">Agent 1 · signed on screen</small><span class="seal a" style="--d:2400">Signed · sealed</span><span class="ttag a" style="--d:2700;left:-58px;top:54px">Time stamped</span><span class="ttag a" style="--d:2950;right:-64px;top:128px">Fingerprint 9f2c…e1</span><span class="ttag a" style="--d:3200;left:-40px;bottom:36px">Copy filed</span></div></div></div></section>
      <section class="sc" aria-label="The file"><div class="cap"><p class="mono a">03 · THE FILE</p><h2 class="a" style="--d:120">Every agent gets a file that fills itself.</h2><p class="lede a" style="--d:260">Signed documents land in the right place as they come in. Search a name, open the ID card.</p></div><div class="prop"><div class="float"><div class="filestack"><span class="ftab a" style="--d:1500;left:4%">Licence</span><span class="ftab a" style="--d:1660;left:28%">W‑9</span><span class="ftab a" style="--d:1820;left:52%">Rider</span><span class="ftab a" style="--d:1980;left:76%">Bank</span><div class="idc"><div class="top"><span class="av">A1</span><div><span class="label" style="color:#a9abb0">Agent ID card</span><h3>Agent 1</h3><span style="color:#a9abb0">Main office · Active</span></div></div><dl><div><dt>Licence</dt><dd><span class="ok">Verified</span></dd></div><div><dt>W‑9</dt><dd><span class="ok">Received</span></dd></div><div><dt>Rider</dt><dd><span class="ok">Signed</span></dd></div><div><dt>Deposit</dt><dd><span class="ok">On file</span></dd></div></dl></div></div></div></div></section>
      <section class="sc" aria-label="Deals"><div class="cap"><p class="mono a">04 · DEALS</p><h2 class="a" style="--d:120">A deal closes. The split is already worked out.</h2><p class="lede a" style="--d:260">Tiers, caps and team splits follow the rider each agent signed.</p></div><div class="prop"><div class="float" style="--fy:14deg"><div class="deal"><span class="label">Deal · 12 Example St</span><div class="drow"><span>Commission in</span><b data-n="43740" data-w="700">$0.00</b></div><div class="split"><i></i></div><div class="drow sm"><span>Agent 1 · 85%</span><span>Brokerage · 15%</span></div><div class="drow lg a" style="--d:1700"><span>Agent 1 is owed</span><b data-n="37179" data-w="2300">$0.00</b></div><div class="drow a" style="--d:1950"><span>Brokerage keeps</span><b data-n="6561" data-w="2500">$0.00</b></div></div></div></div></section>
      <section class="sc" aria-label="Payroll"><div class="cap"><p class="mono a">05 · PAYROLL</p><h2 class="a" style="--d:120">Review. Approve. Paid.</h2><p class="lede a" style="--d:260">You check the numbers. Kinu prepares the run and keeps the proof.</p></div><div class="prop"><div class="float"><div class="deal"><span class="label">Payroll · Friday run</span><div class="prow a" style="--d:300"><span>Agent 1</span><b>$37,179.00</b><em></em></div><div class="prow a" style="--d:450"><span>Agent 2</span><b>$12,410.00</b><em></em></div><div class="prow a" style="--d:600"><span>Agent 3</span><b>$8,925.50</b><em></em></div><div class="prow a" style="--d:750"><span>Agent 4</span><b>$21,300.00</b><em></em></div><span class="btn dark press">Approve payroll</span></div></div></div></section>
      <section class="sc" aria-label="The view"><div class="cap"><p class="mono a">06 · THE VIEW</p><h2 class="a" style="--d:120">And you see all of it, live.</h2><p class="lede a" style="--d:260">Who is ready, what is owed, and what needs a person.</p></div><div class="prop"><div class="float" style="--fy:14deg"><div class="deal" id="wDash"></div></div></div></section>
      <section class="sc" aria-label="Retention Insights"><div class="cap"><p class="mono a">07 · RETENTION INSIGHTS</p><h2 class="a" style="--d:120">Then Kinu helps you keep them.</h2><p class="lede a" style="--d:260">An early signal when an agent goes quiet, and a way to open the conversation.</p></div><div class="prop"><div class="float"><div class="deal" data-reten></div></div></div></section>
  </div></div>
  <div class="remember" id="remember"><span>Remember.</span></div>
  <div class="tourBar"><button class="btn" id="wPrev" aria-label="Previous scene">←</button><button class="btn" id="wPause">Pause</button><div class="segs" id="segs" aria-hidden="true"></div><button class="btn" id="wNext" aria-label="Next scene">→</button></div>`;

export function startSite() {
  const ac = new AbortController();
  const listen = (type, fn, options) => addEventListener(type, fn, { ...(options || {}), signal: ac.signal });

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id), clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), ease = (t) => 1 - Math.pow(1 - t, 3);
  const usd = (n, d = 2) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  // ---- the silver surface behind the whole page (hand-written shader, no library) ----
  const cv = $("silk"); let mx = .5, my = .5, sx = .5, sy = .5, surge = 0, clock = 20, lastMs = 0, glow = 1;
  const gl = cv.getContext("webgl", { antialias: false, alpha: false });
  if (gl) {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}"));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision highp float;uniform vec2 r;uniform float t;uniform vec2 m;uniform float g;
      float h(vec2 p){p+=.4*vec2(sin(p.y*1.3+t*.2),cos(p.x*1.1-t*.16));float a=sin(p.x*1.7+t*.26+sin(p.y*2.1-t*.18)*1.25)*.5;a+=sin(p.y*2.3-t*.22+sin(p.x*1.9+t*.12)*1.4)*.36;return a;}
      void main(){vec2 uv=(gl_FragCoord.xy-.5*r)/r.y;uv+=(m-.5)*vec2(.12,.08);vec2 p=uv*2.4;p=vec2(p.x*.85+p.y*.5,p.y*1.5-p.x*.35);float e=.014;
        vec3 n=normalize(vec3(h(p-vec2(e,0.))-h(p+vec2(e,0.)),h(p-vec2(0.,e))-h(p+vec2(0.,e)),e*4.2));
        vec3 l=normalize(vec3(.3+m.x*.4,.8,.55));float d=max(dot(n,l),0.),s=pow(max(reflect(-l,n).z,0.),30.);
        vec3 c=(mix(vec3(.5,.505,.52),vec3(.84,.845,.855),d)+s*.4*g)*(.9+.1*h(p));
        float y=-uv.y-.08;if(y>0.){float z=.42/y;vec2 q=vec2(uv.x*z,z+t*.35);vec2 f=abs(fract(q)-.5);float line=smoothstep(.47,.5,max(f.x,f.y));c+=vec3(1.)*line*.16*smoothstep(0.,.35,y)*exp(-z*.09);}
        c*=mix(.82,1.,smoothstep(1.5,.1,length(uv)));gl_FragColor=vec4(c,1.);}`));
    gl.linkProgram(prog); gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, "a"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const U = (n) => gl.getUniformLocation(prog, n), uR = U("r"), uT = U("t"), uM = U("m"), uG = U("g");
    const size = () => { const d = Math.min(devicePixelRatio || 1, 1.25) * .7; cv.width = innerWidth * d; cv.height = innerHeight * d; gl.viewport(0, 0, cv.width, cv.height); };
    const frame = (ms) => { const dt = Math.min(.05, (ms - lastMs) / 1000 || 0); lastMs = ms; clock += dt * (1 + surge * 4); sx += (mx - sx) * .05; sy += (my - sy) * .05;
      gl.uniform2f(uR, cv.width, cv.height); gl.uniform1f(uT, clock); gl.uniform2f(uM, sx, 1 - sy); gl.uniform1f(uG, glow); gl.drawArrays(gl.TRIANGLES, 0, 3); if (!reduce && !document.hidden && !ac.signal.aborted) requestAnimationFrame(frame); };
    size(); frame(0); listen("resize", () => { size(); if (reduce) frame(0); }); document.addEventListener("visibilitychange", () => { if (!document.hidden && !reduce) requestAnimationFrame(frame); }, { signal: ac.signal });
  } else { cv.style.background = "radial-gradient(80% 60% at 60% 40%, #dcdddf, #a9aaad)";
  }
  listen("pointermove", (e) => { mx = e.clientX / innerWidth; my = e.clientY / innerHeight; }, { passive: true });

  // ---- the opening: Kinu first, then the thread, then hired and paid ----
  const run = $("run"), chips = [...run.querySelectorAll(".chip")], th = $("hThread"); let T = 1, len = 0, hideHalf = 100, chipA = 1;
  const logo = $("logo"), tg = $("tg"); tg.innerHTML = tg.textContent.split(" ").map((w) => `<span>${w}</span>`).join(" "); const tgw = [...tg.children];
  const placeChips = (ms) => { const w = run.clientWidth, cx = w / 2; chips.forEach((el, i) => { const u = reduce ? [.04, .12, .2, .86, .95][i] : (ms / 16000 + i / 5) % 1, p = th.getPointAtLength(len * u), q = th.getPointAtLength(len * Math.min(1, u + .01));
      const near = clamp((Math.abs(p.x - cx) - hideHalf) / (w * .05)), edge = clamp(u / .05) * clamp((1 - u) / .05);
      el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%) rotate(${Math.atan2(q.y - p.y, q.x - p.x) * 34}deg) scale(${.7 + .3 * near})`; el.style.opacity = near * edge * chipA; el.classList.toggle("done", p.x > cx); }); };
  const layout = () => { const w = run.clientWidth, h = run.clientHeight; th.setAttribute("d", `M0 ${h * .5} C${w * .18} ${h * .2}, ${w * .3} ${h * 1.05}, ${w * .5} ${h * .55} S${w * .82} ${h * .1}, ${w} ${h * .86}`);
    len = th.getTotalLength(); hideHalf = parseFloat(getComputedStyle(logo.querySelector(".k")).fontSize) * 2.05 * (w < 600 ? .62 : 1); setT(T); placeChips(performance.now()); };
  const setT = (t) => { T = t; const flash = Math.exp(-Math.pow((t - .13) / .06, 2)); surge = t < 1 ? Math.sin(Math.PI * clamp(t / .55)) : 0; glow = 1 + 2.8 * flash;
    const L = ease(clamp((t - .02) / .22)), settle = ease(clamp((t - .44) / .16));
    logo.style.opacity = clamp((t - .02) / .07); logo.style.setProperty("--ls", (1.7 - 1.2 * L) + "em");
    logo.style.transform = `translate(-50%,-50%) scale(${(2.4 - 1.4 * L) * (1.2 - .2 * settle)})`; logo.style.filter = L < 1 ? `blur(${(1 - L) * 18}px)` : "none";
    tgw.forEach((w, j) => { const o = ease(clamp((t - .26 - j * .03) / .07)); w.style.opacity = o; w.style.transform = `translateY(${(1 - o) * 14}px)`; });
    th.style.strokeDashoffset = 1 - ease(clamp((t - .4) / .24));
    const a = ease(clamp((t - .52) / .12)); $("hA").style.transform = `translateY(${(1 - a) * 60}px)`; $("hA").style.opacity = a;
    chipA = clamp((t - .6) / .1);
    const b = ease(clamp((t - .72) / .14)); $("hB").style.transform = `translateY(${(1 - b) * 60}px)`; $("hB").style.opacity = b; $("hAmt").textContent = usd(37179 * b);
    $("hFoot").style.opacity = clamp((t - .88) / .1); $("hFoot").style.pointerEvents = t > .9 ? "auto" : "none"; };
  let playing = 0; const play = () => { if (reduce) return setT(1); const id = ++playing, t0 = performance.now() + 250, step = (now) => { if (id !== playing || ac.signal.aborted) return; const t = clamp((now - t0) / 7200); setT(t); if (t < 1) requestAnimationFrame(step); }; setT(0); requestAnimationFrame(step); };
  const chipLoop = (ms) => { placeChips(ms); if (!document.hidden && !ac.signal.aborted) requestAnimationFrame(chipLoop); };
  listen("resize", layout); layout(); play(); $("again").addEventListener("click", play);
  if (!reduce) { requestAnimationFrame(chipLoop); document.addEventListener("visibilitychange", () => { if (!document.hidden) requestAnimationFrame(chipLoop); }, { signal: ac.signal }); }
  if (document.fonts) document.fonts.ready.then(layout);

  // ---- the product, three views ----
  const gauge = (n, of, label, note) => `<div class="pane rgc"><div class="rg"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="tk" cx="18" cy="18" r="15.9155"/><circle class="tr" cx="18" cy="18" r="13.2"/><circle class="va" cx="18" cy="18" r="13.2" pathLength="100" style="--off:${100 - Math.round(n / of * 100)}"/></svg><b>${n}</b></div><div><span>${label}</span><small>${note}</small></div></div>`;
  const lower = `<div class="trio"><div class="pane"><h4>Tier clearance</h4><div class="bigpct"><span>80% →</span> 85%</div><small style="color:var(--faint)">Agent 1 crossed $40,000 GCI</small><div style="margin-top:10px"><span class="btn dark" style="height:38px;font-size:.84rem">Review and approve</span></div></div><div class="pane"><h4>Ready, every five minutes</h4><div class="bars">${[30, 55, 82, 70, 100, 58, 44, 28, 26, 14, 12, 12].map((h, i) => `<i class="${i === 4 ? "on" : ""}" style="height:${h}%;animation-delay:${i * 40}ms"></i>`).join("")}</div></div><div class="pane"><h4>Needs a human</h4><div class="flag"><span>Agent 3<small>Licence number does not match</small></span><b>Licence</b></div><div class="flag"><span>Agent 4<small>Name differs on the W‑9</small></span><b>W‑9</b></div><div class="flag"><span>Agent 5<small>Licence expires in 21 days</small></span><b>Expiring</b></div></div></div>`;
  const stat = (l, n, of) => `<div><small style="color:var(--faint)">${l}</small><div class="bigpct">${n}${of ? `<span>/${of}</span>` : ""}</div></div>`;
  const VIEWS = {
    adv: () => `<div class="strip mono"><span class="live"><i></i> ADVANCED VIEW · LIVE</span><span>NOVEMBER INTAKE · 50 AGENTS · 6 WAITING ON A PERSON</span></div>
      <div class="pane"><div class="finder"><span>⌕</span><b id="typed"></b><span class="caret"></span></div><div class="reelRow"><div class="reel" id="reel"><div style="--n:0"><span>&nbsp;</span></div></div><span class="btn dark" id="openId" style="height:42px" hidden>Open ID card</span></div></div>
      <div class="rgs">${gauge(50, 50, "Welcome links", "all sent")}${gauge(44, 50, "Licences verified", "88%")}${gauge(41, 50, "W‑9s received", "82%")}${gauge(40, 50, "Riders signed", "80%")}</div>${lower}`,
    std: () => `<div class="strip mono"><span>STANDARD VIEW</span><span>THE SAME INFORMATION, PLAINER</span></div><div class="pane quad">${stat("Links sent", 50)}${stat("Licences", 44, 50)}${stat("W‑9s", 41, 50)}${stat("Riders", 40, 50)}</div>${lower}`,
    ret: () => `<div class="strip mono"><span>RETENTION INSIGHTS</span><span>WHO TO CHECK IN WITH</span></div><div class="pane" style="display:grid;gap:10px">${RETEN}</div>`,
    id: () => `<div class="strip mono"><span>AGENT ID CARD</span><span>OPENED FROM THE FINDER</span></div><div class="idc"><div class="top"><span class="av">A1</span><div><span class="label" style="color:#a9abb0">Agent ID card</span><h3>Agent 1</h3><span style="color:#a9abb0">Main office · Active</span></div></div><dl><div><dt>Onboarding</dt><dd><span class="ok">Ready</span></dd></div><div><dt>Licence</dt><dd><span class="ok">Verified</span></dd></div><div><dt>W‑9</dt><dd><span class="ok">Received</span></dd></div><div><dt>Rider</dt><dd><span class="ok">Signed</span></dd></div><div><dt>Email</dt><dd>agent1@example.com</dd></div><div><dt>Phone</dt><dd>(212) 555‑0100</dd></div></dl></div>`,
  };
  let demo = 0; const NAMES = ["Agent 7", "Agent 12", "Agent 3", "Agent 21", "Agent 9", "Agent 14", "Agent 1"];
  const finderDemo = () => { const id = ++demo; if (reduce) { $("typed").textContent = "agent 1"; $("reel").innerHTML = `<div><span>Agent 1</span></div>`; $("openId").hidden = false; return; }
    const word = "agent 1"; let i = 0; const type = () => { if (id !== demo || !$("typed")) return; $("typed").textContent = word.slice(0, i); if (i++ < word.length) return setTimeout(type, 130);
      const r = $("reel"); r.classList.remove("spin"); r.innerHTML = `<div style="--n:${NAMES.length - 1}">${NAMES.map((n) => `<span>${n}</span>`).join("")}</div>`; void r.offsetWidth; r.classList.add("spin"); setTimeout(() => { if (id === demo && $("openId")) $("openId").hidden = false; }, 900); setTimeout(() => { if (id === demo && $("typed")) { $("typed").textContent = ""; $("openId").hidden = true; r.innerHTML = `<div style="--n:0"><span>&nbsp;</span></div>`; i = 0; type(); } }, 5200); }; type(); };
  const tabs = [...document.querySelectorAll(".tabs button")]; const show = (v) => { demo++; tabs.forEach((b) => b.setAttribute("aria-selected", b.dataset.v === v)); $("screen").innerHTML = VIEWS[v](); if (v === "adv") finderDemo(); };
  tabs.forEach((b) => b.addEventListener("click", () => show(b.dataset.v))); show("adv");

  // ---- scroll work: nav, lit words, the drum ----
  const say = $("say"); say.innerHTML = say.textContent.split(" ").map((w) => `<span>${w}</span>`).join(" "); const words = [...say.children];
  const onScroll = () => {
    const under = [...document.querySelectorAll("main > section, footer")].find((s) => { const r = s.getBoundingClientRect(); return r.top <= 60 && r.bottom > 60; });
    $("nav").classList.toggle("solid", !!under && !under.matches(".night, .hero")); $("nav").classList.toggle("dim", !!under && under.matches(".night"));
    const r = say.getBoundingClientRect(), p = clamp((innerHeight * .85 - r.top) / (r.height + innerHeight * .35)); words.forEach((w, i) => w.classList.toggle("lit", reduce || i < p * words.length * 1.15));
  };
  let tick = false; listen("scroll", () => { if (tick) return; tick = true; requestAnimationFrame(() => { onScroll(); tick = false; }); }, { passive: true }); listen("resize", onScroll); onScroll();

  // ---- six moments: phone and screen in step, playing like a story ----
  const M = [
    { say: "Invited. The agent gets a private link; your screen shows them as invited.", ph: `<h3>Welcome to your brokerage.</h3><div class="f in" style="--d:1"><span>5 quick steps</span><small>about 10 min</small></div><div class="f in" style="--d:2"><span>No account to create</span><small>private link</small></div><div class="go in" style="--d:3">Start</div>`, dk: ["Invite sent.", "The agent has a private link. Nothing to set up.", [["Agent", "Main office", "Invited", 0], ["Agent 1", "Main office", "Ready", 1], ["Agent 2", "Team 1", "Ready", 1]]] },
    { say: "Licence. The agent enters it once; your screen shows it checked.", ph: `<h3>Your licence</h3><div class="f in" style="--d:1"><span>Number</span><small>10401•••123</small></div><div class="f in" style="--d:2"><span>Expires</span><small>31 Jan 2029</small></div><div class="f in" style="--d:3"><span>Photo</span><small>Added</small></div><div class="go in" style="--d:4">Continue</div>`, dk: ["Licence checked.", "Number, expiry and photo are on file. A mismatch would be raised here for a person.", [["Licence", "NY · expires 31 Jan 2029", "Checked", 1], ["W‑9", "Not started", "Waiting", 0], ["Rider", "Sent", "Waiting", 0]]] },
    { say: "W-9. Only the last four digits are typed; your screen shows it received.", ph: `<h3>W‑9</h3><div class="f in" style="--d:1"><span>Legal name</span><small>Agent</small></div><div class="f in" style="--d:2"><span>Last four only</span><small>•••• 7730</small></div><p class="in" style="--d:3;color:var(--faint);font-size:.78rem">Never type your full number here.</p><div class="go in" style="--d:4">Continue</div>`, dk: ["W‑9 received.", "Handled by a specialist provider. Kinu never holds a full taxpayer number.", [["Licence", "NY · expires 31 Jan 2029", "Checked", 1], ["W‑9", "Name matches", "Received", 1], ["Rider", "Sent", "Waiting", 0]]] },
    { say: "Signed. The agent signs and downloads a copy; your screen shows the records and marks him ready.", ph: `<h3>Your commission rider</h3><div class="f in" style="--d:1"><span>Your split</span><small>80%</small></div><div class="sig in" style="--d:2">Agent</div><div class="f in" style="--d:3"><span>Download your copy</span><small>PDF</small></div><div class="go in" style="--d:4">Signed</div>`, dk: ["Ready to sell.", "Every signature has a record both sides keep.", [["Commission rider v1", "E‑signature", "Signed", 1], ["Contractor agreement", "E‑signature", "Signed", 1], ["Direct deposit", "Checking ••6789", "Authorised", 1], ["Agent", "5 of 5", "Ready", 1]]] },
    { say: "First deal. Finance saves the deal and the payout is checked against the rider.", ph: `<h3>Your first deal</h3><div class="f in" style="--d:1"><span>245 Example St, 4B</span></div><div class="amt in" style="--d:2">$10,260.00</div><div class="f in" style="--d:3"><span>Status</span><small>In Thursday’s payroll</small></div>`, dk: ["The split checks itself.", "Finance saves the deal. The payout is compared with the rider the agent signed.", [["Gross commission", "245 Example St, 4B", "$14,250.00", 1], ["Split per rider v1", "80%", "$10,260.00", 1], ["Rider check", "Compared on save", "Matches", 1]]] },
    { say: "Paid. The agent sees a clear statement; your payroll is released and closed.", ph: `<p class="label in">Thursday payroll</p><h3 class="in" style="--d:1">You’re paid.</h3><div class="amt in" style="--d:2">$10,260.00</div><div class="f in" style="--d:3"><span>To</span><small>Checking ••6789</small></div><div class="f in" style="--d:4"><span>Statement</span><small>View</small></div>`, dk: ["Payroll released.", "Deposit records filled in, proof attached, released by the people you chose.", [["Thursday payroll", "14 deals", "$212,480.00", 1], ["Deposit records", "14 of 14 filled in", "Filed", 1], ["Released by", "Finance manager · 4:02 pm", "Closed", 1]]] },
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

  // ---- build your plan ----
  {
    const ADD = { ret: ["Retention Insights + Exit Kit", 4], shi: ["Finance Shield", 1.5], com: ["Compliance pack", 1.5] }, MONTHLY = 15.99, YEARLY = 13.5, ADMIN = 49.5, MIN = 500; const on = new Set(); let annual = false, admins = 0;
    const price = () => { const raw = +$("seats").value, over = raw > 1500, seats = Math.min(raw, 1500), base = annual ? YEARLY : MONTHLY, addSum = [...on].reduce((s, k) => s + ADD[k][1], 0), sum = seats * (base + addSum) + admins * ADMIN, n = seats.toLocaleString("en-US"), names = [...on].map((k) => ADD[k][0]).join(", ");
      $("oSeats").textContent = over ? "Over 1,500" : n; $("oAdmins").textContent = admins; $("tM").setAttribute("aria-pressed", !annual); $("tA").setAttribute("aria-pressed", annual);
      $("tLabel").textContent = annual ? "12‑month plan · billed monthly" : "Month to month";
      $("s-plan").value = `${annual ? "12-month plan" : "Month to month"}, ${over ? "over 1,500" : n} seats${names ? ", " + names : ""}${admins ? `, ${admins} extra admin` : ""}`;
      if (over) { $("tBig").textContent = "Custom"; $("tPer").textContent = "Over 1,500 agents gets a quote built for you."; $("tLines").innerHTML = `<li><span>Agent seats</span><b>1,500+</b></li><li><span>Add‑ons chosen</span><b>${on.size || "None"}</b></li><li><span>Extra admin seats</span><b>${admins}</b></li>`; $("tCta").textContent = "Contact Kinu for a quote"; $("tFine").textContent = "We will price your seats, add‑ons and setup together."; return; }
      $("tBig").textContent = usd(Math.max(MIN, sum)); $("tPer").textContent = `a month · ${usd(base)} per agent seat${addSum ? ` + ${usd(addSum)} in add‑ons` : ""}`;
      $("tLines").innerHTML = `<li><span>${n} seats × ${usd(base)}</span><b>${usd(seats * base)}</b></li>` + [...on].map((k) => `<li><span>${ADD[k][0]} × ${usd(ADD[k][1])}</span><b>${usd(seats * ADD[k][1])}</b></li>`).join("") + `<li><span>Admin seats: 1 included${admins ? ` + ${admins} extra × ${usd(ADMIN)}` : ""}</span><b>${usd(admins * ADMIN)}</b></li>` + (sum < MIN ? `<li><span>Monthly minimum applies</span><b>${usd(MIN)}</b></li>` : "") + `<li><span>One‑time setup</span><b>Quoted by volume</b></li>`;
      $("tCta").textContent = "Get started with this plan"; const yearly = Math.max(MIN, seats * (YEARLY + addSum) + admins * ADMIN), monthly = Math.max(MIN, seats * (MONTHLY + addSum) + admins * ADMIN);
      $("tFine").textContent = annual ? (monthly > yearly ? `${usd((monthly - yearly) * 12, 0)} less per year than month to month, for the same plan.` : "") : (monthly > yearly ? `On the 12‑month plan this would be ${usd(yearly)} a month.` : ""); };
    $("seats").addEventListener("input", price); $("tM").addEventListener("click", () => { annual = false; price(); }); $("tA").addEventListener("click", () => { annual = true; price(); });
    $("aPlus").addEventListener("click", () => { admins = Math.min(20, admins + 1); price(); }); $("aMinus").addEventListener("click", () => { admins = Math.max(0, admins - 1); price(); });
    document.querySelectorAll("#adds .add").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.k; if (on.has(k)) on.delete(k); else on.add(k); b.setAttribute("aria-pressed", on.has(k)); price(); })); price();
  }

  // ---- the walkthrough: a camera flying through six scenes, then "Remember." and back to the opening ----
  {
  const root = $("top"); $("tour").innerHTML = TOUR; document.querySelectorAll("[data-reten]").forEach((el) => { el.innerHTML = RETEN; });
  const tour = $("tour"), world = $("world"), scs = [...world.children], segs = $("segs"), DUR = 5600, timers = []; let cur = 0, elapsed = 0, lastNow = 0, sceneAt = 0, paused = false, ending = false, tourOn = false, lastFocus = null;
  segs.innerHTML = scs.map(() => "<i></i>").join(""); const pos = (i) => [i % 2 ? 260 : -260, i % 2 ? -16 : 16];
  scs.forEach((el, i) => { const [x, ry] = pos(i); el.style.setProperty("--i", i); el.style.setProperty("--x", x + "px"); el.style.setProperty("--ry", ry + "deg"); });
  $("wDash").innerHTML = `<div class="strip mono"><span class="live"><i></i> LIVE</span><span>50 AGENTS</span></div><div class="mini">${gauge(44, 50, "Licences", "88%")}${gauge(41, 50, "W‑9s", "82%")}${gauge(40, 50, "Riders", "80%")}${gauge(6, 50, "Need you", "open")}</div><div class="bars" style="height:64px">${[30, 55, 82, 70, 100, 58, 44, 28, 26, 14].map((h, i) => `<i class="${i === 4 ? "on" : ""}" style="height:${h}%;animation-delay:${1200 + i * 60}ms"></i>`).join("")}</div>`;
  const count = (root) => root.querySelectorAll("[data-n]").forEach((el) => { const n = +el.dataset.n, t0 = performance.now() + (+el.dataset.w || 1000); if (reduce) return void (el.textContent = usd(n)); el.textContent = usd(0);
    const step = (now) => { if (!root.classList.contains("on")) return; const k = ease(clamp((now - t0) / 1300)); el.textContent = usd(n * k); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); });
  const go = (i) => { cur = i; const [x, ry] = pos(i); world.style.transform = `rotateY(${-ry}deg) translate3d(${-x}px,0,${i * 1900}px)`;
    scs.forEach((el, j) => { el.classList.toggle("on", j === i); el.setAttribute("aria-hidden", j !== i); }); $("wCount").textContent = `0${i + 1} / 0${scs.length}`;
    [...segs.children].forEach((b, j) => b.style.setProperty("--p", j < i ? 1 : 0)); elapsed = 0; sceneAt = performance.now(); count(scs[i]); };
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const closeTour = () => { if (!tourOn) return; tourOn = false; timers.splice(0).forEach(clearTimeout); root.classList.remove("touring"); document.documentElement.style.overflow = ""; scrollTo(0, 0); setT(0); play();
    tour.classList.add("out"); setTimeout(() => { tour.hidden = true; tour.className = "tour"; scs.forEach((el) => el.classList.remove("on")); }, 950); if (lastFocus) lastFocus.focus({ preventScroll: true }); };
  const finish = () => { if (ending) return; ending = true; tour.classList.add("ending"); const at = reduce ? [0, 200, 2200, 2700] : [900, 2100, 5000, 6300];
    later(at[0], () => tour.classList.add("dark")); later(at[1], () => tour.classList.add("rem")); later(at[2], () => tour.classList.remove("rem")); later(at[3], closeTour); };
  const tick = (now) => { if (!tourOn || ac.signal.aborted) return; if (!paused && !ending && !reduce) elapsed += now - lastNow; lastNow = now;
    if (!ending) { surge = Math.exp(-(now - sceneAt) / 700); segs.children[cur].style.setProperty("--p", clamp(elapsed / DUR)); if (elapsed >= DUR) { if (cur < scs.length - 1) go(cur + 1); else finish(); } } requestAnimationFrame(tick); };
  const openTour = () => { lastFocus = document.activeElement; playing++; tour.hidden = false; tour.className = "tour"; root.classList.add("touring"); document.documentElement.style.overflow = "hidden"; tourOn = true; ending = false; paused = false; $("wPause").textContent = "Pause"; glow = 1;
    void tour.offsetWidth; go(0); lastNow = performance.now(); requestAnimationFrame(tick); $("wClose").focus(); };
  $("tourBtn").addEventListener("click", openTour); $("wClose").addEventListener("click", closeTour);
  const next = () => { if (ending) return; if (cur < scs.length - 1) go(cur + 1); else finish(); }, prev = () => { if (!ending) go(Math.max(0, cur - 1)); };
  $("wNext").addEventListener("click", next); $("wPrev").addEventListener("click", prev); $("wPause").addEventListener("click", () => { paused = !paused; $("wPause").textContent = paused ? "Play" : "Pause"; });
  if (reduce) $("wPause").hidden = true;
  tour.addEventListener("keydown", (e) => { if (e.key === "Escape") closeTour(); else if (e.key === "ArrowRight") next(); else if (e.key === "ArrowLeft") prev();
    else if (e.key === "Tab") { const f = [...tour.querySelectorAll("button:not([hidden])")], i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); } });
  }

  // ---- get started ----
  const dlg = $("start");
  document.querySelectorAll("[data-start]").forEach((b) => b.addEventListener("click", () => { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }));
  $("startX").addEventListener("click", () => dlg.close());
  return () => ac.abort();
}
