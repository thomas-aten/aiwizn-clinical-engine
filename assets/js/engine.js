

/* SCRIPT_TAG_PRESENT */
// Length-neutrality notice — prevents answer-length bias cue
function injectLengthNotices() {
  document.querySelectorAll('.choices').forEach(function(el) {
    if (el.previousElementSibling && el.previousElementSibling.classList.contains('length-notice')) return;
    var note = document.createElement('div');
    note.className = 'length-notice';
    note.textContent = 'Note — answer length does not indicate quality.';
    el.parentNode.insertBefore(note, el);
  });
}
injectLengthNotices(); // run on initial load


/* ═══════════════════════════════════════════════
   AIWIZN ENGINE v4 · CARDIAC · STROKE · SEPSIS
   Clean rewrite — no scoping bugs, no auto-progression
═══════════════════════════════════════════════ */

// ── DB ────────────────────────────────────────
const DB = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch(e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} },
  del: (k) => { localStorage.removeItem(k); }
};

// ── WEIGHTS ───────────────────────────────────
const W = {
  s1a:  {D5:1.0, D6:.9, D8:.6},
  s1a2: {D7:1.0, D4:.5},
  s1b_1:{D4:.6,  D6:.8},
  s1b_2:{D4:1.0, D3:.5},
  s1c:  {D2:.9,  D3:.8, D9:.6},
  s2a:  {D5:.9,  D7:.7, D8:.7},
  s2a2: {D4:.8,  D7:.7},
  s2b:  {D4:.8,  D7:.9},
  s2c:  {D9:1.0, D11:.9},
  s3a:  {D5:.9,  D8:.8, D6:.5},
  s3b:  {D4:.8,  D7:.8, D1:.6},
  s3c:  {D5:.8,  D2:.9},
  s3c2: {D12:1.0}
};
const TS = {expert:1.0, mid:0.55, gap:0.1};
const DOMS = ['D1','D2','D3','D4','D5','D6','D7','D8','D9','D11','D12'];
const DL = {
  D1:'Ambiguity Tolerance', D2:'Therapeutic Comm.', D3:'Ethical Reasoning',
  D4:'Psych Safety', D5:'Deterioration Recog.', D6:'Pharmacology',
  D7:'SBAR/Handover', D8:'Prioritisation', D9:'Cultural Humility',
  D11:'Social Complexity', D12:'Moral Resilience'
};
const DLS = {
  D1:'Ambiguity', D2:'Communication', D3:'Ethics', D4:'Psych Safety',
  D5:'Deterioration', D6:'Pharmacology', D7:'SBAR', D8:'Priority',
  D9:'Culture', D11:'Social', D12:'Moral Resil.'
};

// ── SESSION ───────────────────────────────────
let S = DB.get('aiwizn_curr') || {
  id: Date.now(), nurse:'Demo', unit:'',
  start: new Date().toISOString(),
  choices:{}, reflection:'', done:false
};
function saveCurr() { DB.set('aiwizn_curr', S); }

// ── DOMAIN COMPUTE ────────────────────────────
function computeDoms(s) {
  const tot={}, cnt={};
  DOMS.forEach(d => { tot[d]=0; cnt[d]=0; });
  for (const [k,t] of Object.entries(s.choices||{})) {
    const ws = W[k]; if (!ws) continue;
    const sc = TS[t] || 0.5;
    for (const [d,w] of Object.entries(ws)) {
      if (tot[d] !== undefined) { tot[d] += sc*w; cnt[d] += w; }
    }
  }
  const r = {};
  DOMS.forEach(d => { r[d] = cnt[d]>0 ? tot[d]/cnt[d] : null; });
  return r;
}

function computeSpec(dom) {
  const v = d => dom[d] != null ? dom[d] : 0.5;
  return {
    'Cardiac ICU':  Math.round((v('D5')*.3+v('D6')*.25+v('D4')*.2+v('D8')*.15+v('D7')*.1)*100),
    'Neuro/Stroke': Math.round((v('D5')*.25+v('D7')*.25+v('D9')*.2+v('D4')*.15+v('D8')*.15)*100),
    'Medical ICU':  Math.round((v('D5')*.3+v('D8')*.2+v('D1')*.2+v('D7')*.15+v('D4')*.15)*100),
    'Med-Surg':     Math.round((v('D8')*.2+v('D2')*.2+v('D9')*.2+v('D11')*.2+v('D6')*.2)*100),
    'ER/Trauma':    Math.round((v('D8')*.3+v('D5')*.25+v('D1')*.2+v('D7')*.15+v('D4')*.1)*100)
  };
}

function computeNWI() {
  // CRITICAL: use firstChoices only (captures first instinct, not revisions)
  const fc = (v5State && Object.keys(v5State.firstChoices||{}).length)
    ? v5State.firstChoices
    : (S.firstChoices && Object.keys(S.firstChoices).length ? S.firstChoices : S.choices);
  const ch = Object.values(fc);
  if (!ch.length) return null;
  return Math.round(ch.filter(c => c==='expert').length / ch.length * 100);
}

// ── NAVIGATION ────────────────────────────────
const CRUMBS = {
  overview:'Cardiac · Stroke · Sepsis',
  s1a:'S1-A · STEMI Response', s1b:'S1-B · Authority Challenge', s1c:'S1-C · DNR Ethics',
  s2a:'S2-A · FAST Assessment', s2b:'S2-B · tPA Crisis', s2c:'S2-C · Language Access',
  s3a:'S3-A · Sepsis Recognition', s3b:'S3-B · 1-Hr Bundle', s3c:'S3-C · Septic Shock',
  persona:'PERSONA Output', dashboard:'LUMINA Dashboard'
};
const SB_MAP = {
  s1a:0, s1b:1, s1c:2,
  s2a:3, s2b:4, s2c:5,
  s3a:6, s3b:7, s3c:8,
  persona:9, dashboard:10
};
let cur = 'overview';
let timerInt = null;

function go(name) {
  if (timerInt && name !== 's1a') { clearInterval(timerInt); timerInt = null; }
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('panel-' + name);
  if (!el) { console.warn('Panel not found:', name); return; }
  el.classList.add('active');
  cur = name;
  const crumbEl = document.getElementById('hdr-crumb');
  if (crumbEl) crumbEl.textContent = CRUMBS[name] || '';
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
  if (SB_MAP[name] !== undefined) {
    const items = document.querySelectorAll('.sb-item');
    if (items[SB_MAP[name]]) items[SB_MAP[name]].classList.add('active');
  }
  if (name === 'persona') renderPersona();
  if (name === 'dashboard') renderDash();
  window.scrollTo({top:0, behavior:'instant'});
}

function goSide(n, el) {
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
  go(n);
}

// ── CHOICE SHUFFLE (anti-position bias) ───────
function shuffleChoices() {
  document.querySelectorAll('.choices').forEach(container => {
    const items = [...container.querySelectorAll('.choice[data-type]')];
    if (items.length < 2) return;
    // Pool-based Fisher-Yates
    const pool = items.map((_, i) => i);
    const order = [];
    while (pool.length) {
      const r = Math.floor(Math.random() * pool.length);
      order.push(pool.splice(r, 1)[0]);
    }
    const frag = document.createDocumentFragment();
    order.forEach(i => frag.appendChild(items[i]));
    container.appendChild(frag);
    // Re-label A B C D
    const labels = ['A','B','C','D','E'];
    container.querySelectorAll('.choice').forEach((c, idx) => {
      const idEl = c.querySelector('.choice-id');
      if (idEl) idEl.textContent = labels[idx] || String(idx+1);
    });
  });
}

// ── CHOICE ENGINE (event delegation) ──────────
function handleChoiceClick(el) {
  const type   = el.dataset.type;
  const nodeId = el.dataset.node;
  const signal = el.dataset.signal || '';
  if (!type || !nodeId) return;

  const parent = el.closest('.choices');
  if (!parent) return;

  // Clear previous selections in this group
  parent.querySelectorAll('.choice').forEach(c => {
    c.classList.remove('sel-expert','sel-gap','sel-mid','revealed');
    const s = c.querySelector('.choice-signal');
    if (s) s.style.display = 'none';
  });

  // Mark selected
  el.classList.add('sel-' + type, 'revealed');
  const cs = el.querySelector('.choice-signal');
  if (cs) cs.style.display = 'block';

  // Save
  S.choices[nodeId] = type;
  saveCurr();

  // Mark sidebar done
  const pBase = nodeId.replace(/[_\d]+$/, '').replace(/_$/, '');
  const pKey  = SB_MAP[pBase] !== undefined ? pBase : cur;
  if (SB_MAP[pKey] !== undefined) {
    const items = document.querySelectorAll('.sb-item');
    if (items[SB_MAP[pKey]]) items[SB_MAP[pKey]].classList.add('done');
  }

  // Reveal outcome panel
  const oid = 'out-' + nodeId.replace(/_/g, '');
  const outEl = document.getElementById(oid);
  if (outEl) {
    const lb = outEl.querySelector('.out-label');
    const tx = outEl.querySelector('.out-text');
    const cls = {expert:'out-expert', mid:'out-mid', gap:'out-gap'};
    const lbl = {
      expert:'✦ Expert Pattern Detected',
      mid:'◆ Adequate — Development Area',
      gap:'⚠ Gap Signal Detected'
    };
    const sfx = {
      expert:'<br><br><em style="color:var(--teal-d)">COGNITA: Strength marker logged. PERSONA weights this positively.</em>',
      mid:   '<br><br><em style="color:#B45309">COGNITA: Adequate. RESONANCE coaching will target this area.</em>',
      gap:   '<br><br><em style="color:var(--crimson)">COGNITA: Gap flagged. Priority coaching activated.</em>'
    };
    outEl.className = 'outcome visible ' + (cls[type] || 'out-mid');
    if (lb) { lb.className = 'out-label lb-' + type; lb.textContent = lbl[type] || type; }
    if (tx) tx.innerHTML = signal + (sfx[type] || '');
    setTimeout(() => {
      if (outEl.closest('.panel.active'))
        outEl.scrollIntoView({behavior:'smooth', block:'nearest'});
    }, 150);
  }

  const msgs = {expert:['Expert pattern ✦','t-ok'], mid:['Adequate response ◆',''], gap:['Gap signal flagged ⚠','t-warn']};
  const [msg, cls2] = msgs[type] || ['Logged',''];
  toast(msg, cls2);
}

// Single delegated listener — no inline onclick needed
document.addEventListener('click', function(e) {
  const choiceEl = e.target.closest('.choice[data-type]');
  if (choiceEl) handleChoiceClick(choiceEl);
});

// ── PERSONA ───────────────────────────────────
function renderPersona() {
  var _v5safe = (typeof v5State !== 'undefined' && v5State) || window.v5State || {};
  const _fcForScoring = (Object.keys(_v5safe.firstChoices||{}).length) ? _v5safe.firstChoices
    : (Object.keys(S.firstChoices||{}).length) ? S.firstChoices
    : {};
  const dom  = computeDoms({choices: _fcForScoring});
  const spec = computeSpec(dom);
  const nwi  = computeNWI();
  const total   = Object.keys(_fcForScoring).length;
  const expCnt  = Object.values(_fcForScoring).filter(c => c==='expert').length;
  const gapCnt  = Object.values(_fcForScoring).filter(c => c==='gap').length;
  const midCnt  = Object.values(_fcForScoring).filter(c => c==='mid').length;
  const _v5     = _v5safe;

  const container = document.getElementById('persona-content');
  if (!container) return;

  if (!total) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#8896AA"><p style="font-size:14px">Complete scenario nodes to generate your PERSONA profile.</p></div>';
    return;
  }

  // Colour helpers
  const col = v => v==null ? '#B0B8C4' : v>=.75 ? '#00A87A' : v>=.55 ? '#D97706' : '#DC2626';
  const pct = v => v!=null ? Math.round(v*100) : 0;
  const stageLbl = v => v==null ? '—' : v>=.85 ? 'Expert' : v>=.7 ? 'Proficient' : v>=.55 ? 'Competent' : v>=.3 ? 'Adv. Beginner' : 'Novice';
  const nwiCol = nwi==null ? '#8896AA' : nwi>=75 ? '#00A87A' : nwi>=55 ? '#D97706' : '#DC2626';
  const nwiLbl = nwi==null ? '—' : nwi>=75 ? 'Proficient' : nwi>=55 ? 'Competent' : 'Developing';
  const bennerStage = nwi==null ? '—' : nwi>=80 ? 'Stage 4 · Proficient → Expert' : nwi>=60 ? 'Stage 3 · Competent' : 'Stage 2 · Advanced Beginner';

  // Narrative
  const _ranked = Object.entries(dom).filter(([,v])=>v!=null).sort((a,b)=>b[1]-a[1]);
  const topDomKey = _ranked[0]?.[0];
  const botDomKey = _ranked[_ranked.length-1]?.[0];
  const DL_LIGHT = {D1:'Ambiguity',D2:'Therapeutic Comm',D3:'Ethics',D4:'Psych Safety',D5:'Deterioration',D6:'Pharmacology',D7:'SBAR',D8:'Prioritisation',D9:'Cultural Humility',D11:'Social Complexity',D12:'Moral Resilience'};
  const topName = topDomKey ? DL_LIGHT[topDomKey] : null;
  const botName = botDomKey && botDomKey !== topDomKey ? DL_LIGHT[botDomKey] : null;
  const stageAdj = nwi>=80 ? 'proficient–expert stage' : nwi>=60 ? 'competent stage' : 'advanced beginner stage';
  const narrative = (topName
    ? `Presenting at ${stageAdj} with ${expCnt} expert-pattern response${expCnt!==1?'s':''} across ${total} decision nodes (NWI ${nwi}%). Strongest domain: ${topName}.`
    : `Presenting at ${stageAdj} with NWI ${nwi}%.`)
    + (gapCnt > 0 ? ` ${gapCnt} gap signal${gapCnt>1?'s':''} flagged for preceptor review.` : ' No critical gaps detected.')
    + ((_v5.selfCorrected||[]).length > 0 ? ` ${_v5.selfCorrected.length} self-correction${_v5.selfCorrected.length>1?'s':''} noted — positive metacognitive signal.` : '');

  // Specialty sorted
  const specS = Object.entries(spec).sort((a,b)=>b[1]-a[1]);
  const specCol = v => v>=75 ? '#00A87A' : v>=55 ? '#D97706' : '#6B7A8D';
  const specTag = v => v>=75 ? 'Strong Match' : v>=55 ? 'Good Match' : 'Developing';

  // ── BUILD HTML ──────────────────────────────────────────────
  let html = `<div class="persona-light-wrap">`;

  // Hero card
  html += `
  <div class="persona-hero">
    <div class="ph-nwi">
      <div class="ph-nwi-pct" style="color:${nwiCol}">${nwi!=null?nwi:'–'}%</div>
      <div class="ph-nwi-label">Nursing Wisdom Index</div>
      <div class="ph-nwi-sub" style="color:${nwiCol}">${nwiLbl}</div>
    </div>
    <div class="ph-stats">
      <div>
        <div class="ph-stage">${bennerStage}</div>
        <div class="ph-stage-sub">${S.nurse} · ${S.unit||'Clinical'} · ${new Date(S.start).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
      </div>
      <div class="ph-pills">
        <span class="ph-pill expert">✦ ${expCnt} Expert</span>
        <span class="ph-pill gap">⚠ ${gapCnt} Gap</span>
        ${midCnt > 0 ? `<span class="ph-pill mid">◆ ${midCnt} Mid</span>` : ''}
        <span class="ph-pill node">${total} Nodes</span>
        ${Object.keys(_v5.revisions||{}).length > 0 ? `<span class="ph-pill node">${Object.keys(_v5.revisions).length} Revision${Object.keys(_v5.revisions).length>1?'s':''}</span>` : ''}
      </div>
      <div class="ph-narrative">${narrative}</div>
    </div>
  </div>`;

  // Domain Profile
  html += `<div class="persona-section-title">Clinical Domain Profile</div>`;
  html += `<div class="domain-grid">`;
  for (const [k, label] of Object.entries(DL)) {
    const v = dom[k];
    const p = pct(v);
    const c = col(v);
    const sl = stageLbl(v);
    html += `
    <div class="domain-card">
      <div class="dc-header">
        <div class="dc-label">${label}</div>
        <div class="dc-score" style="color:${c}">${v!=null?p+'%':'—'}</div>
      </div>
      <div class="dc-bar-track"><div class="dc-bar-fill" style="width:${p}%;background:${c}"></div></div>
      <div class="dc-stage">${sl}</div>
    </div>`;
  }
  html += `</div>`;

  // Specialty Aptitude
  html += `<div class="persona-section-title">Specialty Aptitude Ranking</div>`;
  html += `<div class="specialty-grid">`;
  specS.slice(0,6).forEach(([name, val], i) => {
    const c = specCol(val);
    html += `
    <div class="spec-card rank-${Math.min(i+1,3)}">
      <div class="sc-name">${name}</div>
      <div class="sc-bar-track"><div class="sc-bar-fill" style="width:${val}%;background:${c}"></div></div>
      <div class="sc-meta">
        <div class="sc-pct" style="color:${c}">${val}%</div>
        <div class="sc-tag" style="color:${c}">${specTag(val)}</div>
      </div>
    </div>`;
  });
  html += `</div>`;

  // Placement Recommendation
  const primary   = specS[0]?.[0] || 'Med-Surg';
  const secondary = specS[1]?.[0] || 'ER/Trauma';
  const condition = gapCnt >= 3
    ? `Review ${gapCnt} gap signal${gapCnt>1?'s':''} with preceptor before unit placement.`
    : gapCnt > 0
    ? `${gapCnt} gap area${gapCnt>1?'s':''} identified — recommend focused preceptor review.`
    : 'Strong foundation — ready for unit placement with standard preceptor support.';

  html += `
  <div class="placement-card">
    <div class="plc-badge">
      <div class="plc-badge-label">Primary</div>
      <div class="plc-badge-val">${primary}</div>
    </div>
    <div class="plc-badge" style="background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.15)">
      <div class="plc-badge-label">Secondary</div>
      <div class="plc-badge-val" style="color:rgba(255,255,255,.8)">${secondary}</div>
    </div>
    <div class="plc-body">
      <h4>Placement Recommendation</h4>
      <p>${condition}</p>
    </div>
  </div>`;

  // COGNITA Behavioural Metrics (light version)
  const lats = Object.values(_v5.responseLatency||{});
  const avgSec = lats.length ? Math.round(lats.reduce((a,b)=>a+b,0)/lats.length/1000) : null;
  const ariaEng = (_v5.ariaLog||[]).length;
  const rapidC  = _v5.rapidClickCount || 0;
  const backC   = _v5.backtrackCount  || 0;
  const selfC   = (_v5.selfCorrected||[]).length;
  const revC    = Object.keys(_v5.revisions||{}).length;
  const posChoices = _v5.positionChoices || {};
  const posKeys = Object.keys(posChoices);
  const anchorPct = posKeys.length ? Math.round(posKeys.filter(k=>posChoices[k]==='A').length/posKeys.length*100) : null;

  html += `
  <div class="cognita-light-section">
    <div class="cognita-light-title">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5.5" stroke="#8896AA"/><circle cx="6" cy="6" r="2" fill="#8896AA"/></svg>
      COGNITA Behavioural Metrics
    </div>
    <div class="cognita-metric-grid">
      <div class="cognita-metric-cell">
        <div class="cmc-val" style="color:${avgSec!=null?(avgSec<6?'#00A87A':avgSec<12?'#D97706':'#DC2626'):'#B0B8C4'}">${avgSec!=null?avgSec+'s':'—'}</div>
        <div class="cmc-label">Avg Decision</div>
        <div class="cmc-sub">response time</div>
      </div>
      <div class="cognita-metric-cell">
        <div class="cmc-val" style="color:${rapidC>2?'#DC2626':rapidC>0?'#D97706':'#00A87A'}">${rapidC}</div>
        <div class="cmc-label">Rapid Clicks</div>
        <div class="cmc-sub">&lt;4s decisions</div>
      </div>
      <div class="cognita-metric-cell">
        <div class="cmc-val" style="color:${backC>3?'#DC2626':backC>1?'#D97706':'#6B7A8D'}">${backC}</div>
        <div class="cmc-label">Backtracks</div>
        <div class="cmc-sub">panel revisits</div>
      </div>
      <div class="cognita-metric-cell">
        <div class="cmc-val" style="color:${selfC>0?'#00A87A':'#6B7A8D'}">${selfC}</div>
        <div class="cmc-label">Self-Corrections</div>
        <div class="cmc-sub">gap → expert</div>
      </div>
      <div class="cognita-metric-cell">
        <div class="cmc-val" style="color:#6B7A8D">${revC}</div>
        <div class="cmc-label">Revisions</div>
        <div class="cmc-sub">total changes</div>
      </div>
      <div class="cognita-metric-cell">
        <div class="cmc-val" style="color:${ariaEng>0?'#00A87A':'#B0B8C4'}">${ariaEng}</div>
        <div class="cmc-label">ARIA Engagements</div>
        <div class="cmc-sub">mentor sessions</div>
      </div>
      <div class="cognita-metric-cell">
        <div class="cmc-val" style="color:${anchorPct!=null?(anchorPct>60?'#DC2626':anchorPct>40?'#D97706':'#00A87A'):'#B0B8C4'}">${anchorPct!=null?anchorPct+'%':'—'}</div>
        <div class="cmc-label">Position Bias</div>
        <div class="cmc-sub">option-A rate</div>
      </div>
      <div class="cognita-metric-cell">
        <div class="cmc-val" style="color:#6B7A8D">${(_v5.confirmedGaps||[]).length}</div>
        <div class="cmc-label">Confirmed Gaps</div>
        <div class="cmc-sub">ARIA verified</div>
      </div>
    </div>
  </div>`;

  html += `</div>`;
  container.innerHTML = html;
}


