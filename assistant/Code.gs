// QAGC Assistant API — the door ChatGPT knocks on.
//
// Deployed as an Apps Script web app under qagcplatform@gmail.com.
// ChatGPT (a Custom GPT with Actions) calls it to read the plan and to
// push objective PACKAGES; everything pushed lands as PENDING — the
// approval gate is the platform's, never the assistant's.
//
// A package is one objective together with its KPIs and (optionally) a
// budget, pushed in a single call so they arrive — and are approved —
// as a whole, component by component.
//
// One-time setup, in the editor:
//   1. Run setup() once (authorize when asked).
//   2. View → Logs: copy the printed API key.
//   3. Deploy → New deployment → Web app →
//        Execute as: Me · Who has access: Anyone
//      Copy the /exec URL.
//   After editing this file: Deploy → Manage deployments → edit →
//   New version (the URL does not change).

const PROPS = PropertiesService.getScriptProperties();

// every edit in the KPI spreadsheet stamps its tab, so the platform can ask
// "what changed?" cheaply and pull only that. Installed by ensureKpiTrigger_().
function onKpiEdit(e) {
  try {
    const name = e.range.getSheet().getName();
    PROPS.setProperty('KPI_STAMP_' + name, new Date().toISOString());
  } catch (_) {}
}
function ensureKpiTrigger_(ssId) {
  const has = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'onKpiEdit');
  if (!has) ScriptApp.newTrigger('onKpiEdit').forSpreadsheet(ssId).onEdit().create();
}

function setup() {
  if (!PROPS.getProperty('QAGC_API_KEY')) {
    PROPS.setProperty('QAGC_API_KEY',
      'qagc_' + Utilities.getUuid().replace(/-/g, '').slice(0, 24));
  }
  sheet_('inbox'); // creates the spreadsheet on first run
  Logger.log('API key: ' + PROPS.getProperty('QAGC_API_KEY'));
  Logger.log('Spreadsheet: ' + PROPS.getProperty('QAGC_SSID'));
}

function ss_() {
  let id = PROPS.getProperty('QAGC_SSID');
  if (!id) {
    const ss = SpreadsheetApp.create('QAGC Assistant — الوارد من ChatGPT');
    id = ss.getId();
    PROPS.setProperty('QAGC_SSID', id);
  }
  return SpreadsheetApp.openById(id);
}

// ── the Director General's calendar bridge ──
// The DG shares her Google calendar with the QAGC account (qagcplatform@gmail.com)
// with "Make changes to events". Put her calendar id (her email) in Script
// properties as QAGC_DG_CAL; until then the QAGC account's own calendar is used,
// which also works as the demo. Set the project time zone to Asia/Muscat
// (Project Settings) so times read and write correctly.
function dgCal_() {
  const id = PROPS.getProperty('QAGC_DG_CAL') || '';
  const cal = id ? CalendarApp.getCalendarById(id) : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error('calendar not accessible — has it been shared with the QAGC account?');
  return cal;
}
function fmt_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm");
}
// ── the directorate calendar: everyone views, chosen hands write ──
// Created in the QAGC account on first use; the platform decides who may add.
function dirCal_() {
  let id = PROPS.getProperty('QAGC_DIR_CAL');
  if (!id) {
    const cal = CalendarApp.createCalendar('تقويم المركز — QAGC');
    id = cal.getId();
    PROPS.setProperty('QAGC_DIR_CAL', id);
  }
  const cal = CalendarApp.getCalendarById(id);
  if (!cal) throw new Error('the centre calendar is not accessible');
  return cal;
}
// events the owner marked private: 🔒 in the title or #خاص in the description.
// Anyone but the owner sees only «مشغول» and the time block.
function isPrivate_(ev) {
  return ev.getTitle().indexOf('🔒') >= 0 ||
         (ev.getDescription() || '').indexOf('#خاص') >= 0;
}

// ── Google Sheets as the working surface ──
// The annual plan publishes to one spreadsheet; every KPI gets its own tab
// in a second one. Both live in the QAGC account's Drive and are shared by
// link for editing — tighten to named people once the team list is final.
function namedSS_(prop, title) {
  let id = PROPS.getProperty(prop);
  if (!id) {
    const ss = SpreadsheetApp.create(title);
    id = ss.getId();
    PROPS.setProperty(prop, id);
    DriveApp.getFileById(id).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
  }
  return SpreadsheetApp.openById(id);
}
function tabOf_(ss, name, header) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.setRightToLeft(true);
    sh.appendRow(header);
    sh.setFrozenRows(1);
  }
  return sh;
}

const COLS = ['when', 'title', 'tag', 'owner', 'due', 'budget', 'note', 'state', 'smart', 'kpis', 'itype', 'venue', 'ctype', 'date_to', 'kind'];
const ACOLS = ['id', 'when', 'kpi', 'question', 'data', 'answer', 'state'];
const FCOLS = ['id', 'when', 'by', 'screen', 'where', 'what', 'text', 'state', 'reply', 'to'];
const CTYPES = ['lecture', 'workshop', 'webinar', 'forum'];

function fsheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName('feedback');
  if (!sh) { sh = ss.insertSheet('feedback'); sh.appendRow(FCOLS); }
  return sh;
}
const ICOLS = ['id', 'when', 'kind', 'to', 'toName', 'from', 'fromId', 'quote', 'note',
  'srcSid', 'srcRef', 'srcTk', 'opened', 'openedAt', 'reply', 'replyWhen', 'state'];
function isheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName('workmail');
  if (!sh) { sh = ss.insertSheet('workmail'); sh.appendRow(ICOLS); }
  return sh;
}
function sheet_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(name === 'analysis' ? ACOLS : COLS);
  }
  // a sheet created before newer columns existed gets them added in place
  const head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  (name === 'analysis' ? ACOLS : COLS).forEach(c => {
    if (head.indexOf(c) < 0) {
      sh.getRange(1, head.length + 1).setValue(c);
      head.push(c);
    }
  });
  return sh;
}

// the three classification tags — nothing enters untagged
const TAGS = ['five_year_plan', 'annual_plan', 'third_category'];

// a grounding slice of the 2027 plan, so the GPT can aim its suggestions
const OBJECTIVES = [
  { ref: 'SO1', title: 'إرساء منظومة متكاملة للحوكمة وضمان الجودة في قطاع الأشخاص ذوي الإعاقة', owner: 'دائرة الحوكمة ومعايير الجودة وتطوير الخدمات' },
  { ref: 'SO2', title: 'بناء منظومة قابلة للقياس للرقابة والامتثال قائمة على المخاطر', owner: 'دائرة الرقابة والامتثال' },
  { ref: 'SO3', title: 'توحيد منظومة الاعتماد والتصنيف والتراخيص لخدمات الأشخاص ذوي الإعاقة', owner: 'دائرة الاعتماد والتراخيص' },
  { ref: 'SO4', title: 'إنشاء منظومة قطاعية لقياس الأداء والتحسين المستمر', owner: 'مكتب المدير العام' },
  { ref: 'SO5', title: 'تفعيل شبكة جودة مستدامة في المحافظات الإحدى عشرة', owner: 'دائرة الحوكمة ومعايير الجودة' },
];

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function authed_(e) {
  const key = (e && e.parameter && e.parameter.key) || '';
  return key && key === PROPS.getProperty('QAGC_API_KEY');
}

