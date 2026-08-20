// QAGC Assistant API — the door ChatGPT knocks on.
//
// Deployed as an Apps Script web app under qagcplatform@gmail.com.
// ChatGPT (a Custom GPT with Actions) calls it to read the plan and to
// push tasks; everything pushed lands as PENDING — the approval gate is
// the platform's, never the assistant's.
//
// One-time setup, in the editor:
//   1. Run setup() once (authorize when asked).
//   2. View → Logs: copy the printed API key.
//   3. Deploy → New deployment → Web app →
//        Execute as: Me · Who has access: Anyone
//      Copy the /exec URL.

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

function sheet_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(['when', 'title', 'tag', 'owner', 'due', 'budget', 'note', 'state']);
  }
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
  const row = [
    new Date().toISOString(),
    title,
    tag,
    String(body.owner || '').trim(),
    String(body.due || '').trim(),
    body.budget ? Number(body.budget) : '',
    String(body.note || '').trim(),
    'pending'   // ChatGPT proposes; the Director General decides
  ];
  sheet_('inbox').appendRow(row);
  return json_({ ok: true, state: 'pending', message: 'أُدرجت في الوارد بانتظار اعتماد المدير العام.' });
}