// ── DASHBOARD ─────────────────────────────────
function renderDash() {
  const sessions = DB.get('aiwizn_sessions') || [];

  // Stats cards
  const expAll  = sessions.reduce((s,ss) => s + Object.values(ss.firstChoices||ss.choices||{}).filter(c=>c==='expert').length, 0);
  const gapsAll = sessions.reduce((s,ss) => s + Object.values(ss.firstChoices||ss.choices||{}).filter(c=>c==='gap').length, 0);
  const totDec  = sessions.reduce((s,ss) => s + Object.keys(ss.firstChoices||ss.choices||{}).length, 0);

  const elTotal = document.getElementById('st-total');
  const elExp   = document.getElementById('st-expert');
  const elGaps  = document.getElementById('st-gaps');
  const elExpP  = document.getElementById('st-exp-pct');
  const elGapP  = document.getElementById('st-gap-pct');
  const elNwi   = document.getElementById('st-cci');

  if (elTotal) elTotal.textContent = sessions.length;
  if (elExp)   elExp.textContent   = expAll;
  if (elGaps)  elGaps.textContent  = gapsAll;
  if (elExpP)  elExpP.textContent  = totDec>0 ? Math.round(expAll/totDec*100)+'% of decisions' : '—';
  if (elGapP)  elGapP.textContent  = totDec>0 ? Math.round(gapsAll/totDec*100)+'% of decisions' : '—';

  const nwiScores = sessions
    .map(ss => { const t=Object.keys(ss.firstChoices||ss.choices||{}).length; const e=Object.values(ss.firstChoices||ss.choices||{}).filter(c=>c==='expert').length; return t>0?e/t*100:null; })
    .filter(n => n!=null);
  if (elNwi) elNwi.textContent = nwiScores.length>0 ? Math.round(nwiScores.reduce((a,b)=>a+b,0)/nwiScores.length)+'%' : '—';

  // Sessions list
  const sesList = document.getElementById('sess-list');
  if (sesList) {
    if (!sessions.length) {
      sesList.innerHTML = '<div style="text-align:center;padding:36px;color:var(--txt3);font-family:\'JetBrains Mono\',monospace;font-size:11px">No sessions saved yet.</div>';
    } else {
      const colors = ['#00C896','#FF6B35','#7C3AED','#0BBCD4','#F59E0B','#F43F5E','#0A1826'];
      sesList.innerHTML = sessions.slice(-8).reverse().map((ss, i) => {
        const t   = Object.keys(ss.firstChoices||ss.choices||{}).length;
        const e   = Object.values(ss.firstChoices||ss.choices||{}).filter(c=>c==='expert').length;
        const nwi = t>0 ? Math.round(e/t*100) : 0;
        const cls = nwi>=70?'cci-h':nwi>=50?'cci-m':'cci-l';
        const init = (ss.nurse||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
        return `<div class="sess-row"><div class="sess-avatar" style="background:${colors[i%colors.length]}">${init}</div><div><div class="sess-name">${ss.nurse}</div><div class="sess-meta">${ss.unit||'No unit'} · ${new Date(ss.start).toLocaleDateString()} · ${t} dec.</div></div><div class="sess-cci ${cls}">${nwi}% NWI</div></div>`;
      }).join('');
    }
  }

  // Domain averages (all sessions)
  const avgEl = document.getElementById('dom-avgs');
  if (avgEl) {
    if (!sessions.length) {
      avgEl.innerHTML = '<div style="color:var(--txt3);font-family:\'JetBrains Mono\',monospace;font-size:11px;text-align:center;padding:20px 0">Complete sessions to see averages</div>';
    } else {
      const avg = {};
      DOMS.forEach(d => avg[d] = []);
      sessions.forEach(ss => {
        const dom = computeDoms(ss);
        DOMS.forEach(d => { if (dom[d]!=null) avg[d].push(dom[d]); });
      });
      avgEl.innerHTML = DOMS.map(d => {
        const vals = avg[d];
        const m = vals.length>0 ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
        const pct = m!=null ? Math.round(m*100) : 0;
        const c = m!=null ? (m>=.75?'var(--teal)':m>=.55?'var(--amber)':'var(--crimson)') : 'var(--border2)';
        return `<div class="radar-row"><div class="radar-label">${DLS[d]}</div><div class="radar-bar-wrap"><div class="radar-bar" style="width:${pct}%;background:${c}"></div></div><div class="radar-val" style="color:${c}">${m!=null?pct+'%':'—'}</div></div>`;
      }).join('');
    }
  }

  // Current session domain profile
  // Use firstChoices for domain profile — consistent with PERSONA NWI scoring
  var _v5d = (typeof v5State !== 'undefined' && v5State) || window.v5State || {};
  const _dashFC = (_v5d && Object.keys(_v5d.firstChoices||{}).length)
                  ? _v5d.firstChoices
                  : (S.firstChoices && Object.keys(S.firstChoices).length ? S.firstChoices : S.choices);
  const currD  = computeDoms({choices: _dashFC});
  const hasD   = DOMS.some(d => currD[d]!=null);
  const currEl = document.getElementById('curr-domains');
  if (currEl) {
    if (!hasD) {
      currEl.innerHTML = '<div style="color:var(--txt3);font-family:\'JetBrains Mono\',monospace;font-size:11px;text-align:center;padding:20px 0">Complete scenarios to build profile</div>';
    } else {
      currEl.innerHTML = DOMS.map(d => {
        const v   = currD[d];
        const pct = v!=null ? Math.round(v*100) : 0;
        const c   = v!=null ? (v>=.75?'var(--teal)':v>=.55?'var(--amber)':'var(--crimson)') : 'var(--border2)';
        return `<div class="radar-row"><div class="radar-label">${DLS[d]}</div><div class="radar-bar-wrap"><div class="radar-bar" style="width:${pct}%;background:${c}"></div></div><div class="radar-val" style="color:${c}">${v!=null?pct+'%':'—'}</div></div>`;
      }).join('');
    }
  }

  // Specialty chart
  const specEl = document.getElementById('spec-chart');
  if (specEl) {
    const spec  = computeSpec(currD);
    const specS = Object.entries(spec).sort((a,b) => b[1]-a[1]);
    const specColors = {'Cardiac ICU':'var(--crimson)','Neuro/Stroke':'var(--amber)','Medical ICU':'var(--cyan)','Med-Surg':'var(--teal)','ER/Trauma':'var(--orange)'};
    if (!hasD) {
      specEl.innerHTML = '<div style="color:var(--txt3);font-family:\'JetBrains Mono\',monospace;font-size:11px;text-align:center;padding:20px 0">No data yet</div>';
    } else {
      specEl.innerHTML = specS.map(([n,v]) => {
        const col = specColors[n] || 'var(--teal)';
        return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><div style="font-size:11px;font-weight:600;color:var(--txt2);width:105px;flex-shrink:0">${n}</div><div style="flex:1;height:10px;background:var(--border);border-radius:5px;overflow:hidden"><div style="height:100%;border-radius:5px;width:${v}%;background:${col}"></div></div><div style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:${col};width:38px;text-align:right">${v}%</div></div>`;
      }).join('');
    }
  }
}

// ── SESSION MANAGEMENT ────────────────────────
function showModal()  { document.getElementById('start-modal').classList.add('open'); document.getElementById('m-name').focus(); }
function closeModal() { document.getElementById('start-modal').classList.remove('open'); }

function startSession() {
  const name = document.getElementById('m-name').value.trim() || 'Demo Nurse';
  const unit = document.getElementById('m-unit').value.trim();
  S = { id:Date.now(), nurse:name, unit, start:new Date().toISOString(), choices:{}, reflection:'', done:false };
  saveCurr();
  const nurseEl = document.getElementById('hdr-nurse');
  if (nurseEl) nurseEl.textContent = name.split(' ')[0].toUpperCase();
  closeModal();
  // Reset visual state
  document.querySelectorAll('.choice').forEach(c => {
    c.classList.remove('sel-expert','sel-gap','sel-mid','revealed');
    const s = c.querySelector('.choice-signal');
    if (s) s.style.display = 'none';
  });
  document.querySelectorAll('.outcome').forEach(o => o.classList.remove('visible'));
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('done'));
  toast('Session started — ' + name, 't-ok');
  go('s1a');
  setTimeout(shuffleChoices, 600);
}

function saveSession() {
  if (!Object.keys(S.choices).length) { toast('Complete at least one scenario first','t-warn'); return; }
  // Merge all v5 stealth signals into S before saving
  S.firstChoices       = v5State.firstChoices;
  S.revisions          = v5State.revisions;
  S.selfCorrected      = v5State.selfCorrected;
  S.responseLatency    = v5State.responseLatency;
  S.rapidClickCount    = v5State.rapidClickCount;
  S.hoverTimes         = v5State.hoverTimes || {};
  S.scrollDepths       = v5State.scrollDepths || {};
  S.confirmedGaps      = v5State.confirmedGaps || [];
  S.positionChoices    = v5State.positionChoices || {};
  S.retestFirstChoices = v5State.retestFirstChoices;
  S.interChoiceIntervals  = v5State.interChoiceIntervals || {};
  S.postRevisionQuality   = v5State.postRevisionQuality || {};
  S.retestComparison      = v5State.retestComparison || {};
  S.done = true; saveCurr();
  const sessions = DB.get('aiwizn_sessions') || [];
  const idx = sessions.findIndex(s => s.id === S.id);
  if (idx>=0) sessions[idx]=S; else sessions.push(S);
  DB.set('aiwizn_sessions', sessions);
  // Send to Airtable (if configured)
  sendToAirtable(S);

  toast('Session saved to LUMINA Dashboard ✦','t-ok');
  setTimeout(() => go('dashboard'), 1200);
}

function clearData() {
  if (!confirm('Clear all session data? Cannot be undone.')) return;
  DB.del('aiwizn_sessions'); DB.del('aiwizn_curr');
  S = { id:Date.now(), nurse:'Demo', unit:'', start:new Date().toISOString(), choices:{}, reflection:'', done:false };
  renderDash();
  toast('Data cleared','');
}

// ── TOAST ─────────────────────────────────────
function toast(msg, cls='') {
  const c = document.getElementById('toasts');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast ' + (cls||'');
  t.innerHTML = '<span>◆</span>' + msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s';
    t.style.opacity = '0';
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
  }, 2800);
}

// ── TIMER ─────────────────────────────────────
function startTimer(id) {
  const el = document.getElementById(id);
  if (!el) return;
  let s = 0;
  if (timerInt) clearInterval(timerInt);
  timerInt = setInterval(() => {
    s++;
    const m   = String(Math.floor(s/60)).padStart(2,'0');
    const sec = String(s%60).padStart(2,'0');
    el.textContent = `⏱ ${m}:${sec} — Clinical Clock Running`;
  }, 1000);
}

// ── INIT ──────────────────────────────────────
(function init() {
  const saved = DB.get('aiwizn_curr');
  if (saved && saved.nurse && saved.nurse !== 'Demo') {
    S = saved;
    const nurseEl = document.getElementById('hdr-nurse');
    if (nurseEl) nurseEl.textContent = S.nurse.split(' ')[0].toUpperCase();
    // Restore sidebar done state
    for (const k of Object.keys(S.choices)) {
      const pBase = k.replace(/[_\d]+$/, '').replace(/_$/, '');
      const pKey  = SB_MAP[pBase] !== undefined ? pBase : k.replace(/[\d_]+$/, '');
      if (SB_MAP[pKey] !== undefined) {
        const items = document.querySelectorAll('.sb-item');
        if (items[SB_MAP[pKey]]) items[SB_MAP[pKey]].classList.add('done');
      }
    }
  }
  go('overview');
  startTimer('timer-s1a');
  setTimeout(shuffleChoices, 600);
})();


/* ═══════════════════════════════════════════
   ARIA — VIRTUAL MENTOR ENGINE
   Grafted onto AIWIZN v4 clinical engine.
   Uses template literals throughout (no apostrophe risk).
   Trigger: fires after gap/mid/first-expert choice.
═══════════════════════════════════════════ */

