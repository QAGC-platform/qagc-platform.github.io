# Testing the ChatGPT integration

The bridge runs ChatGPT → this API → the platform's inbox. Pending, always;
the approval gate stays the Director General's.

## 1 · Deploy the endpoint (once, ~5 minutes)
1. Signed in as qagcplatform@gmail.com, open https://script.new
2. Name the project `qagc-assistant`, replace the default code with `Code.gs`.
3. Run `setup()` once (authorize). Open the execution log: copy the **API key**.
4. Deploy → New deployment → **Web app** → Execute as **Me**, access **Anyone**.
   Copy the `/exec` URL.

## 2 · Smoke-test the endpoint (curl or browser)
`{URL}?key={KEY}&fn=ping` → `{"ok":true,…}`

## 3 · Wire ChatGPT (needs ChatGPT Plus)
1. ChatGPT → Explore GPTs → **Create**.
2. Instructions: paste `gpt-instructions.md` (insert the key).
3. Configure → **Actions → Create new action** → paste `openapi.yaml`
   with the deployment id inserted in `servers.url`.
4. Ask it: «اقترحي ثلاث مهام لهدف SO5 ثم ادفعي الأولى للمنصة».

Everything pushed lands in the sheet «QAGC Assistant — الوارد من ChatGPT»
in the account's Drive, state `pending`.