// ── window custodians: a comment-only key for each person, issued by the DG ──
// The master key can do everything. A custodian key can do one thing: add review notes,
// and only on the windows listed for it. The bridge keeps the SHA-256 of each custodian key,
// never the key, and stamps every note with the custodian's name, not the sender's claim.
function sha256_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
function custodians_() {
  try { return JSON.parse(PROPS.getProperty('QAGC_CUSTODIANS') || '{}') || {}; } catch (_) { return {}; }
}
function custodianOf_(e) {
  const key = (e && e.parameter && e.parameter.key) || '';
  if (!key || key.length < 20 || key === PROPS.getProperty('QAGC_API_KEY')) return null;
  const c = custodians_()[sha256_(key)];
  return (c && c.active !== false) ? c : null;
}
// a custodian key sends at most 120 notes an hour
function custodianQuota_(c, n) {
  const cache = CacheService.getScriptCache(), k = 'cq_' + c.person;
  const used = Number(cache.get(k) || 0);
  if (used + n > 120) return false;
  cache.put(k, String(used + n), 3600);
  return true;
}
// ── sign-in for every device: accounts and their password hashes live here ──
// While QAGC_AUTH_ON is not '1' the platform keeps its local sign-in. Once the DG switches it on,
// every sign-in is checked here and the shared demonstration password stops working.
function accts_() { try { return JSON.parse(PROPS.getProperty('QAGC_ACCOUNTS') || '{}') || {}; } catch (_) { return {}; } }
function acctsSave_(a) { PROPS.setProperty('QAGC_ACCOUNTS', JSON.stringify(a)); }
function authOn_() { return PROPS.getProperty('QAGC_AUTH_ON') === '1'; }
function salt_() { return Utilities.getUuid().replace(/-/g, ''); }
function pwHash_(salt, pw) { let h = salt + ':' + String(pw); for (let i = 0; i < 1500; i++) h = sha256_(h); return h; }
function pwOk_(rec, pw) { return !!(rec && rec.h && rec.s && pwHash_(rec.s, pw) === rec.h); }
function pwSet_(rec, pw, must) { rec.s = salt_(); rec.h = pwHash_(rec.s, pw); rec.must = !!must; rec.changed = new Date().toISOString(); }
function newCode_(n) {
  const al = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const raw = sha256_(Utilities.getUuid() + Utilities.getUuid() + Date.now());
  let o = ''; for (let i = 0; i < n; i++) o += al[parseInt(raw.substr(i * 2, 2), 16) % al.length];
  return o;
}
// five failures for one username pause it for fifteen minutes
function locked_(u) { return Number(CacheService.getScriptCache().get('lk_' + u) || 0) >= 5; }
function failed_(u) { const c = CacheService.getScriptCache(), k = 'lk_' + u; c.put(k, String(Number(c.get(k) || 0) + 1), 900); }
function cleared_(u) { CacheService.getScriptCache().remove('lk_' + u); }
// sessions: a random token; only its hash is kept, for twelve hours
function sessions_() { try { return JSON.parse(PROPS.getProperty('QAGC_SESSIONS') || '{}') || {}; } catch (_) { return {}; } }
function sessionNew_(u) {
  const all = sessions_(), now = Date.now();
  Object.keys(all).forEach(k => { if (all[k].exp < now) delete all[k]; });
  const t = Utilities.getUuid() + Utilities.getUuid();
  all[sha256_(t)] = { u: u, exp: now + 12 * 3600 * 1000 };
  PROPS.setProperty('QAGC_SESSIONS', JSON.stringify(all));
  return t;
}
function sessionUser_(t) {
  if (!t) return null;
  const s = sessions_()[sha256_(String(t))];
  return (s && s.exp > Date.now()) ? s.u : null;
}
function sessionEnd_(u, t) {
  const all = sessions_();
  Object.keys(all).forEach(k => { if ((t && k === sha256_(String(t))) || (!t && all[k].u === u)) delete all[k]; });
  PROPS.setProperty('QAGC_SESSIONS', JSON.stringify(all));
}
function acctPublic_(u, r) { return { u: u, role: r.role, sid: r.sid || '', active: r.active !== false, must: !!r.must, hasPassword: !!r.h, hasRecovery: !!r.rh }; }
// the requests a person can make before or about their own sign-in — no bridge key involved
function authPublic_(fn, body) {
  if (fn === 'authMode') return json_({ ok: true, on: authOn_() });
  if (!authOn_()) return json_({ ok: false, error: 'bridge sign-in is off' });
  const u = String(body.u || '').trim().toLowerCase().slice(0, 40);
  const all = accts_();
  if (fn === 'signIn') {
    if (locked_(u)) return json_({ ok: false, error: 'paused', minutes: 15 });
    const r = all[u];
    if (!r || !pwOk_(r, body.p)) { failed_(u); return json_({ ok: false, error: 'no match' }); }
    if (r.active === false) return json_({ ok: false, error: 'suspended' });
    cleared_(u);
    return json_({ ok: true, token: sessionNew_(u), account: acctPublic_(u, r) });
  }
  if (fn === 'recover') {
    if (locked_(u)) return json_({ ok: false, error: 'paused', minutes: 15 });
    const r = all[u], code = String(body.code || '').replace(/[\s-]/g, '').toUpperCase();
    if (!r || !r.rh || sha256_(r.rs + ':' + code) !== r.rh) { failed_(u); return json_({ ok: false, error: 'no match' }); }
    if (String(body.p || '').length < 8) return json_({ ok: false, error: 'password too short' });
    if (r.active === false) return json_({ ok: false, error: 'suspended' });
    pwSet_(r, body.p, false); delete r.rh; delete r.rs;                 // a code works once
    acctsSave_(all); cleared_(u); sessionEnd_(u, null);
    return json_({ ok: true, token: sessionNew_(u), account: acctPublic_(u, r) });
  }
  // the rest need a live session
  const who = sessionUser_(body.token);
  if (!who || !all[who]) return json_({ ok: false, error: 'not signed in' });
  const me = all[who];
  if (fn === 'whoami') return json_({ ok: true, account: acctPublic_(who, me) });
  if (fn === 'signOut') { sessionEnd_(who, body.token); return json_({ ok: true }); }
  if (fn === 'changePassword') {
    if (!me.must && !pwOk_(me, body.old)) return json_({ ok: false, error: 'current password' });
    if (String(body.p || '').length < 8) return json_({ ok: false, error: 'password too short' });
    pwSet_(me, body.p, false); acctsSave_(all);
    return json_({ ok: true, account: acctPublic_(who, me) });
  }
  if (fn === 'newRecovery') {
    const code = newCode_(12);
    me.rs = salt_(); me.rh = sha256_(me.rs + ':' + code); me.rat = new Date().toISOString().slice(0, 10);
    acctsSave_(all);
    return json_({ ok: true, code: code.slice(0, 4) + '-' + code.slice(4, 8) + '-' + code.slice(8), at: me.rat });
  }
  return json_({ ok: false, error: 'unknown request' });
}
const AUTH_PUBLIC = ['authMode', 'signIn', 'recover', 'whoami', 'signOut', 'changePassword', 'newRecovery'];

function addFeedback_(body, cust) {
  const notes = Array.isArray(body.notes) ? body.notes.slice(0, 40) : [];
  if (!notes.length) return json_({ ok: false, error: 'notes are required' });
  if (cust) {
    const allowed = Array.isArray(cust.windows) ? cust.windows : [];
    const outside = notes.filter(nt => allowed.indexOf(String(nt.screen || '')) < 0);
    if (outside.length) return json_({ ok: false, error: 'a note is on a window not assigned to this key: ' + String(outside[0].screen || '—').slice(0, 40) });
    if (!custodianQuota_(cust, notes.length)) return json_({ ok: false, error: 'too many notes this hour' });
  }
  const sh = fsheet_();
  const ids = [];
  notes.forEach(nt => {
    const id = 'F' + Utilities.getUuid().slice(0, 8);
    ids.push(id);
    sh.appendRow([id, String(nt.when || new Date().toISOString()).slice(0, 16),
      cust ? String(cust.name || cust.person).slice(0, 80) : String(nt.by || '').slice(0, 80),
      String(nt.screen || '').slice(0, 40),
      String(nt.where || '').slice(0, 120), String(nt.what || '').slice(0, 160),
      String(nt.text || '').slice(0, 2000), 'open', '',
      nt.to === 'dg' ? 'dg' : 'dev']);
  });
  return json_({ ok: true, ids: ids });
}