const ARIA_S = {

  s1a_gap: { d:1800, m:[
    `Before you move on — I noticed you chose nitroglycerin with BP 92/58. Was the reasoning that pain relief would reduce cardiac workload?`
  ], o:[
    {t:`Yes — I thought reducing pain would help his heart`, r:`That instinct makes clinical sense. Pain increases sympathetic tone and oxygen demand. The problem is NTG's mechanism — it works by venodilation, dropping preload. With BP already at 92, that preload drop can tip the heart into cardiogenic shock before you get any pain benefit.`, f:`The rule most nurses use: hold NTG if SBP is below 90, or if there has been recent phosphodiesterase inhibitor use. Does that help anchor it?`},
    {t:`I wasn't sure if 92 was low enough to matter`, r:`That uncertainty is completely reasonable. The AHA threshold is 90 systolic, but Mr. Osei is already in cardiogenic shock territory. NTG drops venous return to an already-struggling heart. Even 92 is risky here.`, f:`When uncertain about a BP threshold, a quick mental check: is this patient compensated or on the edge? That helps more than memorising the exact number.`},
    {t:`I didn't connect NTG to the BP reading`, r:`Honest answer — that is the gap worth closing. The connection: NTG causes venodilation which drops preload, which drops BP further. In a normal-BP patient it is mild. In a patient at 92, it can drop them to the 60s within 90 seconds.`, f:`Is there a way to build that connection into your routine assessment?`}
  ]},

  s1a_mid: { d:2000, m:[
    `You gave aspirin and O2 — both correct. But you waited for the attending before calling the cath lab. Was it uncertainty about the ECG, or a "this is the physician's call" instinct?`
  ], o:[
    {t:`I thought the physician needed to confirm first`, r:`Most hospitals have moved past that model for STEMI. The protocol authorises nursing cath lab activation on confirmed ECG criteria — to remove exactly this delay. The cath lab call and physician page can run simultaneously.`, f:null},
    {t:`I wasn't sure if I was allowed to call directly`, r:`That is a legitimate concern. But most STEMI protocols explicitly include nursing activation. Every minute of delay costs roughly 1.9 million cardiomyocytes.`, f:`If you found out your unit allows direct activation — would that change how you would respond next time?`}
  ]},

  s1b_1_gap: { d:1500, m:[
    `You administered the tPA without raising the GI bleed. That is the most common mechanism of serious medication error. What was going through your mind?`
  ], o:[
    {t:`I didn't notice the GI bleed in the chart`, r:`That is the honest answer, and it is a systems issue as much as an individual one. For high-risk drugs like thrombolytics, a structured contraindication check is part of the administration process — not optional.`, f:`What would a 30-second structured check look like for you before hanging a thrombolytic?`},
    {t:`I assumed the doctor had checked`, r:`The "doctor has checked" assumption is one of the most common gaps in medication safety. The nurse who administers shares legal and clinical accountability — regardless of who ordered it. Two people checking independently is the redundancy that catches errors.`, f:null},
    {t:`I felt uncomfortable but didn't want to question him`, r:`That discomfort was your clinical instinct working correctly. The technique that helps: name the specific concern. "I saw GI bleed in his chart" is harder to dismiss than "I am not sure."`, f:null}
  ]},

  s1b_2_gap: { d:1200, m:[
    `You challenged once, then backed down. Before the clinical side — how did that exchange feel?`
  ], o:[
    {t:`Uncomfortable — like I was being insubordinate`, r:`That feeling has a name: authority gradient anxiety. The technique that helps is depersonalisation: "Protocol requires" shifts the conflict from you versus him to him versus an institutional rule. You become the messenger, not the challenger.`, f:`Try saying this out loud: "Protocol requires a documented override before I can administer." Notice how it differs from "I am not comfortable with this."?`},
    {t:`I thought maybe he was right and I was overreacting`, r:`That second-guessing is what authority pressure is designed to produce. Check: has anything changed clinically since your first challenge? No. Has the contraindication disappeared? No. What changed is social pressure — not data.`, f:null},
    {t:`I worried about the consequences of escalating`, r:`Research shows nurses who hold firm and cite documented protocols are protected. The record says "nurse followed safety protocol." That is a defensible position. Silent administration is not.`, f:null}
  ]},

  s1c_gap: { d:2000, m:[
    `Mrs. Osei is hearing about her husband's end-of-life wishes through her daughter. What actually gets transmitted in that conversation — not what should?`
  ], o:[
    {t:`I assumed the daughter would translate accurately`, r:`Accuracy is the easiest problem to fix, and it is not even the main one. The daughter is simultaneously processing grief, managing her mother's reaction, translating terminology she may not know, and filtering what she thinks her mother can handle. Research shows significant filtering in over 75% of such encounters — not from dishonesty, but from love.`, f:`A qualified interpreter has one job: transmit meaning accurately. The daughter has three jobs in this moment.`},
    {t:`A qualified interpreter wasn't available at this hour`, r:`Phone interpreter services are available 24 hours a day. Many hospitals contract with them specifically for this reason. The barrier is usually that people do not know the number.`, f:`Worth finding out tonight where the phone interpreter access number is in your unit.`}
  ]},

  s2a_gap: { d:1500, m:[
    `You reached for labetalol with a BP of 186/104. I want to understand the clinical logic — because it is actually a reasonable instinct in most contexts, just not this one.`
  ], o:[
    {t:`I thought high BP worsened stroke outcomes`, r:`In haemorrhagic stroke, yes — that is probably where the instinct comes from. But this is ischaemic stroke. The only blood reaching the penumbra is through collateral pathways that depend on systemic pressure to push through. When you lower BP, you reduce collateral flow and treat a number that is currently doing useful work.`, f:`Useful model: in ischaemic stroke, permissive hypertension up to 185/110 is buying time for the penumbra.`},
    {t:`I was worried about haemorrhagic transformation`, r:`That is the right concern for the right drug — but it applies after tPA is given, not before. The pre-tPA threshold is 185/110. Mrs. Reyes is at 186/104 — she is not over threshold. Treating her now delays the drug.`, f:null},
    {t:`I didn't know the threshold was different for stroke`, r:`That is genuinely non-obvious. The cardiac reflex is to treat anything over 180. The stroke exception inverts it because normal autoregulation is broken in the infarcted area.`, f:`Anchor: "Stroke — do not touch BP unless over 185/110 before tPA." Stroke is the one exception worth drilling.`}
  ]},

  s2b_gap: { d:1500, m:[
    `Dr. Kim is frozen. Twelve minutes on the clock. You accepted that. What did you believe was true about your role in that moment?`
  ], o:[
    {t:`Consent and clinical decisions were the physician's job`, r:`Consent is the physician's responsibility to obtain — you are right about that. But advocacy is a nursing responsibility. The advocacy needed here is clinical information: Mr. Reyes is the substitute decision-maker, emergent consent is legally valid, the window is closing. That is not overstepping — that is handing Dr. Kim the framework he needs.`, f:null},
    {t:`I didn't know substitute decision-maker consent was valid`, r:`Common law doctrine of necessity: when a patient lacks capacity in an emergency, treatment may proceed with next-of-kin consent. Mr. Reyes — the husband, present — can consent for his wife. The nurse who knows it has an obligation to say so.`, f:`Picture walking up to Dr. Kim and saying: "The husband can consent as substitute decision-maker — this is standard emergent consent."?`},
    {t:`I worried about overstepping`, r:`What would overstepping actually mean here? You would be telling a physician a correct legal fact that enables a potentially life-saving treatment. The worst-case outcome of overstepping: he knows something you told him. The worst-case of not overstepping: Mrs. Reyes misses the window permanently.`, f:null}
  ]},

  s2c_gap: { d:2000, m:[
    `Google Translate for anticoagulation discharge. What does "call if you bruise unusually" sound like through a consumer translation app for a distressed post-stroke patient?`
  ], o:[
    {t:`It might miss some nuance but the core message gets through`, r:`The core message in this case is the bleeding precaution: call emergency services if you develop sudden severe headache or vision changes. That sentence through a consumer app will be technically correct but not parsed quickly by someone under stress. The nuance is the part that prevents readmission.`, f:`Test for sufficient translation: can the patient teach it back to you in their own words?`},
    {t:`I knew it wasn't ideal but we were under bed pressure`, r:`Bed pressure is real. But if you chart "discharge teaching completed" and Mrs. Reyes is readmitted in five days with an anticoagulation-related bleed, the chart will be reviewed. "Teaching completed via Google Translate" is not a defensible standard of care.`, f:`Language to use when pushing back: "I cannot discharge safely without a qualified interpreter for this medication. I need 25 more minutes."`},
    {t:`The family could help her understand at home`, r:`And they will. But the discharge moment is when a qualified professional has the patient in front of them and can check comprehension. Once she leaves, that moment is gone.`, f:null}
  ]},

  s3a_gap: { d:2000, m:[
    `SOFA 5, MAP 58, lactate 3.1, wound erythema. You decided to wait until 0600 rounds. What does "not in acute distress" mean as a clinical decision point here?`
  ], o:[
    {t:`He looked stable enough to wait a few hours`, r:`The look of stability in early sepsis is one of its most dangerous features. He is compensating — heart rate and respiratory rate are doing the work his blood pressure cannot. MAP 58 means his end organs are at the edge of ischaemia. Lactate 3.1 means anaerobic metabolism has already started. That compensation does not last.`, f:`Each hour of delay in sepsis antibiotics carries approximately a 7% increase in mortality in septic shock. "Waiting until 0600" at 0340 is a two-hour delay.`},
    {t:`I wasn't sure if this met sepsis criteria`, r:`Check qSOFA: respiratory rate over 22 — yes. Altered mentation — yes. MAP 58 is below the 65 threshold. That is 2 out of 3 qSOFA plus a confirmed source. The protocol exists to remove the cognitive burden of this decision at 0340.`, f:null},
    {t:`I started antibiotics first to treat faster`, r:`The urgency instinct is exactly right. The sequence is wrong. Antibiotics sterilise the blood within minutes — a culture drawn after will grow nothing. At 48 hours when you want to de-escalate, you have no organism. One sequence swap — cultures first, then antibiotics — preserves the diagnostic value.`, f:`Anchor: "Cultures before cure." 90 seconds. Changes the entire downstream management.`}
  ]},

  s3b_gap: { d:1500, m:[
    `The pharmacist gave you a reason to wait and it sounded clinical. Did it feel like a clinical argument, or an authority figure telling you to stop?`
  ], o:[
    {t:`It felt like a legitimate clinical concern`, r:`It was framed well. "Wait for sensitivities" sounds evidence-based. The problem is the timeline — sensitivities take 48 to 72 hours. In septic shock, waiting 48 hours is not watchful waiting, it is delayed treatment. The SSC guideline is explicit: broad-spectrum empiric antibiotics within 1 hour of sepsis recognition.`, f:`The Surviving Sepsis Campaign Hour-1 Bundle requires empiric antibiotics within one hour. That is the citation that carries authority.`},
    {t:`I wasn't sure enough to push back`, r:`When in a dispute about antibiotic timing in a septic patient, "the Surviving Sepsis Campaign Hour-1 Bundle recommends empiric antibiotics within one hour" is a citation that carries institutional authority. You do not need to out-pharmacology the pharmacist — you need to name the guideline.`, f:null},
    {t:`I continued paging the resident instead`, r:`The right instinct — escalate. But each page attempt takes 2 to 3 minutes, and with MAP falling, 47 minutes of paging is delay with documentation. The more effective path: call the attending directly. "MAP 56, 47-minute antibiotic delay, sepsis criteria met, I need a verbal order."`, f:null}
  ]},

  s3c_gap: { d:2000, m:[
    `The son watched his father wheeled away without anyone saying a word. What does a person do when that happens?`
  ], o:[
    {t:`He'd probably follow the gurney and ask in the corridor`, r:`Exactly. Then you have a distressed family member in a clinical corridor during an active transfer, potentially blocking the elevator. The 90 seconds of silence you saved created the conflict you were trying to avoid.`, f:`The content of 90 seconds: "Your father is very sick. We found the infection. We are treating it. ICU team will meet you there." Four honest sentences. All of them enough.`},
    {t:`He'd wait quietly and trust the team`, r:`Some families do. But the son has been asking for information and getting silence. A family member managing distress without information is not in the state where trust is available. 90 seconds of honest language converts that.`, f:null}
  ]},

  expert_1: { d:3500, m:[
    `Good call. How confident were you when you made that choice? There is a difference between knowing what to do and knowing why — and only one of those transfers to the next patient you have not seen yet.`
  ], o:[
    {t:`Fairly confident — the reasoning felt clear`, r:`Then you are in a strong position. The next step from correct answer to expert practice is being able to explain the mechanism to a junior colleague in 30 seconds.`, f:null},
    {t:`Reasonably confident but I second-guessed myself`, r:`That second-guessing is actually healthy — it means you are evaluating rather than pattern-matching. Proficient nurses check their reasoning even when the action feels right.`, f:null},
    {t:`Not very — I guessed based on what felt most careful`, r:`"What felt most careful" often correlates with the right choice in emergency nursing. But when you have a moment, read the evidence in the formative panel. Knowing the mechanism makes you faster when the next case is messier.`, f:null}
  ]},

  end: { d:1500, m:[
    `You have completed all three scenarios. Before looking at your PERSONA profile — which moment felt most like real clinical pressure to you?`
  ], o:[
    {t:`The authority challenge — standing firm with Dr. Patel`, r:`Authority gradient is present in every clinical environment. The fact that it felt like real pressure tells you something important about where your edge is. That awareness is the first step in the two-challenge pattern becoming reflexive.`, f:null},
    {t:`The time pressure on the tPA window`, r:`Time pressure narrows attention and makes sequential thinking feel like the only option. The expert move is parallel action, which requires overriding that instinct deliberately. Name it next time it happens — that is the start of changing it.`, f:null},
    {t:`The language access scenario — a systems failure`, r:`It is a systems failure. And yet the nurse in the room still has a decision to make within it. You saw it clearly. The harder follow-on: what did you do with that clarity in the scenario?`, f:null}
  ]}
};

// ── ARIA STATE ───────────────────────────────────────────────
let _ariaExpertFired = false;  // expert_1 only fires once

// ── ARIA FUNCTIONS ───────────────────────────────────────────
function ariaOpen() {
  const p = document.getElementById('aria-panel');
  const b = document.getElementById('aria-btn');
  const n = document.getElementById('aria-notif');
  if (p) p.classList.add('ao');
  if (b) b.classList.add('ah');
  if (n) n.classList.remove('show');
  // Hide any open quick-nav while ARIA is talking
  document.querySelectorAll('.quick-nav.show').forEach(function(qn){
    qn.style.opacity = '0.35'; qn.style.pointerEvents = 'none';
  });
}
function ariaClose() {
  const p = document.getElementById('aria-panel');
  const b = document.getElementById('aria-btn');
  if (p) p.classList.remove('ao');
  if (b) b.classList.remove('ah');
  // Restore quick-nav after ARIA closes
  document.querySelectorAll('.quick-nav').forEach(function(qn){
    qn.style.opacity = ''; qn.style.pointerEvents = '';
  });
}



function ariaToggle() {
  const p = document.getElementById('aria-panel');
  if (p && p.classList.contains('ao')) ariaClose();
  else ariaOpen();
}

