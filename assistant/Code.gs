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

const COLS = ['when', 'title', 'tag', 'owner', 'due', 'budget', 'note', 'state', 'smart', 'kpis'];

function sheet_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(COLS);
  }
  // a sheet created before the package columns existed gets them added in place
  const head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  COLS.forEach(c => {
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
  return json_({ ok: false, error: 'unknown fn' });
}

function doPost(e) {
  if (!authed_(e)) return json_({ ok: false, error: 'bad key' });
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) {
    return json_({ ok: false, error: 'body is not JSON' });
  }
  if ((body.fn || 'addTask') !== 'addTask') return json_({ ok: false, error: 'unknown fn' });

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
  };
  sh.appendRow(head.map(h => (h in rec) ? rec[h] : ''));
  return json_({ ok: true, state: 'pending', kpis: kpis.length,
    message: 'أُدرجت الحزمة (الهدف ومؤشراته) في الوارد بانتظار اعتماد المدير العام.' });
}