function doGet(e) {
  if (!authed_(e)) {
    const cust = custodianOf_(e);
    if (cust && (e.parameter.fn || 'ping') === 'ping')
      return json_({ ok: true, service: 'qagc-assistant', custodian: true, name: cust.name || '', windows: cust.windows || [] });
    return json_({ ok: false, error: 'bad key' });
  }
  const fn = (e.parameter.fn || 'ping');
  if (fn === 'ping') return json_({ ok: true, service: 'qagc-assistant', tags: TAGS });
  if (fn === 'objectives') return json_({ ok: true, objectives: OBJECTIVES });
  if (fn === 'inbox') {
    const rows = sheet_('inbox').getDataRange().getValues();
    const head = rows.shift();
    return json_({ ok: true, items: rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]]))) });
  }
  if (fn === 'snapshot') {
    // the platform's own reading of itself, refreshed on every bridge connect —
    // the digest and the periodic report are written FROM this, not from guesses
    return json_({ ok: true,
      when: PROPS.getProperty('QAGC_SNAP_WHEN') || '',
      snapshot: JSON.parse(PROPS.getProperty('QAGC_SNAPSHOT') || 'null') });
  }
  if (fn === 'feedback') {
    // the review notes pinned inside the platform — every device and every
    // Claude session reads the same board
    const rows = fsheet_().getDataRange().getValues();
    const head = rows.shift();
    return json_({ ok: true, notes: rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]]))) });
  }
  if (fn === 'changes') {
    // the tabs' last-edit stamps — one light call tells the platform what to re-pull
    const all = PROPS.getProperties();
    const stamps = {};
    Object.keys(all).forEach(k => {
      if (k.indexOf('KPI_STAMP_') === 0) stamps[k.slice(10)] = all[k];
    });
    return json_({ ok: true, stamps: stamps });
  }
  if (fn === 'readKpi') {
    // the platform pulls what the owner typed into the KPI's tab
    const tab = String(e.parameter.tab || '').trim();
    if (!tab) return json_({ ok: false, error: 'tab is required' });
    const ss = namedSS_('QAGC_KPI_SSID', 'مؤشرات الأداء — QAGC');
    const sh = ss.getSheetByName(tab);
    if (!sh) return json_({ ok: false, error: 'no such KPI tab' });
    const rows = sh.getDataRange().getValues().slice(1)
      .filter(r => r[0] !== '' && r[1] !== '' && !isNaN(Number(r[1])));
    return json_({ ok: true, tab: tab,
      labels: rows.map(r => String(r[0])),
      values: rows.map(r => Number(r[1])),
      notes: rows.map(r => String(r[2] || '')) });
  }
  if (fn === 'calendar') {
    try {
      const days = Math.min(60, Math.max(1, Number(e.parameter.days || 14)));
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + days * 86400000);
      const which = e.parameter.which === 'dir' ? 'dir' : 'dg';
      const cal = which === 'dir' ? dirCal_() : dgCal_();
      const full = e.parameter.full === '1';   // the owner's view; others get busy-only on private items
      const items = cal.getEvents(start, end).slice(0, 100).map(ev => {
        const priv = isPrivate_(ev);
        if (priv && !full) return {
          title: 'مشغول', private: true,
          start: fmt_(ev.getStartTime()), end: fmt_(ev.getEndTime()),
          allday: ev.isAllDayEvent(), loc: '',
        };
        return {
          title: ev.getTitle(), private: priv,
          start: fmt_(ev.getStartTime()), end: fmt_(ev.getEndTime()),
          allday: ev.isAllDayEvent(), loc: ev.getLocation() || '',
        };
      });
      return json_({ ok: true, cal: cal.getName(), which: which,
        tz: Session.getScriptTimeZone(), items: items });
    } catch (err) {
      return json_({ ok: false, error: String(err.message || err) });
    }
  }
  if (fn === 'analysis') {
    const rows = sheet_('analysis').getDataRange().getValues();
    const head = rows.shift();
    return json_({ ok: true, items: rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]]))) });
  }
  return json_({ ok: false, error: 'unknown fn' });
}

