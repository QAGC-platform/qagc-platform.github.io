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

const COLS = ['when', 'title', 'tag', 'owner', 'due', 'budget', 'note', 'state', 'smart', 'kpis', 'itype', 'venue', 'ctype', 'date_to'];
const ACOLS = ['id', 'when', 'kpi', 'question', 'data', 'answer', 'state'];
const CTYPES = ['lecture', 'workshop', 'webinar', 'forum'];

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

function doGet(e) {
  if (!authed_(e)) return json_({ ok: false, error: 'bad key' });
  const fn = (e.parameter.fn || 'ping');
  if (fn === 'ping') return json_({ ok: true, service: 'qagc-assistant', tags: TAGS });
  if (fn === 'objectives') return json_({ ok: true, objectives: OBJECTIVES });
  if (fn === 'inbox') {
    const rows = sheet_('inbox').getDataRange().getValues();
    const head = rows.shift();
    return json_({ ok: true, items: rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]]))) });
  }
  if (fn === 'calendar') {
    try {
      const days = Math.min(60, Math.max(1, Number(e.parameter.days || 14)));
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + days * 86400000);
      const cal = dgCal_();
      const items = cal.getEvents(start, end).slice(0, 100).map(ev => ({
        title: ev.getTitle(),
        start: fmt_(ev.getStartTime()),
        end: fmt_(ev.getEndTime()),
        allday: ev.isAllDayEvent(),
        loc: ev.getLocation() || '',
      }));
      return json_({ ok: true, cal: cal.getName(), tz: Session.getScriptTimeZone(), items: items });
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
  if (!authed_(e)) return json_({ ok: false, error: 'bad key' });
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) {
    return json_({ ok: false, error: 'body is not JSON' });
  }
  const fn = body.fn || 'addTask';

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
      const cal = dgCal_();
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
  };
  sh.appendRow(head.map(h => (h in rec) ? rec[h] : ''));
  return json_({ ok: true, state: 'pending', kpis: kpis.length,
    message: 'أُدرجت الحزمة (الهدف ومؤشراته) في الوارد بانتظار اعتماد المدير العام.' });
}