function ariaAddMsg(text, isUser) {
  const c = document.getElementById('aria-msgs');
  if (!c) return;
  const d = document.createElement('div');
  d.className = isUser ? 'ab abu' : 'ab';
  d.textContent = text;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

function ariaSetOpts(opts, nodeId) {
  const c = document.getElementById('aria-opts');
  if (!c) return;
  c.innerHTML = '';
  opts.forEach(function(opt) {
    const b = document.createElement('button');
    b.className = 'ao-btn';
    b.textContent = opt.t;
    b.onclick = function() {
      ariaAddMsg(opt.t, true);
      c.innerHTML = '';
      // Log to session if available
      if (typeof S !== 'undefined') {
        if (!S.ariaLog) S.ariaLog = [];
        S.ariaLog.push({
          ts:       Date.now(),
          node:     nodeId,
          question: (document.getElementById('aria-msgs') && document.getElementById('aria-msgs').querySelector('.ab:not(.abu)') ? document.getElementById('aria-msgs').querySelector('.ab:not(.abu)').textContent.trim() : ''),
          chosen:   opt.t,
          reply:    opt.r || '',
          followup: opt.f || ''
        });
        if (typeof saveCurr === 'function') saveCurr();
      }
      setTimeout(function() {
        if (opt.r) ariaAddMsg(opt.r, false);
        if (opt.f) {
          setTimeout(function() {
            ariaAddMsg(opt.f, false);
            // Close prompt after followup
            setTimeout(function() {
              var closeBtn = document.createElement('button');
              closeBtn.className = 'ao-btn';
              closeBtn.textContent = 'Got it — continue';
              closeBtn.onclick = function() {
                document.getElementById('aria-opts').innerHTML = '';
                ariaClose();
              };
              document.getElementById('aria-opts').appendChild(closeBtn);
            }, 1600);
          }, 2000);
        } else {
          setTimeout(function() {
            var closeBtn = document.createElement('button');
            closeBtn.className = 'ao-btn';
            closeBtn.textContent = 'Got it — continue';
            closeBtn.onclick = function() {
              document.getElementById('aria-opts').innerHTML = '';
              ariaClose();
            };
            c.appendChild(closeBtn);
          }, 1200);
        }
      }, 700);
    };
    c.appendChild(b);
  });
}

function ariaTrigger(nodeId, type) {
  // Pick the script
  var key = nodeId + '_' + type;
  var scr = ARIA_S[key];

  // Fallback: mid choices use the gap script for same node
  if (!scr && type === 'mid') scr = ARIA_S[nodeId + '_gap'];

  // Expert: fire once only on the very first expert choice
  if (!scr && type === 'expert' && !_ariaExpertFired) {
    scr = ARIA_S['expert_1'];
    _ariaExpertFired = true;
  }

  if (!scr) return;  // no script for this node/type

  var btn  = document.getElementById('aria-btn');
  var notif = document.getElementById('aria-notif');
  var msgs  = document.getElementById('aria-msgs');
  var opts  = document.getElementById('aria-opts');

  // Reset panel
  if (msgs) msgs.innerHTML = '';
  if (opts) opts.innerHTML = '';

  // Show the brain button
  if (btn)   btn.classList.remove('ah');
  if (notif) notif.classList.add('show');

  // After the delay, open panel and deliver the message
  setTimeout(function() {
    ariaOpen();
    var delay = 0;
    scr.m.forEach(function(msg) {
      setTimeout(function() {
        ariaAddMsg(msg, false);
      }, delay);
      delay += 1600;
    });
    setTimeout(function() {
      ariaSetOpts(scr.o, nodeId);
    }, delay + 200);
  }, scr.d);
}

// ── HOOK INTO V4's handleChoiceClick ─────────────────────────
// Wrap the existing delegated listener to also call ariaTrigger.
// We use a flag to avoid re-triggering on revisions.
var _ariaFirstChoices = {};

document.addEventListener('click', function(e) {
  var el = e.target.closest('.choice[data-type]');
  if (!el) return;
  var type   = el.dataset.type;
  var nodeId = el.dataset.node;
  if (!type || !nodeId) return;
  // Only fire on the user's FIRST click on this node
  if (_ariaFirstChoices[nodeId]) return;
  _ariaFirstChoices[nodeId] = type;
  ariaTrigger(nodeId, type);
});

// ── ARIA on PERSONA panel load ───────────────────────────────
// Override go() to detect when user reaches persona panel
var _origGoForAria = go;
go = function(name) {
  _origGoForAria(name);
  if (name === 'persona') {
    setTimeout(function() {
      var scr = ARIA_S['end'];
      if (!scr) return;
      var btn = document.getElementById('aria-btn');
      var n   = document.getElementById('aria-notif');
      var msgs = document.getElementById('aria-msgs');
      var opts = document.getElementById('aria-opts');
      if (msgs) msgs.innerHTML = '';
      if (opts) opts.innerHTML = '';
      if (btn) btn.classList.remove('ah');
      if (n)   n.classList.add('show');
      setTimeout(function() {
        ariaOpen();
        scr.m.forEach(function(msg, i) {
          setTimeout(function() { ariaAddMsg(msg, false); }, i * 1600);
        });
        setTimeout(function() { ariaSetOpts(scr.o, 'persona'); }, scr.m.length * 1600 + 200);
      }, scr.d);
    }, 800);
  }
};

/* END ARIA ENGINE */

/* ═══════════════════════════════════════════════════════════
   AIWIZN V5 FEATURE LAYER
   Grafted onto v4+ARIA base.
   No modifications to existing v4 functions.
   Uses wrapper/hook pattern throughout.
   All text in template literals — apostrophe safe.
═══════════════════════════════════════════════════════════ */

// ── EXTENDED SESSION MODEL ────────────────────────────────────
// Patch the existing S object to add v5 fields without breaking v4
(function patchSession() {
  // Ensure S has all v5 fields (for legacy sessions missing them)
  if (!S.firstChoices)        S.firstChoices        = {};
  // Restore COGNITA fields from localStorage on reload
  if (S.backtrackCount != null)     v5State.backtrackCount     = S.backtrackCount;
  if (S.ariaLog)                    v5State.ariaLog            = S.ariaLog;
  if (S.interChoiceIntervals)       v5State.interChoiceIntervals = S.interChoiceIntervals;
  if (S.positionChoices)            v5State.positionChoices    = S.positionChoices;
  if (S.confirmedGaps)              v5State.confirmedGaps      = S.confirmedGaps;
  if (S.postRevisionQuality)        v5State.postRevisionQuality= S.postRevisionQuality;
  // Always sync v5State.firstChoices from S on load (in-memory reset on refresh)
  if (S.firstChoices && !Object.keys(v5State.firstChoices||{}).length) {
    v5State.firstChoices = S.firstChoices;
  }
  if (!S.revisions)           S.revisions           = {};
  if (!S.selfCorrected)       S.selfCorrected       = [];
  if (!S.responseLatency)     S.responseLatency     = {};
  if (!S.nodeOpenedAt)        S.nodeOpenedAt        = {};
  if (!S.rapidClickCount)     S.rapidClickCount     = 0;
  if (!S.backtrackCount)      S.backtrackCount      = 0;
  if (!S.retestFirstChoices)  S.retestFirstChoices  = {};
  if (!S.retestChoices)       S.retestChoices       = {};
  if (!S.ariaLog)             S.ariaLog             = [];

  // CRITICAL FIX: restore v5State from S on every page load/refresh.
  // v5State is an in-memory object that resets to {} on each load.
  // S is persisted in localStorage — so we must hydrate v5State from S.
  // Without this, computeNWI falls back to S.choices (includes revisions)
  // and shows inflated scores (e.g. 100% after all gaps revised to expert).
  if (Object.keys(S.firstChoices).length) {
    v5State.firstChoices      = S.firstChoices;
    v5State.revisions         = S.revisions         || {};
    v5State.selfCorrected     = S.selfCorrected      || [];
    v5State.responseLatency   = S.responseLatency    || {};
    v5State.nodeOpenedAt      = S.nodeOpenedAt       || {};
    v5State.rapidClickCount   = S.rapidClickCount    || 0;
    v5State.backtrackCount    = S.backtrackCount     || 0;
    v5State.retestFirstChoices = S.retestFirstChoices || {};
    v5State.ariaLog           = S.ariaLog            || [];
    v5State.hoverTimes        = S.hoverTimes         || {};
    v5State.scrollDepths      = S.scrollDepths       || {};
    v5State.confirmedGaps     = S.confirmedGaps      || [];
    v5State.positionChoices   = S.positionChoices    || {};
    v5State.interChoiceIntervals = S.interChoiceIntervals || {};
    v5State.postRevisionQuality  = S.postRevisionQuality  || {};
  }
})();

// ── FORMATIVE FEEDBACK DATA ───────────────────────────────────
var FP_DATA = {
  s1a:  {gap:`NTG at SBP 92 causes venodilation, dropping preload, which tips an already-struggling heart into cardiogenic shock. AHA: hold NTG if SBP less than 90.`, expert:`Your parallel action pattern is correct. Review: aspirin, O2, cath lab activation, NTG withheld for hypotension — all simultaneously.`, mid:`Medications correct. Parallel vs serial action is the gap — cath lab call should not wait for physician to pick up.`, ev:`AHA/ACC STEMI 2023: Door-to-balloon target 90 min. NTG contraindicated if SBP less than 90. Every minute delay costs ~1.9M cardiomyocytes.`},
  s1a2: {gap:`Incomplete SBAR — the Recommendation ("I need a verbal order for cath lab activation now") is the part that gets the order. Without it you get questions back.`, expert:`Complete SBAR with explicit Recommendation. That is the element that converts a briefing into an actionable request.`, mid:`Assessment provided without Recommendation. The R in SBAR is what actually gets the physician to act.`, ev:`Kaiser SBAR research: complete SBAR reduces physician callback time by 40% versus unstructured handoffs.`},
  s1b1: {gap:`GI bleed within 3 months is an absolute contraindication to thrombolytics — not relative. Administering without raising it means shared clinical and legal liability for the outcome.`, expert:`Specific contraindication named and PCI alternative offered. That is the complete challenge pattern.`, mid:`Concern raised but non-specifically. "I want to double-check" invites dismissal. Naming the specific contraindication is what holds.`, ev:`AHA Class I: PCI over thrombolytics when available within 120 min. GI bleed less than 3 months = absolute contraindication.`},
  s1b2: {gap:`85% of nurses capitulate on the second challenge. The technique that changes outcomes: cite protocol not personal opinion. "Protocol requires documented override" makes the conflict institutional, not interpersonal.`, expert:`Two-challenge pattern complete. Protocol-grounded challenge at the hardest moment — when authority pushes back.`, mid:`Escalation via proxy adds a communication loop and removes you from the room. Direct protocol-cited challenge is faster and more defensible.`, ev:`TeamSTEPPS: authority gradient is the #1 cause of preventable medication errors. Two-challenge rule adapted from military CRM protocols.`},
  s1c:  {gap:`Family interpreters filter emotionally charged content in more than 75% of encounters — not from dishonesty but from love. Accuracy is the easiest problem to fix. Filtering is the harder one.`, expert:`Three domains simultaneously: qualified interpreter, grief acknowledgment before clinical content, DNR integrity upheld.`, mid:`DNR upheld correctly. Interpreter omitted — grief support and clinical content both require qualified interpretation.`, ev:`Flores 2012: family interpreters produce clinically significant errors in 77% of encounters. JCAHO requires qualified interpretation for all medical discussions.`},
  s2a:  {gap:`Labetalol at 186/104 reduces collateral perfusion to the penumbra. Permissive hypertension up to 185/110 is the AHA threshold before tPA — the BP is currently doing useful work for the ischaemic tissue.`, expert:`Correct BP decision. Hold antihypertensives below 185/110. Parallel: stroke alert, CT, NIHSS, IV access, neurology page.`, mid:`Parallel actions correct. BP treatment at 186/104 was premature — the threshold is 185/110, not 180.`, ev:`AHA Stroke 2023: hold antihypertensives unless BP over 185/110 before tPA. Every 30-min delay = loss of ~120M neurons.`},
  s2a2: {gap:`Aphasic patient lacks capacity for the duration of the aphasia. Husband as next-of-kin is a valid substitute decision-maker under common law necessity doctrine. Consent delay closes the tPA window.`, expert:`SDM consent framework provided to Dr. Kim AND attending escalation simultaneously. Expert dual-channel advocacy.`, mid:`Attending page correct. Providing SDM framework to Dr. Kim simultaneously would have broken the paralysis faster.`, ev:`Common law doctrine of necessity: emergency treatment may proceed with next-of-kin consent when patient lacks capacity.`},
  s2b:  {gap:`Accepted Dr. Kim's paralysis. The advocacy needed was clinical information: SDM consent is legally valid, window is closing. That is not overstepping — it is giving Dr. Kim the framework he needed.`, expert:`Both channels simultaneously: SDM explanation to Dr. Kim AND attending page. Every minute of delay costs 1.9M neurons.`, mid:`One channel when two were available. Both simultaneously is the expert parallel action.`, ev:`Brain tissue at NIHSS 16 worsening: approximately 1.9 million neurons and 14 billion synapses per minute without treatment.`},
  s2c:  {gap:`Google Translate cannot produce teach-back. Anticoagulation discharge without qualified interpretation carries 3x higher error rate. The 25 minutes spent now costs less than the readmission.`, expert:`Qualified interpreter, teach-back, anticoagulation teaching completed. Documentation defensible.`, mid:`Correct instinct. Phone interpreter available 24/7. Language: "I cannot discharge safely without qualified interpretation for this medication."`, ev:`NCHC: medication errors 3x higher with limited English proficiency when qualified interpreters not used at discharge (Flores 2012).`},
  s3a:  {gap:`Antibiotics before cultures eliminates diagnostic yield — ABX sterilise the blood within minutes. At 48 hours when de-escalation is possible, no organism, no targeted therapy, broad-spectrum continues. C. diff risk.`, expert:`Cultures before antibiotics. Then ABX within 1 hour. Parallel: rapid response, IV access, fluids, page. Correct SSC sequence.`, mid:`Escalation correct. Sequence: cultures must precede ABX by 90 seconds — preserves the entire downstream de-escalation pathway.`, ev:`SSC 2021 Hour-1 Bundle. Kumar 2006: each hour delay in antibiotics in septic shock carries ~7% increase in mortality.`},
  s3b:  {gap:`Pharmacist reasoning inverts for active sepsis. Sensitivities take 48 to 72 hours — waiting that long for targeted therapy is not caution, it is delayed treatment. SSC Hour-1 is the citation that wins this argument.`, expert:`SSC Hour-1 Bundle cited. Simultaneously escalated to attending directly with MAP and time data. Correct dual escalation.`, mid:`Paging resident when attending call was available. With MAP 56 and falling, direct attending call with numbers is faster.`, ev:`SSC 2021: empiric broad-spectrum ABX within 1 hour of sepsis recognition. De-escalate to targeted therapy when sensitivities return at 48-72h.`},
  s3c:  {gap:`Silence creates a distressed family member in a clinical corridor blocking an active transfer. 90 seconds of honest communication prevents 10 minutes of conflict and protects the transfer.`, expert:`90-second communication plus simultaneous SBAR completion to ICU. Dual-track — clinical and family — both done.`, mid:`Communication attempted. Four specific honest sentences plus simultaneous ICU SBAR is the complete dual-track response.`, ev:`JICS 2019: family conflict accounts for 23% of ICU admission delays. Joint Commission 2018: incomplete critical handoffs increase adverse events 2.4x within 24 hours.`},
  s3c2: {gap:`Suppression is the leading predictor of moral injury accumulation. Processing is not weakness — it is the resilience architecture that sustains long careers in high-intensity settings.`, expert:`Named the experience, accepted support, identified a forward step. The three-element resilience response.`, mid:`Partial acknowledgment without forward step. Identifying one specific support action closes the resilience loop.`, ev:`Dasan 2015: 43% of ICU nurses show PTSD symptoms from moral distress. Moral resilience interventions reduce burnout scores 28% at 6 months.`}
};

// Peer stats (realistic training data distribution)
var PEER_STATS = {
  s1a:{expert:42,mid:31,gap:27}, s1a2:{expert:61,mid:24,gap:15},
  s1b1:{expert:71,mid:12,gap:17}, s1b2:{expert:28,mid:18,gap:54},
  s1c:{expert:38,mid:29,gap:33}, s2a:{expert:44,mid:28,gap:28},
  s2a2:{expert:52,mid:26,gap:22}, s2b:{expert:35,mid:33,gap:32},
  s2c:{expert:41,mid:22,gap:37}, s3a:{expert:48,mid:27,gap:25},
  s3b:{expert:39,mid:25,gap:36}, s3c:{expert:55,mid:22,gap:23},
  s3c2:{expert:47,mid:31,gap:22}
};

// Learning objective tags
var LO_TAGS = {
  s1a: ['D5: Deterioration','D6: Pharmacology','D8: Prioritisation'],
  s1a2:['D7: SBAR','D4: Advocacy'],
  s1b1:['D4: Authority Challenge','D6: Contraindication'],
  s1b2:['D4: Two-Challenge','D3: Ethics'],
  s1c: ['D2: Communication','D3: Ethics','D9: Cultural Humility'],
  s2a: ['D5: Stroke Recognition','D6: BP Management'],
  s2a2:['D4: Consent Framework','D7: Advocacy'],
  s2b: ['D4: SDM Consent','D7: Physician Brief'],
  s2c: ['D9: Language Access','D11: Health Equity'],
  s3a: ['D5: Sepsis Bundle','D6: Culture Sequence'],
  s3b: ['D4: Guideline Citation','D7: Dual Escalation'],
  s3c: ['D5: Transfer','D2: Crisis Comm','D7: SBAR Handoff'],
  s3c2:['D12: Moral Resilience']
};

// ── FORMATIVE PANEL FUNCTIONS ─────────────────────────────────
function v5ShowFormative(nodeId, type) {
  var nc = nodeId.replace(/_/g,'');
  var fp = document.getElementById('fp-' + nc);
  if (!fp) return;
  fp.classList.add('fvis');

  // Type-based header
  var hdr = document.getElementById('fp-hdr-' + nc);
  var icon = document.getElementById('fp-icon-' + nc);
  var title = document.getElementById('fp-title-' + nc);
  var teach = document.getElementById('fp-teach-' + nc);
  var ev = document.getElementById('fp-ev-' + nc);
  var peer = document.getElementById('fp-peer-' + nc);
  var lo_wrap = document.getElementById('fp-lo-' + nc);
  var rlbl = document.getElementById('fp-rlbl-' + nc);
  var rbtn = document.getElementById('fp-rbtn-' + nc);

  fp.className = 'fp fvis fp-' + type;
  if (icon) icon.textContent = type==='expert' ? '✦' : type==='gap' ? '⚠' : '◆';
  if (title) title.textContent = type==='expert'
    ? `Strong Reasoning — Here is the Evidence`
    : type==='gap'
    ? `Teaching Point — Understanding the Expert Response`
    : `Good Instinct — One Element to Strengthen`;

  var d = FP_DATA[nc] || {};
  if (teach) teach.textContent = d[type] || '';
  if (ev) ev.textContent = d.ev || '';

  // Peer stat
  var ps = PEER_STATS[nc];
  if (peer && ps) {
    var pct = ps[type] || 0;
    var msg = type==='expert'
      ? pct + `% of nurses chose the expert response on this node`
      : pct + `% of nurses made the same choice here`;
    peer.innerHTML = `<strong>` + pct + `%</strong>&nbsp;` + msg;
  }

  // LO tags
  if (lo_wrap) {
    lo_wrap.innerHTML = '';
    var tags = LO_TAGS[nc] || [];
    tags.forEach(function(t) {
      var s = document.createElement('span');
      s.className = 'fp-lo'; s.textContent = t;
      lo_wrap.appendChild(s);
    });
  }

  // Revise button
  var isRevision = !!(v5State.firstChoices[nodeId]);
  if (rbtn && rlbl) {
    if (!isRevision && type !== 'expert') {
      rlbl.textContent = `First choice scored for NWI. Revision tracked separately as learning.`;
      rbtn.style.display = 'inline-flex';
    } else if (isRevision && type==='expert') {
      rlbl.textContent = `Self-correction noted. Gap-to-expert revision is a positive metacognitive signal.`;
      rbtn.style.display = 'none';
    } else {
      rlbl.textContent = '';
      rbtn.style.display = 'none';
    }
  }

  setTimeout(function() {
    if (fp.closest('.panel.active')) {
      fp.scrollIntoView({behavior:'smooth', block:'nearest'});
    }
  }, 300);
}

function v5Revise(nc) {
  var nodeId = nc; // nc already stripped of underscores
  // Re-enable choice buttons for this node
  var ch = document.getElementById('ch-' + nc);
  if (!ch) return;
  ch.querySelectorAll('.choice').forEach(function(c) {
    c.classList.remove('sel-expert','sel-gap','sel-mid','revealed');
    var sig = c.querySelector('.choice-signal');
    if (sig) sig.style.display = 'none';
  });
  // Hide fp and outcome
  var fp = document.getElementById('fp-' + nc);
  var out = document.getElementById('out-' + nc);
  if (fp) fp.classList.remove('fvis');
  if (out) { out.className = 'outcome'; out.querySelector('.out-label').textContent=''; out.querySelector('.out-text').textContent=''; }
  toast('Choose again — first choice already scored ◆','');
  ch.scrollIntoView({behavior:'smooth', block:'start'});
}

function v5Dismiss(nc) {
  var fp = document.getElementById('fp-' + nc);
  if (!fp) return;
  fp.style.transition = 'opacity .3s';
  fp.style.opacity = '0';
  setTimeout(function() { fp.style.display = 'none'; }, 300);
}

// ── V5 STATE (separate from v4 S to avoid conflicts) ──────────
var v5State = {
  firstChoices:          {},
  revisions:             {},
  selfCorrected:         [],
  responseLatency:       {},
  nodeOpenedAt:          {},
  rapidClickCount:       0,
  retestFirstChoices:    {},
  // COGNITA stealth fields (initialised here so always available)
  backtrackCount:        0,
  ariaLog:               [],
  interChoiceIntervals:  {},
  positionChoices:       {},
  hoverTimes:            {},
  confirmedGaps:         [],
  postRevisionQuality:   {}
};
// Expose v5State globally so v4 code can access it across IIFE boundaries
window.v5State = v5State;

// Patch saveCurr to also persist v5State
var _v4SaveCurr = saveCurr;
saveCurr = function() {
  _v4SaveCurr();
  // Merge v5State into S for export
  S.firstChoices         = v5State.firstChoices;
  S.revisions            = v5State.revisions;
  S.selfCorrected        = v5State.selfCorrected;
  S.responseLatency      = v5State.responseLatency;
  S.rapidClickCount      = v5State.rapidClickCount;
  S.retestFirstChoices   = v5State.retestFirstChoices;
  S.backtrackCount       = v5State.backtrackCount;
  S.ariaLog              = v5State.ariaLog;
  S.interChoiceIntervals = v5State.interChoiceIntervals;
  S.positionChoices      = v5State.positionChoices;
  S.hoverTimes           = v5State.hoverTimes;
  S.confirmedGaps        = v5State.confirmedGaps;
  S.postRevisionQuality  = v5State.postRevisionQuality;
};

// ── WRAP handleChoiceClick TO ADD V5 BEHAVIOUR ───────────────
// The existing delegated listener calls handleChoiceClick.
// We intercept at the document level BEFORE it fires (capture phase).
document.addEventListener('click', function(e) {
  var el = e.target.closest('.choice[data-type]');
  if (!el) return;
  var type   = el.dataset.type;
  var nodeId = el.dataset.node;
  if (!type || !nodeId) return;

  var nc = nodeId.replace(/_/g,'');
  var isRetest = nodeId.startsWith('rt');
  var isRevision = !!(isRetest
    ? v5State.retestFirstChoices[nodeId]
    : v5State.firstChoices[nodeId]);

  // Stealth timing
  var lat = 9999;
  if (v5State.nodeOpenedAt[nodeId]) {
    lat = Date.now() - v5State.nodeOpenedAt[nodeId];
    v5State.responseLatency[nodeId] = lat;
    if (lat < 4000) v5State.rapidClickCount++;
  }

  // Freeze first choice
  if (isRetest) {
    if (!v5State.retestFirstChoices[nodeId]) v5State.retestFirstChoices[nodeId] = type;
  } else {
    if (!v5State.firstChoices[nodeId]) {
      v5State.firstChoices[nodeId] = type;
    } else if (!isRevision) {
      // Shouldn't happen but guard
    } else {
      // This is a revision
      var prev = v5State.firstChoices[nodeId];
      v5State.revisions[nodeId] = {from: prev, to: type, ts: Date.now()};
      if (prev !== 'expert' && type === 'expert') {
        if (v5State.selfCorrected.indexOf(nodeId) < 0) v5State.selfCorrected.push(nodeId);
      }
    }
  }

  // Show formative panel after short delay (let v4 render outcome first)
  setTimeout(function() { v5ShowFormative(nc, type); }, 200);

  // Branch consequences
  setTimeout(function() { v5ShowConsequence(nodeId, type); }, 400);

  // Vital sign reactivity
  setTimeout(function() { v5VitalReact(nodeId, type); }, 600);

  // Goldilocks scaffolding check for next panels
  setTimeout(function() { v5CheckGoldilocks(); }, 300);

  // Check retest trigger
  setTimeout(function() { v5CheckRetest(); }, 500);

  // Reveal consequence card if this is a parent node
  setTimeout(function() { v5RevealConsequence(nodeId); }, 150);

  // Show quick-nav shortcut after choice — delayed so ARIA can open first
  setTimeout(function() {
    // Don't show if ARIA is currently open (user is in conversation)
    var ariaPanel = document.getElementById('aria-panel');
    if (ariaPanel && ariaPanel.classList.contains('ao')) return;
    v5ShowQuickNav(nodeId);
  }, 2500);

}, true); // capture phase — runs before v4's bubble phase listener

// ── BRANCH CONSEQUENCES ───────────────────────────────────────
var BC_DATA = {
  s1a: { gap: {body:`Mr. Osei receives sublingual nitroglycerin. Within 90 seconds his BP drops from 92/58 to <strong>74/42</strong>. Cardiogenic arrest is called. Cath lab activation is delayed by 8 minutes during resuscitation. Approximately 15 million additional cardiomyocytes are lost.`, items:[['BP at 2 min','74/42'],['Outcome','Cardiac arrest'],['Cath lab delay','+8 min']]}},
  s2a: { gap: {body:`Labetalol is given. BP drops from 186/104 to 148/88. The penumbra, receiving marginal collateral perfusion, is now completely ischaemic. NIHSS worsens from 14 to <strong>19</strong>. The treatable tissue window has narrowed significantly.`, items:[['BP post-treatment','148/88'],['NIHSS change','14 → 19'],['Penumbra','Converted']]}},
  s3a: { gap: {body:`Antibiotics are started before blood cultures. At 48 hours the microbiology lab reports: <strong>no growth — cultures sterilised by antibiotics</strong>. The team cannot de-escalate. Mr. Al-Fayed receives 14 days broad-spectrum antibiotics and develops <em>C. difficile</em> colitis on Day 10.`, items:[['Culture result','No growth'],['De-escalation','Not possible'],['Complication','C. diff Day 10']]}},
  s1b2: { gap: {body:`tPA is administered. Within 4 hours Mr. Osei passes 600mL bright red blood PR. Emergency GI consultation. He requires transfusion of 4 units PRBCs. Hospital stay extended by 12 days.`, items:[['GI bleed','600mL at 4hr'],['Transfusion','4 units PRBC'],['Stay extension','+12 days']]}},
  s3b: { gap: {body:`Antibiotics are delayed 47 minutes past the 1-hour bundle target. Mr. Al-Fayed's MAP drops further to <strong>49</strong>. Norepinephrine is required. Lactate rises from 3.1 to 4.8. ICU transfer is required.`, items:[['MAP at 47 min','49'],['Lactate','3.1 → 4.8'],['Vasopressors','Required']]}}
};

function v5ShowConsequence(nodeId, type) {
  if (type !== 'gap') return;
  var nc = nodeId.replace(/_/g,'');
  var bc = document.getElementById('bc-' + nc);
  if (!bc) return;
  var d = BC_DATA[nc];
  if (!d || !d.gap) return;
  var g = d.gap;
  var itemsHtml = '';
  (g.items||[]).forEach(function(item) {
    itemsHtml += `<div class="bc-item"><div class="bc-item-lbl">` + item[0] + `</div><div class="bc-item-val">` + item[1] + `</div></div>`;
  });
  bc.querySelector('.bc-body').innerHTML = g.body + (itemsHtml ? `<div class="bc-grid">` + itemsHtml + `</div>` : '');
  bc.classList.add('bvis');
  setTimeout(function() { if (bc.closest('.panel.active')) bc.scrollIntoView({behavior:'smooth',block:'nearest'}); }, 300);
}

// ── VITAL SIGN REACTIVITY ─────────────────────────────────────
var VITAL_REACT = {
  s1a: { gap:  {vals:{BP:'74/42', HR:'141'}, msg:'BP CRITICAL DROP after NTG in hypotensive patient'}},
  s2a: { gap:  {vals:{NIHSS:'19'}, msg:'NIHSS worsening — penumbra converting'}},
  s3a: { gap:  {vals:{MAP:'62', Lactate:'3.4'}, msg:'MAP falling — sepsis progressing'}},
  s3b: { gap:  {vals:{MAP:'49', Lactate:'4.8'}, msg:'MAP CRITICAL — vasopressors required'}}
};

function v5VitalReact(nodeId, type) {
  var nc = nodeId.replace(/_/g,'');
  var react = VITAL_REACT[nc];
  if (!react || !react[type]) return;
  var r = react[type];
  var panel = document.getElementById('panel-' + (nodeId.split('_')[0] || nodeId));
  var monitor = panel ? panel.querySelector('.monitor-wrap') : null;
  if (!monitor) return;
  monitor.querySelectorAll('.vital-box').forEach(function(box) {
    box.classList.add('vreact');
    setTimeout(function() { box.classList.remove('vreact'); }, 1600);
  });
  // Update alarm banner
  var banner = monitor.querySelector('.alarm-banner') || monitor.querySelector('.alarm-text');
  if (banner) {
    var inner = banner.querySelector('.alarm-text') || banner;
    inner.textContent = 'CONSEQUENCE: ' + r.msg;
  }
}

// ── GOLDILOCKS ADAPTIVE SCAFFOLDING ──────────────────────────
var GL_SCAFFOLDS = {
  s1b:{triggerIf:'s1b_1',triggerType:'gap',hint:`Before deciding — you have already named the contraindication once. The next question is what you do when expert authority dismisses a correct safety concern. "Protocol requires" depersonalises the challenge and makes it institutional rather than interpersonal.`},
  s2b:{triggerIf:'s2a',triggerType:'gap',hint:`Recall: Mrs. Reyes is aphasic and lacks capacity. Her husband is present. Under common law necessity doctrine, next-of-kin can provide substitute decision-maker consent in emergencies. This is standard practice, not an exception.`},
  s3b:{triggerIf:'s3a',triggerType:'gap',hint:`The SSC Hour-1 Bundle is a named, published guideline. "Surviving Sepsis Campaign Hour-1 Bundle requires empiric antibiotics within one hour of sepsis recognition" is the citation that carries institutional authority when a pharmacist disagrees.`},
  s2c:{triggerIf:'s1c',triggerType:'gap',hint:`Phone interpreter services are available 24/7. JCAHO requires qualified interpretation for clinical discussions — this is not optional. The barrier is usually not availability; it is knowing the access number.`}
};

function v5CheckGoldilocks() {
  var fc = v5State.firstChoices;
  Object.keys(GL_SCAFFOLDS).forEach(function(panelBase) {
    var s = GL_SCAFFOLDS[panelBase];
    if (fc[s.triggerIf] === s.triggerType) {
      // Show hint in the target panel if it hasn't been shown yet
      var panel = document.getElementById('panel-' + panelBase);
      if (!panel) return;
      if (panel.querySelector('.gl-hint')) return; // already shown
      var firstDec = panel.querySelector('.decision');
      if (!firstDec) return;
      var hint = document.createElement('div');
      hint.className = 'gl-hint glvis';
      hint.innerHTML = `<div class="gl-lbl">GOLDILOCKS · Adaptive Context</div><div class="gl-txt">` + s.hint + `</div>`;
      firstDec.parentNode.insertBefore(hint, firstDec);
    }
  });
}

// ── RETEST TRIGGER ────────────────────────────────────────────
var _retestShown = false;
function v5CheckRetest() {
  if (_retestShown) return;
  var fc = v5State.firstChoices;
  var needed = ['s3a','s3b','s3c','s3c2'];
  var done = needed.every(function(k) { return !!fc[k]; });
  if (!done) return;
  _retestShown = true;

  // Add sidebar item
  var sb = document.querySelector('.sidebar');
  if (sb && !document.getElementById('sb-s4')) {
    var item = document.createElement('div');
    item.id = 'sb-s4';
    item.className = 'sb-item';
    item.innerHTML = `<div class="sb-dot" style="background:var(--orange);animation:pulse 2s infinite"></div><div><div class="sb-label" style="color:var(--orange)">One More Patient</div><div class="sb-sub">Unscheduled · End of Shift</div></div>`;
    item.onclick = function() { go('s4'); };
    sb.appendChild(item);
  }

  // Change s3c next button
  var s3c_panel = document.getElementById('panel-s3c');
  if (s3c_panel) {
    var nextBtn = s3c_panel.querySelector('.btn-next');
    if (nextBtn && !nextBtn.dataset.retestPatched) {
      nextBtn.dataset.retestPatched = '1';
      nextBtn.textContent = 'One More Patient Before Handover →';
      nextBtn.style.background = 'var(--orange)';
      nextBtn.style.borderColor = 'var(--orange)';
      nextBtn.onclick = function() { go('s4'); };
    }
  }
}

// ── NWI RECOMPUTE (v5 uses firstChoices not choices) ──────────
// Wrap computeNWI to use firstChoices when available
var _v4NWI = computeNWI;
computeNWI = function() {
  // Priority chain — NEVER fall back to S.choices (which includes revisions)
  // 1. v5State.firstChoices (in-memory, set from S on load)
  // 2. S.firstChoices (localStorage, original choices only)
  // 3. null — no data yet
  var fc = (Object.keys(v5State.firstChoices||{}).length)
    ? v5State.firstChoices
    : (Object.keys(S.firstChoices||{}).length ? S.firstChoices : null);
  if (!fc || !Object.keys(fc).length) return null;
  var keys   = Object.keys(fc);
  var expert = keys.filter(function(k) { return fc[k]==='expert'; }).length;
  return Math.round(expert / keys.length * 100);
};

// ── PERSONA ENHANCEMENTS ──────────────────────────────────────
// Wrap renderPersona to inject narrative + v5 sections
var _v4RenderPersona = renderPersona;
renderPersona = function() {
  _v4RenderPersona();
  // Update COGNITA stealth panel in persona
  setTimeout(v5RenderStealthPanel, 120);
  v5EnhancePersona();
  v5ShowBadge();
};

function v5EnhancePersona() {
  var container = document.getElementById('persona-content');
  if (!container) return;

  var _v5ep = (typeof v5State !== "undefined" && v5State) || window.v5State || {};
  var fc = _v5ep.firstChoices || {};
  var total = Object.keys(fc).length;
  if (!total) return;

  var nwi = computeNWI();
  var expert = Object.values(fc).filter(function(c){return c==='expert';}).length;
  var gaps   = Object.values(fc).filter(function(c){return c==='gap';}).length;
  var revCnt = Object.keys(_v5ep.revisions).length;
  var selfCorr = _v5ep.selfCorrected.length;

  // Compute domains (v4's computeDoms but using firstChoices)
  var dom = computeDoms ? computeDoms({choices: fc}) : {};

  // Top/bottom domains
  var DOMS_ORDER = ['D1','D2','D3','D4','D5','D6','D7','D8','D9','D11','D12'];
  var DL_MAP = {D1:'Ambiguity',D2:'Therapeutic Comm',D3:'Ethics',D4:'Psych Safety',D5:'Deterioration',D6:'Pharmacology',D7:'SBAR',D8:'Prioritisation',D9:'Cultural Humility',D11:'Social Complexity',D12:'Moral Resilience'};
  var ranked = DOMS_ORDER
    .map(function(d) { return {d:d, v:dom[d]||0}; })
    .filter(function(x){ return x.v>0; })
    .sort(function(a,b){return b.v-a.v;});
  var topDom  = ranked[0]  ? DL_MAP[ranked[0].d]  : null;
  var botDom  = ranked[ranked.length-1] ? DL_MAP[ranked[ranked.length-1].d] : null;

  var stageAdj = nwi>=80?'proficient-to-expert':nwi>=60?'competent-to-proficient':'advanced beginner';

  // Narrative paragraph
  var narrative = (topDom
    ? `This nurse presents at ` + stageAdj + ` stage with ` + expert + ` expert-pattern responses across ` + total + ` decision nodes (NWI ` + nwi + `%). Strongest demonstrated competency is in ` + topDom + `.`
    : `This nurse presents at ` + stageAdj + ` stage with NWI ` + nwi + `%.`)
    + (gaps > 0 ? ` ` + gaps + ` gap signal` + (gaps>1?'s':'')+` flagged.` : ` No critical gaps detected.`)
    + (selfCorr > 0 ? ` ` + selfCorr + ` self-correction` + (selfCorr>1?'s':'')+` from gap to expert — positive metacognitive indicator.` : '');

  // Strength meaning lookup
  var STR_MEANING = {
    'Psych Safety':`You challenge unsafe authority and advocate for patients under social pressure — the top differentiator between adequate and expert nurses in high-stakes situations.`,
    'Deterioration':`You consistently recognise clinical deterioration early and initiate parallel responses — the single most protective nursing behaviour in emergency settings.`,
    'SBAR':`Your handoff communication is structured and complete. Physicians get what they need to make fast decisions.`,
    'Pharmacology':`Your pharmacology safety instincts are strong. Contraindication recognition at point of administration is a rare and high-value skill.`,
    'Therapeutic Comm':`Your crisis and grief communication is expert-level — families cooperate with care when nurses communicate this way.`,
    'Cultural Humility':`Language access and cultural humility are integrated into your practice, directly reducing readmission and harm.`,
    'Ethics':`You navigate ethical ambiguity with accuracy — DNR integrity, consent frameworks, and advocacy all at expert level.`,
    'Ambiguity':`You manage multiple competing demands without defaulting to sequential thinking — a key marker of ICU and ER readiness.`,
    'Prioritisation':`Your prioritisation under pressure is reliable. The right patient gets the right attention at the right time.`,
    'Social Complexity':`You see structural barriers and respond to them — interpreter access, discharge equity, and dignity restoration.`,
    'Moral Resilience':`Your post-incident processing pattern shows integration rather than suppression — the resilience architecture for a long career.`
  };

  // Development steps
  var DEV_STEPS = {
    'Psych Safety':`Practise the two-challenge protocol as a scripted phrase: "Protocol requires [specific requirement] before I can proceed." Rehearsal removes hesitation in the moment.`,
    'Deterioration':`Review qSOFA and SOFA scoring tools until they are automatic. Having the criteria memorised removes the cognitive burden of uncertainty at 0340.`,
    'Pharmacology':`Build a personal contraindication checklist for high-risk drugs: thrombolytics, anticoagulants, vasoactives. A 30-second structured check before administration catches what memory misses.`,
    'SBAR':`After every escalation call, review: did you give S, B, A, and R? The R (Recommendation) is what gets the order. Without it you get a question back.`,
    'Therapeutic Comm':`Practise: acknowledge emotion before providing clinical information. "I can see this is frightening" before "here is what we are doing" changes the entire dynamic.`,
    'Cultural Humility':`Locate the phone interpreter access number in your unit tonight. The barrier to qualified interpretation is usually not availability — it is not knowing how to access it quickly.`,
    'Ethics':`DNR and consent situations clarify with one principle: what did the patient choose when they had capacity? That is the anchor.`,
    'Ambiguity':`In multi-patient situations, practise saying the options out loud before choosing. Externalising the decision slows the process enough to catch errors.`,
    'Prioritisation':`Practise identifying your highest-acuity patient before touching a chart. The habit of "who needs me first?" is the foundation of safe prioritisation.`,
    'Social Complexity':`Language access is a patient safety issue, not administrative. Every time you use a qualified interpreter for a clinical conversation, you are preventing a potential adverse event.`,
    'Moral Resilience':`After difficult shifts, identify one thing you would do the same and one differently. Two minutes. That is the debrief habit that prevents moral injury.`
  };

  var strMeaning = topDom ? (STR_MEANING[topDom] || '') : '';
  var devStep    = botDom ? (DEV_STEPS[botDom] || `Review the formative feedback for nodes in this domain.`) : '';

  // Continuum recommendation
  var recIcon, recLabel, recText;
  if (nwi >= 80 && gaps === 0) {
    recIcon='🏆'; recLabel=`CONTINUUM · Pathway Complete`;
    recText=`Outstanding performance. Recommend progression to advanced-complexity scenarios or preceptor role pathway.`;
  } else if (nwi >= 60 && gaps <= 2) {
    recIcon='📈'; recLabel=`CONTINUUM · Recommended Next`;
    recText=`Complete a second assessment cycle in 30 days targeting identified gap domains. Consider supervised practice before reassessment.`;
  } else {
    recIcon='🎯'; recLabel=`CONTINUUM · Development Plan`;
    recText=`Recommend preceptor review of gap-flagged nodes before independent practice. Reassessment after targeted practice in 2 to 4 weeks.`;
  }

  var rt1 = _v5ep.retestFirstChoices['rt1'];
  var retestHtml = rt1
    ? `<div style="margin-top:10px;padding:10px 14px;background:rgba(0,200,150,.06);border:1px solid rgba(0,200,150,.15);border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--txt3)">RETEST (Unannounced) · RT-01: <span style="color:var(--teal-d);font-weight:700">` + rt1 + `</span></div>`
    : '';

  var metacogHtml = revCnt > 0
    ? `<div style="margin-top:10px;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--txt3)">Revisions: <strong style="color:var(--navy)">`+revCnt+`</strong> &nbsp;·&nbsp; Self-corrections (gap→expert): <strong style="color:var(--teal-d)">`+selfCorr+`</strong></div>`
    : '';

  var rapid = v5State.rapidClickCount >= 4
    ? `<div style="margin-top:8px;padding:8px 12px;background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.15);border-radius:6px;font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--crimson)">Velocity flag: ${v5State.rapidClickCount} choices made in under 4 seconds. Results should be reviewed in a supervised context.</div>`
    : '';

  var narrativeCard = `
<div class="pn-card">
  <div class="pn-lbl">PERSONA NARRATIVE · AUTO-GENERATED</div>
  <div class="pn-txt">` + narrative + `</div>
  ` + (topDom && strMeaning ? `<div class="pn-str"><div class="pn-sec-lbl">✦ Strength: ` + topDom + `</div><div class="pn-sec-txt">` + strMeaning + `</div></div>` : '') + `
  ` + (botDom && devStep && botDom !== topDom ? `<div class="pn-dev"><div class="pn-sec-lbl">↗ Development: ` + botDom + `</div><div class="pn-sec-txt">` + devStep + `</div></div>` : '') + `
  <div class="cr-rec"><div class="cr-icon">` + recIcon + `</div><div><div class="cr-lbl">` + recLabel + `</div><div class="cr-txt">` + recText + `</div></div></div>
  ` + retestHtml + metacogHtml + rapid + `
</div>`;

  container.insertAdjacentHTML('beforeend', narrativeCard);

  // Restore reflection journal
  var ta = document.getElementById('rfl-journal');
  if (ta && S.reflection) ta.value = S.reflection;
}

function v5ShowBadge() {
  var badge = document.getElementById('cb-badge');
  if (!badge) return;
  var nwi = computeNWI();
  if (nwi === null) return;
  badge.classList.add('cbvis');
  var nwiEl = document.getElementById('cb-nwi');
  var detEl = document.getElementById('cb-det');
  if (nwiEl) nwiEl.textContent = nwi + '%';
  if (detEl) {
    var fc = v5State.firstChoices;
    var t = Object.keys(fc).length;
    var e = Object.values(fc).filter(function(c){return c==='expert';}).length;
    var g = Object.values(fc).filter(function(c){return c==='gap';}).length;
    detEl.textContent = e + ' expert · ' + g + ' gap · ' + t + ' decisions · ' + Object.keys(v5State.revisions).length + ' revisions';
  }
}

function v5SaveReflection() {
  var ta = document.getElementById('rfl-journal');
  if (!ta) return;
  S.reflection = ta.value;
  saveCurr();
  toast('Reflection saved ✓','t-ok');
}

// ── LUMINA ENHANCEMENTS ───────────────────────────────────────
// Wrap renderDash
var _v4RenderDash = renderDash;
renderDash = function() {
  _v4RenderDash();
  v5RenderTrend();
  v5RenderHeatmap();
};

function v5RenderTrend() {
  var wrap = document.getElementById('trend-wrap');
  if (!wrap) return;
  var sessions = [];
  try { sessions = JSON.parse(localStorage.getItem('aiwizn_sessions')||'[]'); } catch(e) {}
  if (sessions.length < 2) {
    wrap.innerHTML = `<span style="font-family:monospace;font-size:10px;color:var(--txt3);padding:8px">Complete more sessions to see NWI trend.</span>`;
    return;
  }
  var pts = sessions.slice(-8).map(function(ss,i) {
    var fc = ss.firstChoices || ss.choices || {};
    var t = Object.keys(fc).length;
    var e = Object.values(fc).filter(function(c){return c==='expert';}).length;
    return {nwi: t>0 ? Math.round(e/t*100) : 0, date: new Date(ss.start).toLocaleDateString('en',{month:'short',day:'numeric'})};
  });
  var max = Math.max.apply(null, pts.map(function(p){return p.nwi;}).concat([100]));
  wrap.innerHTML = pts.map(function(p) {
    var h = Math.round(p.nwi/max*60)+4;
    var col = p.nwi>=75?'var(--teal)':p.nwi>=55?'var(--amber)':'var(--crimson)';
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">`
      + `<span style="font-family:monospace;font-size:9px;color:` + col + `;font-weight:700">` + p.nwi + `%</span>`
      + `<div class="trend-bar" style="width:100%;height:` + h + `px;background:` + col + `"></div>`
      + `<span class="trend-lbl">` + p.date + `</span></div>`;
  }).join('');
}

function v5RenderHeatmap() {
  var grid = document.getElementById('hm-grid');
  if (!grid) return;
  var sessions = [];
  try { sessions = JSON.parse(localStorage.getItem('aiwizn_sessions')||'[]'); } catch(e) {}
  if (!sessions.length) { grid.innerHTML=''; return; }
  var NODE_NAMES = {s1a:'STEMI',s1b_1:'tPA Ch.1',s1b_2:'tPA Ch.2',s1c:'DNR Ethics',s2a:'FAST/BP',s2b:'tPA Consent',s2c:'Language',s3a:'Sepsis Rec.',s3b:'Bundle',s3c:'Shock/ICU'};
  var totals={}, gaps={};
  sessions.forEach(function(ss) {
    var fc = ss.firstChoices||ss.firstChoices||ss.choices||{};
    Object.entries(fc).forEach(function(e) {
      totals[e[0]] = (totals[e[0]]||0)+1;
      if (e[1]==='gap') gaps[e[0]] = (gaps[e[0]]||0)+1;
    });
  });
  var sorted = Object.keys(NODE_NAMES)
    .map(function(k){return {k:k, rate: totals[k]>0 ? Math.round((gaps[k]||0)/totals[k]*100) : 0};})
    .sort(function(a,b){return b.rate-a.rate;})
    .slice(0,10);
  grid.innerHTML = sorted.map(function(x) {
    var bg = x.rate>=50?'var(--crimson)':x.rate>=30?'#B45309':'var(--teal-d)';
    return `<div class="hm-cell" style="background:` + bg + `"><div class="hm-lbl">` + (NODE_NAMES[x.k]||x.k) + `</div><div class="hm-val">` + x.rate + `%</div><div class="hm-sub">gap rate</div></div>`;
  }).join('');
}

function v5ExportCSV() {
  var sessions = [];
  try { sessions = JSON.parse(localStorage.getItem('aiwizn_sessions')||'[]'); } catch(e) {}
  if (!sessions.length) { toast('No sessions to export','t-warn'); return; }
  var nodeKeys = Object.keys({s1a:1,s1a2:1,s1b_1:1,s1b_2:1,s1c:1,s2a:1,s2a2:1,s2b:1,s2c:1,s3a:1,s3b:1,s3c:1,s3c2:1});
  var header = ['Session','Nurse','Unit','Date','NWI'].concat(nodeKeys.map(function(k){return k+'_first';})).join(',');
  var rows = sessions.map(function(ss) {
    var fc = ss.firstChoices||ss.firstChoices||ss.choices||{};
    var t=Object.keys(fc).length, e=Object.values(fc).filter(function(c){return c==='expert';}).length;
    var nwi = t>0?Math.round(e/t*100):0;
    return [ss.id, '"'+(ss.nurse||'')+'"', '"'+(ss.unit||'')+'"', new Date(ss.start).toLocaleDateString(), nwi]
      .concat(nodeKeys.map(function(k){return fc[k]||'';})).join(',');
  });
  var csv = [header].concat(rows).join('\n');
  var blob = new Blob([csv],{type:'text/csv'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href=url; a.download='aiwizn-export.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('CSV exported ✓','t-ok');
}

function v5ExportJSON() {
  var sessions = [];
  try { sessions = JSON.parse(localStorage.getItem('aiwizn_sessions')||'[]'); } catch(e) {}
  if (!sessions.length) { toast('No sessions to export','t-warn'); return; }
  var blob = new Blob([JSON.stringify(sessions,null,2)],{type:'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href=url; a.download='aiwizn-sessions.json'; a.click();
  URL.revokeObjectURL(url);
  toast('JSON exported ✓','t-ok');
}

// ── MARK NODE OPEN TIME ───────────────────────────────────────
// Wrap go() to track when each panel is opened (for latency timing)
var _v4GoForV5 = go;
go = function(name) {
  _v4GoForV5(name);
  // Mark primary node as opened now
  if (name !== 'overview' && name !== 'persona' && name !== 'dashboard') {
    v5State.nodeOpenedAt[name] = Date.now();
    // Mark consequence nodes too
    var conseq = {s1a:'s1a2', s2a:'s2a2', s3c:'s3c2'};
    if (conseq[name]) v5State.nodeOpenedAt[conseq[name]] = Date.now();
  }
  // Retest nav override for persona
  if (name === 'persona') {
    setTimeout(v5ShowBadge, 200);
    v5EnhancePersona();
  }
};

// ── STARTSSESSION PATCH ───────────────────────────────────────
var _v4StartSession = startSession;
startSession = function() {
  _v4StartSession();
  // Reset v5 state
  v5State = {firstChoices:{}, revisions:{}, selfCorrected:[], responseLatency:{}, nodeOpenedAt:{}, rapidClickCount:0, retestFirstChoices:{}};
  _retestShown = false;
  // Clear formative panels and branch consequences
  document.querySelectorAll('.fp').forEach(function(el) { el.classList.remove('fvis'); el.style.display=''; el.style.opacity=''; });
  document.querySelectorAll('.bc').forEach(function(el) { el.classList.remove('bvis'); });
  document.querySelectorAll('.gl-hint').forEach(function(el) { el.parentNode && el.parentNode.removeChild(el); });
  // Remove retest sidebar item if present
  var sb4 = document.getElementById('sb-s4');
  if (sb4) sb4.parentNode.removeChild(sb4);

  // Reset all stateful variables that persist between sessions
  _ariaExpertFired  = false;
  _ariaFirstChoices = {};

  // Clear ARIA panel contents
  var _arMsgs = document.getElementById('aria-msgs');
  var _arOpts = document.getElementById('aria-opts');
  var _arBtn  = document.getElementById('aria-btn');
  var _arPanel= document.getElementById('aria-panel');
  if (_arMsgs)  _arMsgs.innerHTML = '';
  if (_arOpts)  _arOpts.innerHTML = '';
  if (_arBtn)   _arBtn.classList.add('ah');      // re-hide brain button
  if (_arPanel) _arPanel.classList.remove('ao'); // close panel

  // Reset continuum dots to locked state
  for (var _di = 0; _di <= 4; _di++) {
    var _dot = document.getElementById('ct-dot-' + _di);
    if (_dot) _dot.className = 'ct-dot ct-locked';
  }
  var _ctNext = document.getElementById('ct-next');
  if (_ctNext) _ctNext.innerHTML = '<span>NEXT → </span>Begin Scenario 1 (Cardiac)';

  // Hide completion badge
  var _badge = document.getElementById('cb-badge');
  if (_badge) { _badge.classList.remove('cbvis'); _badge.style.display = ''; }

  // Clear reflection textarea
  var _rfl = document.getElementById('rfl-journal');
  if (_rfl) _rfl.value = '';

  // Reset consequence cards to hidden
  document.querySelectorAll('.consequence-card').forEach(function(el) {
    el.classList.remove('revealed');
  });
  // Remove quick-nav elements
  document.querySelectorAll('.quick-nav').forEach(function(el) { el.remove(); });

  // Remove any COGNITA extended panels from previous session
  var _cv2 = document.getElementById('cognita-v2-panel');
  var _cv1 = document.getElementById('cognita-stealth-panel');
  if (_cv2) _cv2.remove();
  if (_cv1) _cv1.remove();
  toast('V5 session started','t-ok');
};

/* END V5 FEATURE LAYER */



/* ═══════════════════════════════════════════════════════
   COGNITA EXTENDED — Additional stealth signals
   Grafted cleanly; no changes to existing functions.
═══════════════════════════════════════════════════════ */

// ── BACKTRACK COUNT ────────────────────────────────────────────
// Wrap go() once more to count backtracks.
// A backtrack = navigating to a panel that already has a first choice recorded.
(function() {
  var _goForBacktrack = go;
  go = function(name) {
    var fc = v5State.firstChoices || {};
    var mainPanels = ['s1a','s1b','s1c','s2a','s2b','s2c','s3a','s3b','s3c'];
    if (mainPanels.indexOf(name) >= 0 && fc[name] && name !== window._curPanel) {
      v5State.backtrackCount = (v5State.backtrackCount || 0) + 1;
    }
    window._curPanel = name;
    _goForBacktrack(name);
    setTimeout(injectLengthNotices, 150);
  };
})();

// ── HOVER DWELL TIME ───────────────────────────────────────────
// Tracks ms spent hovering each option before choosing.
// Stored in v5State.hoverTimes[nodeId][type] = total ms hovered.
// High hover on gap option before choosing expert = deliberate rejection signal.
// High hover on expert before choosing gap = possible anchoring effect.
(function() {
  var _hoverStart = {};

  document.addEventListener('mouseover', function(e) {
    var el = e.target.closest('.choice[data-type]');
    if (!el) return;
    var key = (el.dataset.node || '') + '_' + (el.dataset.type || '');
    _hoverStart[key] = Date.now();
  }, {passive: true});

  document.addEventListener('mouseout', function(e) {
    var el = e.target.closest('.choice[data-type]');
    if (!el) return;
    var node = el.dataset.node || '';
    var type = el.dataset.type || '';
    var key = node + '_' + type;
    if (!_hoverStart[key]) return;
    var dwell = Date.now() - _hoverStart[key];
    delete _hoverStart[key];
    if (!v5State.hoverTimes) v5State.hoverTimes = {};
    if (!v5State.hoverTimes[node]) v5State.hoverTimes[node] = {};
    v5State.hoverTimes[node][type] = (v5State.hoverTimes[node][type] || 0) + dwell;
  }, {passive: true});
})();

// ── SCROLL DEPTH PER PANEL ─────────────────────────────────────
// Tracks how far down each panel the user scrolls before making a choice.
// Low scroll depth + gap choice = possible rapid choice without reading.
// Stored in v5State.scrollDepths[panelName] = max % scrolled (0–100).
(function() {
  var _lastPanel = null;

  window.addEventListener('scroll', function() {
    var curName = window._curPanel;
    if (!curName || curName === 'overview' || curName === 'dashboard' || curName === 'persona') return;
    var panel = document.getElementById('panel-' + curName);
    if (!panel) return;
    var scrollPct = Math.min(100, Math.round(
      window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight) * 100
    ));
    if (!v5State.scrollDepths) v5State.scrollDepths = {};
    v5State.scrollDepths[curName] = Math.max(v5State.scrollDepths[curName] || 0, scrollPct);
  }, {passive: true});
})();

// ── CONFIRMATION BIAS PROBE ────────────────────────────────────
// If a user makes a gap choice, reads the consequence/formative feedback,
// then revises to expert — this is high-quality self-correction.
// If they make a gap choice and do NOT revise after seeing feedback — noted.
// We track: did_see_formative[nodeId] = true when formative panel is shown.
// If did_see_formative[nodeId] && firstChoices[nodeId]=gap && choices[nodeId]=gap
// → confirmed gap (saw evidence, did not revise)
// Stored as v5State.confirmedGaps[] after each choice dismissal.
(function() {
  var _sawFormative = {};

  // Intercept v5Dismiss to note when formative was viewed
  var _origDismiss = window.v5Dismiss;
  if (typeof _origDismiss === 'function') {
    window.v5Dismiss = function(nc) {
      _sawFormative[nc] = true;
      // If first choice was gap and current choice is still gap = confirmed gap
      var nodeId = nc; // nc has underscores stripped
      var fc = v5State.firstChoices || {};
      // Find matching key (nc might be s1b2 but key is s1b_2)
      var matchKey = Object.keys(fc).find(function(k) { return k.replace(/_/g,'') === nc; });
      if (matchKey && fc[matchKey] === 'gap') {
        if (!v5State.confirmedGaps) v5State.confirmedGaps = [];
        if (v5State.confirmedGaps.indexOf(matchKey) < 0) {
          v5State.confirmedGaps.push(matchKey);
        }
      }
      _origDismiss(nc);
    };
  }
})();

// ── ANCHORING PROBE ────────────────────────────────────────────
// Choices are shuffled randomly (anti-position bias).
// We record which position (A/B/C/D) was chosen on each node.
// If a nurse consistently picks the first-listed option across many nodes,
// that is an anchoring signal — they are not reading all options.
// Stored in v5State.positionChoices[nodeId] = 'A'|'B'|'C'|'D'
(function() {
  document.addEventListener('click', function(e) {
    var el = e.target.closest('.choice[data-type]');
    if (!el) return;
    var nodeId = el.dataset.node;
    if (!nodeId) return;
    // Already chose this node (revision) — skip
    if ((v5State.firstChoices || {})[nodeId]) return;
    var idEl = el.querySelector('.choice-id');
    if (!idEl) return;
    var pos = idEl.textContent.trim();
    if (!v5State.positionChoices) v5State.positionChoices = {};
    v5State.positionChoices[nodeId] = pos;
  }, true); // capture phase
})();

// ── STEALTH PROFILE RENDERER (dashboard) ──────────────────────
// Adds a COGNITA stealth panel to the dashboard.
// This shows on every renderDash call.
function v5RenderStealthPanel() {
  var _v5s = (typeof v5State !== 'undefined' && v5State) || window.v5State || {};
  var existing = document.getElementById('cognita-stealth-panel');
  if (existing) existing.remove();

  var fc = _v5s.firstChoices || {};
  var total = Object.keys(fc).length;
  if (total < 3) return; // not enough data yet

  var lats = Object.values(_v5s.responseLatency || {});
  var avgLat = lats.length ? Math.round(lats.reduce(function(a,b){return a+b;},0)/lats.length/1000) : 0;
  var rapid = _v5s.rapidClickCount || 0;
  var rapidRate = total > 0 ? Math.round(rapid/total*100) : 0;
  var selfCorr = (_v5s.selfCorrected||[]).length;
  var revCount = Object.keys(_v5s.revisions||{}).length;
  var backtrack = _v5s.backtrackCount || 0;
  var ariaEngage = (S.ariaLog||[]).length;
  var confirmedGaps = (_v5s.confirmedGaps||[]).length;

  // Position choices — check for anchoring (always picking A)
  var posCh = _v5s.positionChoices || {};
  var posKeys = Object.keys(posCh);
  var aCount = posKeys.filter(function(k){return posCh[k]==='A';}).length;
  var anchorRate = posKeys.length > 0 ? Math.round(aCount/posKeys.length*100) : 0;

  var velCol  = avgLat >= 15 ? 'var(--teal)' : avgLat >= 6 ? 'var(--amber)' : 'var(--crimson)';
  var rapCol  = rapidRate < 20 ? 'var(--teal)' : rapidRate < 40 ? 'var(--amber)' : 'var(--crimson)';
  var corCol  = selfCorr > 0 ? 'var(--teal)' : 'var(--txt3)';
  var ancCol  = anchorRate > 50 ? 'var(--crimson)' : anchorRate > 30 ? 'var(--amber)' : 'var(--teal)';

  var velFlag  = avgLat < 5  ? '<div style="margin-top:6px;padding:6px 10px;background:rgba(220,38,38,.1);border-radius:6px;font-size:9px;color:var(--crimson)">VELOCITY FLAG: Average decision time under 5 seconds. Results should be reviewed with context.</div>' : '';
  var ancFlag  = anchorRate > 50 ? '<div style="margin-top:4px;padding:6px 10px;background:rgba(245,158,11,.1);border-radius:6px;font-size:9px;color:#B45309">ANCHORING SIGNAL: First-listed option chosen in ' + anchorRate + '% of nodes. Post-shuffle position may be influencing choices.</div>' : '';

  var panel = document.createElement('div');
  panel.id = 'cognita-stealth-panel';
  panel.style.cssText = 'background:var(--navy);border-radius:12px;padding:18px 20px;margin-top:16px;border:1px solid rgba(0,200,150,.2)';
  panel.innerHTML = '<div style="font-family:\'JetBrains Mono\',monospace;font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--teal);margin-bottom:14px">COGNITA · Stealth Psychometric Indicators</div>'
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">'
    + _stealthCell('Avg Decision', avgLat + 's', velCol, 'benchmark: 15s+')
    + _stealthCell('Rapid Clicks', rapidRate + '%', rapCol, rapid + ' under 4s')
    + _stealthCell('Self-Correct', selfCorr, corCol, 'gap to expert')
    + _stealthCell('Revisions', revCount, 'var(--teal)', 'total')
    + _stealthCell('Backtracks', backtrack, 'var(--cyan,#0BBCD4)', 'panel revisits')
    + _stealthCell('ARIA Engage', ariaEngage, 'var(--teal)', 'interactions')
    + _stealthCell('Confirmed Gaps', confirmedGaps, confirmedGaps>2?'var(--crimson)':'var(--amber)', 'saw feedback, kept gap')
    + _stealthCell('Position Bias', anchorRate + '%', ancCol, 'chose option A')
    + '</div>'
    + velFlag + ancFlag;

  // Inject into dashboard AND persona panel
  var dashPanel = document.getElementById('panel-dashboard');
  if (dashPanel) dashPanel.appendChild(panel);

  // Also inject a clone into the persona panel (COGNITA tracking)
  var personaPanel = document.getElementById('panel-persona');
  if (personaPanel) {
    var existingPersonaCog = document.getElementById('cognita-stealth-panel-persona');
    if (existingPersonaCog) existingPersonaCog.remove();
    var clone = panel.cloneNode(true);
    clone.id = 'cognita-stealth-panel-persona';
    // Insert after the NWI continuum section if it exists
    var continuumEl = personaPanel.querySelector('.nwi-continuum, .persona-continuum, #persona-continuum');
    if (continuumEl) continuumEl.parentNode.insertBefore(clone, continuumEl.nextSibling);
    else personaPanel.appendChild(clone);
  }
}

function _stealthCell(label, val, col, sub) {
  return '<div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:10px 12px">'
    + '<div style="font-family:\'JetBrains Mono\',monospace;font-size:8px;color:rgba(255,255,255,.4);letter-spacing:.1em;text-transform:uppercase;margin-bottom:3px">' + label + '</div>'
    + '<div style="font-family:\'JetBrains Mono\',monospace;font-size:18px;font-weight:700;color:' + col + '">' + val + '</div>'
    + '<div style="font-family:\'JetBrains Mono\',monospace;font-size:8px;color:rgba(255,255,255,.3);margin-top:2px">' + sub + '</div>'
    + '</div>';
}

// Hook stealth panel into renderDash
(function() {
  var _prevRenderDash = renderDash;
  renderDash = function() {
    _prevRenderDash();
    setTimeout(v5RenderStealthPanel, 100);
  };
})();

/* END COGNITA EXTENDED */

/* ── CONTINUUM PROGRESS TRACK JS ─────────────────────── */
function v5RenderContinuumTrack() {
  var fc = v5State.firstChoices || {};
  var s1done = ['s1a','s1b_1','s1b_2','s1c'].some(function(k){return !!fc[k];});
  var s1full = ['s1a','s1b_1','s1b_2','s1c'].every(function(k){return !!fc[k];});
  var s2full = ['s2a','s2a2','s2b','s2c'].every(function(k){return !!fc[k];});
  var s3full = ['s3a','s3b','s3c','s3c2'].every(function(k){return !!fc[k];});
  var rtDone = !!(v5State.retestFirstChoices && (v5State.retestFirstChoices['rt1']));
  var personaDone = s3full;

  function setDot(idx, state) {
    var dot = document.getElementById('ct-dot-' + idx);
    if (!dot) return;
    dot.className = 'ct-dot ct-' + state;
  }

  setDot(0, s1full ? 'complete' : s1done ? 'active' : 'active'); // S1 active from start
  setDot(1, s2full ? 'complete' : s1full ? 'active' : 'locked');
  setDot(2, s3full ? 'complete' : s2full ? 'active' : 'locked');
  setDot(3, rtDone ? 'complete' : s3full ? 'active' : 'locked');
  setDot(4, personaDone && rtDone ? 'complete' : rtDone ? 'active' : 'locked');

  var nextEl = document.getElementById('ct-next');
  if (nextEl) {
    var nextText = !s1full ? 'Complete Scenario 1 (Cardiac · STEMI)'
      : !s2full ? 'Proceed to Scenario 2 (Stroke · tPA)'
      : !s3full ? 'Proceed to Scenario 3 (Sepsis · SOFA)'
      : !rtDone  ? 'Complete unannounced retest (Mrs. Nkosi · S4)'
      : !personaDone ? 'Review PERSONA profile'
      : '&#x2713; Full assessment pathway complete';
    nextEl.innerHTML = '<span>NEXT → </span>' + nextText;
  }
}

// Hook into renderDash
(function() {
  var _prevDash2 = renderDash;
  renderDash = function() {
    _prevDash2();
    setTimeout(v5RenderContinuumTrack, 50);
  };
})();

// Also update when any choice is made
(function() {
  var _prevChoiceHook = document.addEventListener;
  // We already have the capture-phase listener — just call from v5CheckRetest
  var _origCheckRetest = v5CheckRetest;
  v5CheckRetest = function() {
    _origCheckRetest();
    v5RenderContinuumTrack();
  };
})();
/* END CONTINUUM TRACK */



/* ═══════════════════════════════════════════════════════
   COGNITA v2 — Temporal & learning-quality signals
   All scored against ORIGINAL choices.
   Revisions tracked separately as learning indicators.
═══════════════════════════════════════════════════════ */

// ── INTER-CHOICE INTERVAL ─────────────────────────────────────
// Time elapsed between consecutive first choices.
// Short across all nodes = not reading formative feedback.
// Longer gap after a gap choice = paused to read, positive.
(function() {
  var _lastChoiceTime = null;
  document.addEventListener('click', function(e) {
    var el = e.target.closest('.choice[data-type]');
    if (!el) return;
    var nodeId = el.dataset.node;
    if (!nodeId || (v5State.firstChoices||{})[nodeId]) return; // skip revisions
    var now = Date.now();
    if (_lastChoiceTime !== null) {
      if (!v5State.interChoiceIntervals) v5State.interChoiceIntervals = {};
      v5State.interChoiceIntervals[nodeId] = now - _lastChoiceTime;
    }
    _lastChoiceTime = now;
  }, true);
})();

// ── POST-REVISION QUALITY ─────────────────────────────────────
// After ARIA/formative, if user revises, was it a genuine improvement?
// 'strong'    = gap/mid → expert (meaningful self-correction)
// 'partial'   = gap → mid (partial improvement)
// 'lateral'   = gap → different gap (cosmetic, no real change)
// 'backslide' = expert → gap/mid (confidence undermined — flag for review)
(function() {
  document.addEventListener('click', function(e) {
    var el = e.target.closest('.choice[data-type]');
    if (!el) return;
    var nodeId = el.dataset.node;
    var type   = el.dataset.type;
    if (!nodeId || !type) return;
    var fc = v5State.firstChoices || {};
    if (!fc[nodeId] || fc[nodeId] === type) return; // not a revision, or same
    var firstType = fc[nodeId];
    var quality = 'lateral';
    if ((firstType === 'gap' || firstType === 'mid') && type === 'expert') quality = 'strong';
    else if (firstType === 'gap' && type === 'mid') quality = 'partial';
    else if (firstType === 'expert') quality = 'backslide';
    if (!v5State.postRevisionQuality) v5State.postRevisionQuality = {};
    v5State.postRevisionQuality[nodeId] = {
      from: firstType, to: type, quality: quality,
      latencyMs: v5State.nodeOpenedAt[nodeId] ? Date.now() - v5State.nodeOpenedAt[nodeId] : null,
      ts: Date.now()
    };
  }, true);
})();

// ── RETEST vs S3 COMPARISON ───────────────────────────────────
// Measures whether learning transferred to new clinical context (S4).
// RT-01 (Mrs. Nkosi sepsis) maps to S3-A (Mr. Al-Fayed sepsis).
// Same domain (D5), new patient, end-of-shift context — hardest transfer.
function v5ComputeRetestComparison() {
  var fc  = v5State.firstChoices || {};
  var rfc = v5State.retestFirstChoices || {};
  var typeScore = {expert:2, mid:1, gap:0};
  var comparison = {};
  if (rfc['rt1'] && fc['s3a']) {
    var s3s = typeScore[fc['s3a']]  || 0;
    var rts = typeScore[rfc['rt1']] || 0;
    comparison['rt1'] = {
      s3equivalent: 's3a', s3choice: fc['s3a'], rtChoice: rfc['rt1'],
      improved:   rts > s3s,
      consistent: rts === s3s && s3s === 2,
      plateaued:  rts === s3s && s3s < 2,
      regressed:  rts < s3s
    };
  }
  v5State.retestComparison = comparison;
  return comparison;
}

// ── ENHANCED STEALTH PANEL (learning quality section) ─────────
var _prevStealthRender = window.v5RenderStealthPanel;
v5RenderStealthPanel = function() {
  if (typeof _prevStealthRender === 'function') _prevStealthRender();

  var existing = document.getElementById('cognita-v2-panel');
  if (existing) existing.remove();

  // Try dashboard panel first, then persona clone
  var basePanel = document.getElementById('cognita-stealth-panel') 
               || document.getElementById('cognita-stealth-panel-persona');
  if (!basePanel) return;

  // Compute metrics
  var intervals = Object.values(v5State.interChoiceIntervals || {});
  var avgInterval = intervals.length
    ? Math.round(intervals.reduce(function(a,b){return a+b;},0) / intervals.length / 1000) : null;

  var revQual = v5State.postRevisionQuality || {};
  var strong    = Object.values(revQual).filter(function(r){return r.quality==='strong';}).length;
  var partial   = Object.values(revQual).filter(function(r){return r.quality==='partial';}).length;
  var backslide = Object.values(revQual).filter(function(r){return r.quality==='backslide';}).length;

  var fc = v5State.firstChoices || {};
  var gapLats = Object.keys(fc).filter(function(k){return fc[k]==='gap';})
    .map(function(k){return v5State.responseLatency[k];}).filter(Boolean);
  var expertLats = Object.keys(fc).filter(function(k){return fc[k]==='expert';})
    .map(function(k){return v5State.responseLatency[k];}).filter(Boolean);
  var avgGapLat    = gapLats.length    ? Math.round(gapLats.reduce(function(a,b){return a+b;},0)/gapLats.length/1000)    : null;
  var avgExpertLat = expertLats.length ? Math.round(expertLats.reduce(function(a,b){return a+b;},0)/expertLats.length/1000) : null;

  var rt1 = (v5ComputeRetestComparison())['rt1'];

  var notes = [];
  if (avgInterval !== null && avgInterval < 10) notes.push('Short inter-choice intervals — limited engagement with formative feedback between decisions.');
  else if (avgInterval !== null && avgInterval >= 30) notes.push('Long inter-choice intervals — deliberate reflection between decisions. Positive indicator.');
  if (strong > 0) notes.push(strong + ' gap-to-expert self-correction' + (strong>1?'s':'') + ' after feedback — strong metacognitive signal.');
  if (backslide > 0) notes.push('Expert-to-worse revision detected on ' + backslide + ' node' + (backslide>1?'s':'') + ' — formative feedback may have introduced doubt in correct reasoning.');
  if (rt1) {
    if (rt1.improved)   notes.push('Retest improved vs S3A — learning transferred to new clinical context.');
    else if (rt1.consistent && rt1.s3choice==='expert') notes.push('Retest consistent with S3A expert — knowledge is stable across contexts.');
    else if (rt1.regressed)  notes.push('Retest regressed vs S3A — contextual transfer not yet achieved.');
    else if (rt1.plateaued)  notes.push('Retest consistent with S3A non-expert — gap pattern stable; targeted practice needed.');
  }

  var ext = document.createElement('div');
  ext.id = 'cognita-v2-panel';
  ext.style.cssText = 'background:var(--navy);border-radius:12px;padding:18px 20px;margin-top:8px;border:1px solid rgba(0,188,212,.15)';
  ext.innerHTML =
    '<div style="font-family:\'JetBrains Mono\',monospace;font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--cyan,#0BBCD4);margin-bottom:14px">'
    + 'COGNITA · Learning Quality Indicators (Scored on Original Choices)</div>'
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">'
    + _stealthCell('Gap Node Lat.', avgGapLat !== null ? avgGapLat+'s' : '--', avgGapLat >= 15 ? 'var(--teal)' : avgGapLat >= 6 ? 'var(--amber)' : 'var(--crimson)', 'avg time on gaps')
    + _stealthCell('Expert Node Lat.', avgExpertLat !== null ? avgExpertLat+'s' : '--', 'var(--teal)', 'avg time on expert')
    + _stealthCell('Inter-choice', avgInterval !== null ? avgInterval+'s' : '--', avgInterval >= 30 ? 'var(--teal)' : avgInterval >= 10 ? 'var(--amber)' : 'var(--crimson)', 'avg between choices')
    + _stealthCell('Strong Revisions', strong, strong > 0 ? 'var(--teal)' : 'rgba(255,255,255,.3)', 'gap/mid → expert')
    + _stealthCell('Partial Revisions', partial, partial > 0 ? 'var(--amber)' : 'rgba(255,255,255,.3)', 'gap → mid')
    + _stealthCell('Backslides', backslide, backslide > 0 ? 'var(--crimson)' : 'var(--teal)', 'expert → worse')
    + _stealthCell('RT-01 vs S3A',
        rt1 ? (rt1.rtChoice + ' / ' + rt1.s3choice) : 'pending',
        rt1 ? (rt1.improved||rt1.consistent&&rt1.s3choice==='expert' ? 'var(--teal)' : rt1.regressed ? 'var(--crimson)' : 'var(--amber)') : 'rgba(255,255,255,.3)',
        rt1 ? (rt1.improved ? 'improved' : rt1.consistent ? 'consistent' : rt1.regressed ? 'regressed' : 'plateaued') : 'retest not done')
    + _stealthCell('Confirmed Gaps', (v5State.confirmedGaps||[]).length, (v5State.confirmedGaps||[]).length > 2 ? 'var(--crimson)' : 'var(--amber)', 'saw feedback, kept gap')
    + '</div>'
    + (notes.length ? '<div style="margin-top:10px;padding:10px 14px;background:rgba(255,255,255,.04);border-radius:6px;font-family:\'JetBrains Mono\',monospace;font-size:9px;color:rgba(255,255,255,.5);line-height:1.7">' + notes.join(' ') + '</div>' : '');

  basePanel.parentNode.insertBefore(ext, basePanel.nextSibling);
};

// Hook retest comparison into renderDash
(function() {
  var _rd3 = renderDash;
  renderDash = function() { _rd3(); v5ComputeRetestComparison(); };
})();


// Reveal consequence card after parent choice
var CONSEQUENCE_MAP = {s2a:'cons-s2a2', s3c:'cons-s3c2'}; // s1a2 anatomy always visible
function v5RevealConsequence(nodeId) {
  var consId = CONSEQUENCE_MAP[nodeId];
  if (!consId) return;
  var el = document.getElementById(consId);
  if (el) {
    el.classList.add('revealed');
    setTimeout(function() {
      if (el.closest('.panel.active'))
        el.scrollIntoView({behavior:'smooth', block:'start'});
    }, 200);
  }
}


/* ── QUICK NAV AFTER CHOICE ──────────────────────────── */
var QUICK_NAV_MAP = {
  s1a2: {target:'s1b',  label:'Continue to Authority Challenge →'},
  s1b_2:{target:'s1c',  label:'Continue to DNR Ethics →'},
  s1c:  {target:'s2a',  label:'Begin Scenario 2: Stroke →'},
  s2a2: {target:'s2b',  label:'Continue to tPA Window →'},
  s2b:  {target:'s2c',  label:'Continue to Language Barrier →'},
  s2c:  {target:'s3a',  label:'Begin Scenario 3: Sepsis →'},
  s3a:  {target:'s3b',  label:'Continue to 1-Hour Bundle →'},
  s3b:  {target:'s3c',  label:'Continue to Septic Shock →'},
  s3c2: {target:'persona', label:'View PERSONA Output →'}
};

function v5ShowQuickNav(nodeId) {
  var nav = QUICK_NAV_MAP[nodeId];
  if (!nav) return;
  var oid = 'out-' + nodeId.replace(/_/g,'');
  var outEl = document.getElementById(oid);
  if (!outEl) return;
  // Don't add twice
  if (outEl.nextElementSibling && outEl.nextElementSibling.classList.contains('quick-nav')) return;
  var qn = document.createElement('div');
  qn.className = 'quick-nav show';
  qn.innerHTML = '<span>' + nav.label + '</span><span class="quick-nav-arrow">→</span>';
  qn.onclick = function() { go(nav.target); };
  outEl.parentNode.insertBefore(qn, outEl.nextSibling);
}

/* END COGNITA v2 */





/* ── ARIA CONVERSATION REVIEW ────────────────────────────
   Renders the full ARIA conversation history for this session
   in a scrollable panel in the dashboard.
   Also accessible from the PERSONA panel.
═══════════════════════════════════════════════════════ */

var NODE_LABELS = {
  s1a:'STEMI Response', 's1a2':'SBAR Handoff', 's1b_1':'tPA Challenge 1',
  's1b_2':'tPA Challenge 2', 's1c':'DNR Ethics', 's2a':'FAST / BP Decision',
  's2a2':'SDM Consent', 's2b':'tPA Window', 's2c':'Language Access',
  's3a':'Sepsis Recognition', 's3b':'1-Hour Bundle', 's3c':'Septic Shock',
  's3c2':'Moral Resilience', 'rt1':'Retest Mrs. Nkosi', 'persona':'End of Session'
};

function v5RenderAriaReview(log) {
  var body    = document.getElementById('aria-review-body');
  var countEl = document.getElementById('aria-review-count');
  if (!body) return;

  if (!log || !log.length) {
    body.innerHTML = '<div class="aria-thread-empty">No ARIA conversations recorded in this session yet.<br>ARIA activates after gap or mid choices.</div>';
    if (countEl) countEl.textContent = '0 conversations';
    return;
  }

  if (countEl) countEl.textContent = log.length + ' conversation' + (log.length !== 1 ? 's' : '');

  body.innerHTML = log.map(function(entry, i) {
    var nodeLabel = NODE_LABELS[entry.node] || entry.node;
    var timeStr   = entry.ts ? new Date(entry.ts).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'}) : '';
    var html      = '<div class="aria-thread">';
    html += '<div class="aria-thread-hdr">';
    html += '<span class="aria-thread-node">' + nodeLabel + '</span>';
    if (timeStr) html += '<span class="aria-thread-time">' + timeStr + '</span>';
    html += '</div>';
    // Display flex column for bubbles
    html += '<div style="display:flex;flex-direction:column;gap:6px">';
    if (entry.question) {
      html += '<div class="aria-thread-q"><strong style="font-family:\'JetBrains Mono\',monospace;font-size:8px;color:var(--teal-d);text-transform:uppercase;letter-spacing:.1em;display:block;margin-bottom:4px">ARIA asked</strong>' + entry.question + '</div>';
    }
    if (entry.chosen) {
      html += '<div class="aria-thread-choice">\u201c' + entry.chosen + '\u201d</div>';
    }
    if (entry.reply) {
      html += '<div class="aria-thread-reply"><strong style="font-family:\'JetBrains Mono\',monospace;font-size:8px;color:var(--navy-m);text-transform:uppercase;letter-spacing:.1em;display:block;margin-bottom:4px">ARIA replied</strong>' + entry.reply + '</div>';
    }
    if (entry.followup) {
      html += '<div class="aria-thread-followup">' + entry.followup + '</div>';
    }
    html += '</div></div>';
    return html;
  }).join('');
}

function v5ToggleAriaReview() {
  var body   = document.getElementById('aria-review-body');
  var toggle = document.getElementById('aria-review-toggle');
  if (!body) return;
  var isOpen = body.classList.contains('open');
  if (isOpen) {
    body.classList.remove('open');
    if (toggle) toggle.classList.remove('open');
  } else {
    // Render fresh before opening
    var log = (S && S.ariaLog) ? S.ariaLog : [];
    v5RenderAriaReview(log);
    body.classList.add('open');
    if (toggle) toggle.classList.add('open');
  }
}

// Auto-render count on renderDash
(function() {
  var _rdAria = renderDash;
  renderDash = function() {
    _rdAria();
    // Update count without opening
    var log = (S && S.ariaLog) ? S.ariaLog : [];
    var countEl = document.getElementById('aria-review-count');
    if (countEl) countEl.textContent = log.length + ' conversation' + (log.length !== 1 ? 's' : '');
    // Reset open state on new session view
    var body = document.getElementById('aria-review-body');
    if (body) body.classList.remove('open');
    var toggle = document.getElementById('aria-review-toggle');
    if (toggle) toggle.classList.remove('open');
  };
})();

/* END ARIA REVIEW */


/* ═══════════════════════════════════════════════════════════
   AIRTABLE INTEGRATION — AIWIZN Multi-User Database
   Self-healing: strips unknown fields and retries automatically.
   Token needs: data.records:read + data.records:write only.
   No schema scope required.
═══════════════════════════════════════════════════════════ */

var AIRTABLE_TOKEN   = 'patBlGyrpOTqLaVcH.c0d181987d8ddbc22064d6e50fa40f969cff47b5a3d0125a4f741d62bae75c3c';
var AIRTABLE_BASE_ID = 'appyhKYSRiLx3cr24';
var AIRTABLE_TABLE   = 'Sessions';

// POST record — on 422 UNKNOWN_FIELD_NAME, strip that field and retry
// Needs ONLY data.records:write scope (no Meta API)
function atPostRecord(fields, attempt, skipped) {
  attempt = attempt || 0;
  skipped = skipped || [];
  if (attempt > 55) return Promise.reject('Too many retries (' + skipped.length + ' fields skipped: ' + skipped.join(', ') + ')');

  var url = 'https://api.airtable.com/v0/' + AIRTABLE_BASE_ID + '/' + encodeURIComponent(AIRTABLE_TABLE);
  return fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + AIRTABLE_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fields })
  })
  .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); })
  .then(function(res) {
    if (res.status === 200) {
      if (skipped.length) console.log('AIWIZN Airtable: wrote record, skipped fields (not yet in table): ' + skipped.join(', '));
      return res.data;
    }
    var errType = (res.data.error && res.data.error.type)    || '';
    var errMsg  = (res.data.error && res.data.error.message) || '';
    if (errType === 'UNKNOWN_FIELD_NAME') {
      // Extract field name from: 'Unknown field name: "Session ID"'
      var match = errMsg.match(/"([^"]+)"/);
      var badField = match ? match[1] : null;
      if (!badField) return Promise.reject('Cannot parse unknown field: ' + errMsg);
      var newFields = {};
      Object.keys(fields).forEach(function(k) { if (k !== badField) newFields[k] = fields[k]; });
      return atPostRecord(newFields, attempt + 1, skipped.concat(badField));
    }
    return Promise.reject('Airtable ' + res.status + ': ' + errType + ' — ' + errMsg);
  });
}