function doPost(e) {
  if (!authed_(e) && !custodianOf_(e)) {
    let pb = {};
    try { pb = JSON.parse(e.postData.contents || '{}'); } catch (_) { return json_({ ok: false, error: 'bad key' }); }
    if (AUTH_PUBLIC.indexOf(pb.fn) >= 0) return authPublic_(pb.fn, pb);
  }
  const cust = authed_(e) ? null : custodianOf_(e);
  if (!authed_(e) && !cust) return json_({ ok: false, error: 'bad key' });
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) {
    return json_({ ok: false, error: 'body is not JSON' });
  }
  const fn = body.fn || 'addTask';
  if (cust) {
    if (fn !== 'addFeedback') return json_({ ok: false, error: 'this key may only send review notes' });
    return addFeedback_(body, cust);
  }

  // ── accounts: kept and issued with the master key only ──
  if (fn === 'acctSync') {
    // the platform's roster of accounts; a password is never sent this way
    const list = Array.isArray(body.accounts) ? body.accounts.slice(0, 300) : [];
    const all = accts_();
    list.forEach(a => {
      const u = String(a.u || '').trim().toLowerCase().slice(0, 40); if (!/^[a-z0-9._-]+$/.test(u)) return;
      const r = all[u] || {};
      r.role = ['dg', 'dir', 'head', 'coord', 'staff'].indexOf(a.role) >= 0 ? a.role : 'staff';
      r.sid = String(a.sid || '').slice(0, 20); if (r.active === undefined) r.active = a.active !== false;
      all[u] = r;
    });
    acctsSave_(all);
    return json_({ ok: true, count: Object.keys(all).length });
  }
  if (fn === 'authSetup') {
    const all = accts_();
    if (body.on) {
      if (String(body.dgPassword || '').length < 10) return json_({ ok: false, error: 'the DG password must have at least 10 characters' });
      const dg = all.dg || { role: 'dg', sid: 'dg0', active: true };
      dg.role = 'dg'; dg.active = true; pwSet_(dg, body.dgPassword, false); all.dg = dg;
      acctsSave_(all); PROPS.setProperty('QAGC_AUTH_ON', '1');
    } else PROPS.setProperty('QAGC_AUTH_ON', '0');
    return json_({ ok: true, on: authOn_() });
  }
  if (fn === 'acctTemp') {
    const all = accts_(), u = String(body.u || '').trim().toLowerCase();
    if (!all[u]) return json_({ ok: false, error: 'no such account' });
    if (u === 'dg') return json_({ ok: false, error: 'the DG account is recovered with its own code' });
    const raw = newCode_(9), temp = raw.slice(0, 3) + '-' + raw.slice(3, 6) + '-' + raw.slice(6);
    pwSet_(all[u], temp, true); acctsSave_(all); sessionEnd_(u, null); cleared_(u);
    return json_({ ok: true, u: u, temp: temp });
  }
  if (fn === 'acctActive') {
    const all = accts_(), u = String(body.u || '').trim().toLowerCase();
    if (!all[u]) return json_({ ok: false, error: 'no such account' });
    if (u === 'dg') return json_({ ok: false, error: 'the DG account cannot be suspended' });
    all[u].active = !!body.active; acctsSave_(all); if (!body.active) sessionEnd_(u, null);
    return json_({ ok: true, u: u, active: all[u].active });
  }
  if (fn === 'acctList') {
    const all = accts_();
    return json_({ ok: true, on: authOn_(), accounts: Object.keys(all).map(u => acctPublic_(u, all[u])) });
  }

  // ── custodian keys: issued, re-scoped and withdrawn with the master key only ──
  if (fn === 'setCustodian') {
    const h = String(body.keyHash || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(h)) return json_({ ok: false, error: 'keyHash must be a SHA-256 hex' });
    const person = String(body.person || '').trim().slice(0, 20);
    if (!person) return json_({ ok: false, error: 'person is required' });
    const windows = (Array.isArray(body.windows) ? body.windows : []).map(w => String(w).trim().slice(0, 40))
      .filter(w => /^[a-z0-9_-]+$/.test(w)).slice(0, 30);
    const all = custodians_();
    Object.keys(all).forEach(k => { if (all[k].person === person && k !== h) delete all[k]; });   // one key per person
    all[h] = { person: person, name: String(body.name || '').slice(0, 80), windows: windows,
               issued: all[h] ? all[h].issued : new Date().toISOString(), active: true };
    PROPS.setProperty('QAGC_CUSTODIANS', JSON.stringify(all));
    return json_({ ok: true, person: person, windows: windows });
  }
  if (fn === 'setCustodianWindows') {
    const person = String(body.person || '').trim().slice(0, 20);
    const windows = (Array.isArray(body.windows) ? body.windows : []).map(w => String(w).trim().slice(0, 40))
      .filter(w => /^[a-z0-9_-]+$/.test(w)).slice(0, 30);
    const all = custodians_(); let n = 0;
    Object.keys(all).forEach(k => { if (all[k].person === person) { all[k].windows = windows; n++; } });
    PROPS.setProperty('QAGC_CUSTODIANS', JSON.stringify(all));
    return json_({ ok: true, updated: n });
  }
  if (fn === 'revokeCustodian') {
    const person = String(body.person || '').trim().slice(0, 20);
    const all = custodians_(); let n = 0;
    Object.keys(all).forEach(k => { if (all[k].person === person) { delete all[k]; n++; } });
    PROPS.setProperty('QAGC_CUSTODIANS', JSON.stringify(all));
    return json_({ ok: true, revoked: n });
  }
  if (fn === 'listCustodians') {
    const all = custodians_();
    return json_({ ok: true, custodians: Object.keys(all).map(k => ({ person: all[k].person, name: all[k].name,
      windows: all[k].windows, issued: all[k].issued })) });
  }

  // ── a CPD activity goes straight to its place on the year board ──
  if (fn === 'addCpd') {
    const t = String(body.title || '').trim();
    const due = String(body.due || '').trim().slice(0, 10);
    const ctype = String(body.ctype || 'lecture').trim();
    if (!t) return json_({ ok: false, error: 'title is required' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return json_({ ok: false, error: 'due must be YYYY-MM-DD' });
    if (CTYPES.indexOf(ctype) < 0) return json_({ ok: false, error: 'ctype must be one of: ' + CTYPES.join(', ') });
    const sh0 = sheet_('inbox');
    const head0 = sh0.getRange(1, 1, 1, sh0.getLastColumn()).getValues()[0];
    const rec0 = { when: new Date().toISOString(), title: t, tag: '', owner: String(body.owner || '').trim(),
      due: due, budget: '', note: String(body.note || '').trim(), state: 'pending', smart: '', kpis: '',
      itype: 'cpd', venue: String(body.venue || '').trim(), ctype: ctype,
      date_to: String(body.date_to || '').trim().slice(0, 10) };
    sh0.appendRow(head0.map(h => (h in rec0) ? rec0[h] : ''));
    return json_({ ok: true, state: 'pending',
      message: 'أُدرج النشاط في الوارد — يظهر على لوحة CPD كموعد مبدئي فور إدراجه في المنصة.' });
  }

  // ── the platform's embedded grid writes its rows back to the KPI's tab ──
  if (fn === 'writeKpi') {
    const tab = String(body.tab || '').trim();
    if (!tab) return json_({ ok: false, error: 'tab is required' });
    const labels = Array.isArray(body.labels) ? body.labels : [];
    const values = Array.isArray(body.values) ? body.values : [];
    const notes = Array.isArray(body.notes) ? body.notes : [];
    const ss = namedSS_('QAGC_KPI_SSID', 'مؤشرات الأداء — QAGC');
    ensureKpiTrigger_(ss.getId());
    const sh = ss.getSheetByName(tab);
    if (!sh) return json_({ ok: false, error: 'no such KPI tab' });
    const last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, 3).clearContent();
    if (labels.length) {
      sh.getRange(2, 1, labels.length, 3).setValues(labels.map((lb, i) =>
        [String(lb), values[i] === undefined || values[i] === '' ? '' : Number(values[i]), String(notes[i] || '')]));
    }
    PROPS.setProperty('KPI_STAMP_' + tab, new Date().toISOString());
    return json_({ ok: true, tab: tab, rows: labels.length });
  }

  // ── the annual plan, published as a live Google Sheet ──
  if (fn === 'exportPlan') {
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 200) : [];
    if (!rows.length) return json_({ ok: false, error: 'rows are required' });
    const ss = namedSS_('QAGC_PLAN_SSID', 'الخطة السنوية 2027 — QAGC');
    const head = ['المرجع', 'المستوى', 'الهدف', 'الصياغة الذكية', 'مؤشرات الأداء',
                  'المستهدف', 'المسؤول', 'من', 'إلى', 'الفئة', 'التقدم %'];
    const sh = tabOf_(ss, 'الخطة', head);
    sh.clearContents();
    sh.appendRow(head);
    sh.setFrozenRows(1);
    const data = rows.map(r => [r.ref || '', r.level || '', r.title || '', r.smart || '',
      r.kpi || '', r.target || '', r.owner || '', r.from || '', r.to || '', r.tag || '',
      r.progress === undefined ? '' : Number(r.progress)]);
    sh.getRange(2, 1, data.length, head.length).setValues(data);
    return json_({ ok: true, url: ss.getUrl(), rows: data.length,
      message: 'نُشرت الخطة في Google Sheets.' });
  }

  // ── a KPI gets its own tab; the owner edits readings in Sheets itself ──
  if (fn === 'kpiSheet') {
    const title = String(body.title || '').trim();
    if (!title) return json_({ ok: false, error: 'title is required' });
    const ss = namedSS_('QAGC_KPI_SSID', 'مؤشرات الأداء — QAGC');
    ensureKpiTrigger_(ss.getId());
    const tab = title.slice(0, 80);
    const existed = !!ss.getSheetByName(tab);
    const sh = tabOf_(ss, tab, ['الفترة', 'القيمة', 'ملاحظات']);
    if (!existed) {
      const labels = Array.isArray(body.labels) ? body.labels : [];
      const values = Array.isArray(body.values) ? body.values : [];
      const notes = Array.isArray(body.notes) ? body.notes : [];
      if (labels.length) {
        sh.getRange(2, 1, labels.length, 3).setValues(
          labels.map((lb, i) => [String(lb), values[i] === undefined ? '' : Number(values[i]), String(notes[i] || '')]));
      }
      if (body.unit || body.target !== undefined) {
        sh.getRange(1, 5).setValue('الوحدة: ' + (body.unit || '—') +
          (body.target !== undefined && body.target !== null ? ' · المستهدف: ' + body.target : ''));
      }
    }
    return json_({ ok: true, tab: tab, existed: existed,
      url: ss.getUrl() + '#gid=' + sh.getSheetId() });
  }

  // ── the platform posts its performance snapshot for the assistant to read ──
  if (fn === 'putSnapshot') {
    PROPS.setProperty('QAGC_SNAPSHOT', JSON.stringify(body.snapshot || {}));
    PROPS.setProperty('QAGC_SNAP_WHEN', new Date().toISOString());
    return json_({ ok: true });
  }

  // ── review notes: the platform pins them, the bridge carries them ──
  if (fn === 'addFeedback') return addFeedback_(body, null);
  // ── work mail: the daily lane — items routed to the person responsible ──
  if (fn === 'inboxAdd') {
    const it = body.item || {};
    if (!it.to || !it.quote) return json_({ ok: false, error: 'to and quote are required' });
    let id = String(it.id || '');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) id = 'IB' + Utilities.getUuid().slice(0, 8);
    const sh0 = isheet_(); const vals0 = sh0.getDataRange().getValues();
    for (let r0 = 1; r0 < vals0.length; r0++) {
      if (String(vals0[r0][0]) === id) return json_({ ok: true, id: id, duplicate: true });
    }
    isheet_().appendRow([id, String(it.when || new Date().toISOString()).slice(0, 16),
      it.kind === 'agenda' ? 'agenda' : 'note', String(it.to).slice(0, 12), String(it.toName || '').slice(0, 80),
      String(it.from || '').slice(0, 80), String(it.fromId || '').slice(0, 12),
      String(it.quote || '').slice(0, 300), String(it.note || '').slice(0, 1000),
      String(it.srcSid || '').slice(0, 24), String(it.srcRef || '').slice(0, 24), String(it.srcTk || '').slice(0, 120),
      0, '', '', '', 'new']);
    // optional email nudge: set QAGC_INBOX_MAIL in Script Properties to a mailbox the office watches
    try { const mailTo = PROPS.getProperty('QAGC_INBOX_MAIL');
      if (mailTo) MailApp.sendEmail(mailTo, 'بريد عمل جديد — ' + String(it.toName || ''),
        (it.kind === 'agenda' ? 'اقتراح لجدول أعمال' : 'ملاحظة') + ' إلى ' + String(it.toName || '') +
        ' من ' + String(it.from || '') + '\n«' + String(it.quote || '') + '»\n' + String(it.note || '') +
        '\nافتح المنصة: https://qagc-platform.github.io/app/');
    } catch (err) {}
    return json_({ ok: true, id: id });
  }
  if (fn === 'inboxList') {
    const vals = isheet_().getDataRange().getValues();
    const head = vals[0]; const items = [];
    for (let r = 1; r < vals.length; r++) {
      const o = {}; head.forEach((h, c) => o[h] = vals[r][c]); items.push(o);
    }
    return json_({ ok: true, items: items });
  }
  if (fn === 'inboxUpdate') {
    const id = String(body.id || '').trim();
    if (!id) return json_({ ok: false, error: 'id is required' });
    const sh = isheet_(); const vals = sh.getDataRange().getValues(); const head = vals[0];
    for (let r = 1; r < vals.length; r++) {
      if (String(vals[r][head.indexOf('id')]) === id) {
        const set = (col, v) => sh.getRange(r + 1, head.indexOf(col) + 1).setValue(v);
        if (body.opened !== undefined) set('opened', body.opened ? 1 : 0);
        if (body.openedAt) set('openedAt', String(body.openedAt).slice(0, 16));
        if (body.reply) { set('reply', String(body.reply).slice(0, 1000)); set('replyWhen', String(body.replyWhen || '').slice(0, 16)); }
        if (body.state) set('state', String(body.state).slice(0, 16));
        return json_({ ok: true, id: id });
      }
    }
    return json_({ ok: false, error: 'not found' });
  }
  if (fn === 'resolveFeedback') {
    const id = String(body.id || '').trim();
    if (!id) return json_({ ok: false, error: 'id is required' });
    const sh = fsheet_();
    const vals = sh.getDataRange().getValues();
    const head = vals[0];
    for (let r = 1; r < vals.length; r++) {
      if (String(vals[r][head.indexOf('id')]) === id) {
        sh.getRange(r + 1, head.indexOf('state') + 1)
          .setValue(body.state === 'kept' ? 'kept' : 'done');
        if (body.reply) sh.getRange(r + 1, head.indexOf('reply') + 1)
          .setValue(String(body.reply).slice(0, 1000));
        return json_({ ok: true, id: id });
      }
    }
    return json_({ ok: false, error: 'no such note' });
  }

  // ── the owner links (or unlinks) her personal calendar, from the platform ──
  if (fn === 'setDgCal') {
    const email = String(body.email || '').trim();
    if (!email) {
      PROPS.deleteProperty('QAGC_DG_CAL');
      return json_({ ok: true, cal: '', message: 'أُلغي الربط — يُستخدم تقويم حساب المنصة.' });
    }
    if (email.indexOf('@') < 0) return json_({ ok: false, error: 'ليس بريداً صالحاً' });
    const cal = CalendarApp.getCalendarById(email);
    if (!cal) return json_({ ok: false,
      error: 'التقويم غير متاح — هل شاركته المديرة مع حساب المنصة بصلاحية التعديل؟' });
    PROPS.setProperty('QAGC_DG_CAL', email);
    return json_({ ok: true, cal: cal.getName(), message: 'رُبط تقويم المديرة العامة.' });
  }

  // ── a coordinator schedules a meeting; it lands in the DG's calendar ──
  if (fn === 'addEvent') {
    const t = String(body.title || '').trim();
    const date = String(body.date || '').trim();
    const from = String(body.from || '').trim();
    const to = String(body.to || '').trim();
    if (!t) return json_({ ok: false, error: 'title is required' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json_({ ok: false, error: 'date must be YYYY-MM-DD' });
    if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) {
      return json_({ ok: false, error: 'from and to must be HH:MM' });
    }
    const start = new Date(date + 'T' + from + ':00');
    const end = new Date(date + 'T' + to + ':00');
    if (!(end > start)) return json_({ ok: false, error: 'to must be after from' });
    try {
      const cal = body.which === 'dir' ? dirCal_() : dgCal_();
      const desc = [String(body.note || '').trim(),
        'عبر منصة QAGC' + (body.who ? ' — ' + String(body.who).trim() : '')]
        .filter(Boolean).join('\n');
      const ev = cal.createEvent(t, start, end, {
        description: desc, location: String(body.loc || '').trim() });
      return json_({ ok: true, start: fmt_(ev.getStartTime()), end: fmt_(ev.getEndTime()),
        message: 'أُدرج الموعد في تقويم المديرة العامة.' });
    } catch (err) {
      return json_({ ok: false, error: String(err.message || err) });
    }
  }

  // ── the platform asks; ChatGPT reads the queue and writes the answer back ──
  if (fn === 'askAnalysis') {
    const kpi = String(body.kpi || '').trim();
    if (!kpi) return json_({ ok: false, error: 'kpi is required' });
    const sh1 = sheet_('analysis');
    const id = 'A' + (sh1.getLastRow());   // header is row 1, so ids start at A1
    sh1.appendRow([id, new Date().toISOString(), kpi,
      String(body.question || '').trim(), String(body.data || '').trim(), '', 'asked']);
    return json_({ ok: true, id: id, state: 'asked' });
  }
  if (fn === 'answerAnalysis') {
    const id = String(body.id || '').trim();
    const answer = String(body.answer || '').trim();
    if (!id || !answer) return json_({ ok: false, error: 'id and answer are required' });
    const sh2 = sheet_('analysis');
    const vals = sh2.getDataRange().getValues();
    const head2 = vals[0];
    for (let r = 1; r < vals.length; r++) {
      if (String(vals[r][head2.indexOf('id')]) === id) {
        sh2.getRange(r + 1, head2.indexOf('answer') + 1).setValue(answer);
        sh2.getRange(r + 1, head2.indexOf('state') + 1).setValue('answered');
        return json_({ ok: true, id: id, state: 'answered' });
      }
    }
    return json_({ ok: false, error: 'no such analysis id' });
  }

  if (fn !== 'addTask') return json_({ ok: false, error: 'unknown fn' });

  const title = String(body.title || '').trim();
  const tag = String(body.tag || '').trim();
  if (!title) return json_({ ok: false, error: 'title is required' });
  if (TAGS.indexOf(tag) < 0) {
    // the gate rule, enforced at the door: no tag, no entry
    return json_({ ok: false, error: 'tag must be one of: ' + TAGS.join(', ') });
  }

  // KPIs travel WITH their objective — one package, never separate pushes.
  let kpis = [];
  if (Array.isArray(body.kpis)) {
    kpis = body.kpis.slice(0, 10)
      .map(k => ({
        name: String((k && k.name) || '').trim(),
        target: String((k && k.target) || '').trim(),
        unit: String((k && k.unit) || '').trim(),
      }))
      .filter(k => k.name);
  }

  const sh = sheet_('inbox');
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const rec = {
    when: new Date().toISOString(),
    title: title,
    tag: tag,
    owner: String(body.owner || '').trim(),
    due: String(body.due || '').trim().slice(0, 10),
    budget: body.budget ? Number(body.budget) : '',
    note: String(body.note || '').trim(),
    state: 'pending',   // ChatGPT proposes; the Director General decides
    smart: String(body.smart || '').trim(),
    kpis: kpis.length ? JSON.stringify(kpis) : '',
    itype: 'package', venue: '', ctype: '', date_to: '',
    // what this push IS: an objective package, a simple task, or a meeting agenda
    kind: ['task', 'objective', 'agenda', 'pdp', 'digest', 'report'].indexOf(String(body.kind || '').trim()) >= 0
      ? String(body.kind).trim() : '',
  };
  sh.appendRow(head.map(h => (h in rec) ? rec[h] : ''));
  return json_({ ok: true, state: 'pending', kpis: kpis.length,
    message: 'أُدرجت الحزمة (الهدف ومؤشراته) في الوارد بانتظار اعتماد المدير العام.' });
}