function sendToAirtable(session) {
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) { console.log('AIWIZN: Airtable not configured'); return; }

  var fc    = session.firstChoices || session.choices || {};
  var rfc   = session.retestFirstChoices || {};
  var total  = Object.keys(fc).length;
  var expert = Object.values(fc).filter(function(c) { return c === 'expert'; }).length;
  var gap    = Object.values(fc).filter(function(c) { return c === 'gap'; }).length;
  var mid    = Object.values(fc).filter(function(c) { return c === 'mid'; }).length;
  var nwi    = total > 0 ? Math.round(expert / total * 100) : 0;

  var dom = {};
  try { dom = computeDoms ? computeDoms({ choices: fc }) : {}; } catch(e) {}
  function ds(d) { return dom[d] != null ? Math.round(dom[d] * 100) : null; }

  var rq     = session.postRevisionQuality || {};
  var strong = Object.values(rq).filter(function(r) { return r.quality === 'strong'; }).length;
  var partial= Object.values(rq).filter(function(r) { return r.quality === 'partial'; }).length;
  var backsl = Object.values(rq).filter(function(r) { return r.quality === 'backslide'; }).length;

  var lats   = Object.values(session.responseLatency || {});
  var avgLat = lats.length ? Math.round(lats.reduce(function(a,b){return a+b;},0)/lats.length/1000) : null;
  var ints   = Object.values(session.interChoiceIntervals || {});
  var avgInt = ints.length ? Math.round(ints.reduce(function(a,b){return a+b;},0)/ints.length/1000) : null;

  var fields = {
    'Session ID':   session.id || 0,
    'Nurse Name':   session.nurse || '',
    'Unit':         session.unit  || '',
    'Date':         session.start ? new Date(session.start).toISOString().split('T')[0] : '',
    'Timestamp':    new Date().toISOString(),
    'NWI %':        nwi,
    'Total Nodes':  total,
    'Expert':       expert,
    'Gap':          gap,
    'Mid':          mid,
    'S1A STEMI':            fc['s1a']   || '',
    'S1A2 SBAR':            fc['s1a2']  || '',
    'S1B1 tPA Challenge 1': fc['s1b_1'] || '',
    'S1B2 tPA Challenge 2': fc['s1b_2'] || '',
    'S1C DNR Ethics':       fc['s1c']   || '',
    'S2A Stroke FAST':      fc['s2a']   || '',
    'S2A2 SDM Consent':     fc['s2a2']  || '',
    'S2B tPA Window':       fc['s2b']   || '',
    'S2C Language':         fc['s2c']   || '',
    'S3A Sepsis Recog':     fc['s3a']   || '',
    'S3B 1hr Bundle':       fc['s3b']   || '',
    'S3C Septic Shock':     fc['s3c']   || '',
    'S3C2 Moral Resilience':fc['s3c2']  || '',
    'RT-01 Retest':         rfc['rt1']  || '',
    'D1 Ambiguity':    ds('D1'),
    'D2 Comm':         ds('D2'),
    'D3 Ethics':       ds('D3'),
    'D4 Psych Safety': ds('D4'),
    'D5 Deterioration':ds('D5'),
    'D6 Pharmacology': ds('D6'),
    'D7 SBAR':         ds('D7'),
    'D8 Prioritisation':ds('D8'),
    'D9 Cultural':     ds('D9'),
    'D11 Social':      ds('D11'),
    'D12 Moral':       ds('D12'),
    'Rapid Clicks':        session.rapidClickCount || 0,
    'Backtracks':          session.backtrackCount  || 0,
    'Self-Corrections':    (session.selfCorrected  || []).length,
    'Total Revisions':     Object.keys(session.revisions || {}).length,
    'Strong Revisions':    strong,
    'Partial Revisions':   partial,
    'Backslides':          backsl,
    'Confirmed Gaps':      (session.confirmedGaps  || []).length,
    'ARIA Engagements':    (session.ariaLog || []).length,
    'Avg Decision (s)':    avgLat,
    'Avg Inter-choice (s)':avgInt,
    'Position Bias (A%)':  (function() {
      var pc = session.positionChoices || {};
      var keys = Object.keys(pc);
      if (!keys.length) return null;
      return Math.round(keys.filter(function(k) { return pc[k] === 'A'; }).length / keys.length * 100);
    })(),
    'Retest RT-01':   rfc['rt1'] || '',
    'Retest vs S3A':  (function() {
      var rc = session.retestComparison || {};
      if (!rc.rt1) return '';
      if (rc.rt1.improved)   return 'improved';
      if (rc.rt1.consistent) return 'consistent';
      if (rc.rt1.regressed)  return 'regressed';
      return 'plateaued';
    })(),
    'Reflection': session.reflection || ''
  };

  // Strip null/empty values before posting
  Object.keys(fields).forEach(function(k) {
    if (fields[k] === null || fields[k] === undefined || fields[k] === '') delete fields[k];
  });

  atPostRecord(fields)
    .then(function(rec) {
      console.log('AIWIZN Airtable: saved — ' + rec.id);
      toast('Session synced to Airtable \u2713', 't-ok');
    })
    .catch(function(err) {
      console.warn('AIWIZN Airtable error:', err);
      toast('Saved locally. Airtable: ' + String(err).substring(0, 60), '');
    });
}

/* END AIRTABLE INTEGRATION */
