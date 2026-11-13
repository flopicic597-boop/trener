# Структура кода и будуће надоградње

```
gotovo/
├─ index.html              улазна страница
├─ vite.config.js          израда + PWA (manifest, service worker, 'prompt' ажурирање)
├─ public/                 иконе (scripts/make-icons.mjs)
├─ src/
│  ├─ main.js              распоред, навигација, регистрација service worker-а
│  ├─ styles.css           изглед (по узору), свијетла/тамна тема
│  ├─ lib/util.js          датуми, бројеви (зарез/тачка), претрага ћир./лат.
│  ├─ data/                ПРИСТУП ПОДАЦИМА
│  │  ├─ db.js             шема IndexedDB и МИГРАЦИЈЕ (version 1, 2…)
│  │  ├─ repo.js           репозиторијум: једино мјесто које пише у базу
│  │  ├─ exercises-seed.js уграђена библиотека вјежби (стални id-ови)
│  │  └─ demo.js           пробни подаци (demo: 1)
│  ├─ domain/              ПОСЛОВНА ЛОГИКА (без базе и интерфејса)
│  │  ├─ rules.js          статуси, валидација, темпо, подразумијеване опције
│  │  ├─ membership.js     чланарина: период, статус истека, провјера уплате
│  │  ├─ findings.js       налази: каталог параметара, препознавање текста, поређење, напомене
│  │  └─ stats.js          обим, серије за графиконе, поређење периода, напредак
│  ├─ charts/charts.js     ГРАФИКОНИ (SVG) + табеларни приказ
│  ├─ io/                  УВОЗ/ИЗВОЗ
│  │  ├─ backup.js         JSON формат, провјера, спајање, снимци, замјена
│  │  └─ csv.js            CSV за Excel
│  └─ ui/                  ИНТЕРФЕЈС
│     ├─ core.js           статус чувања, модали, обавјештења
│     ├─ dialogs.js        избор вјежбе, нова вјежба, заказивање
│     ├─ download.js       преузимање и дијељење датотека
│     ├─ pdftext.js        читање текста из PDF налаза (pdf.js, учитава се по потреби)
│     └─ views/            странице: clients, client, session, programs,
│                          overview, progress, library, data, membership, findings
└─ tests/                  stats.test.js, data.test.js, membership-findings.test.js
```

## Модел података

| Табела | Садржај | Кључна поља |
|---|---|---|
| `clients` | клијенти | firstName, lastName, startDate, goal, note, phone?, email?, archived |
| `exercises` | библиотека | name, category, type (`load` / `bw` / `time`), builtin, archived |
| `programs` | шаблони | name, clientId (null = општи), items[{exerciseId, sets[{reps, weightKg, durationSec, tempo, restSec}]}] |
| `sessions` | планирани и изведени тренинзи | clientId, date, time, programId, programName, status, mood, sleep, note |
| `sessionExercises` | вјежбе у тренингу | sessionId, exerciseId, position, note |
| `sets` | појединачне серије | planReps / planWeightKg / planDurationSec (**план**), reps / weightKg / durationSec (**стварно**), tempo, restSec, done |
| `options` | изборне вриједности | паузе, темпо, сан, трајање, циљеви, категорије, трајање/износ/упозорење чланарине |
| `payments` | уплате чланарине | clientId, paidDate, amount (€), periodFrom, periodTo (закључно), method, note |
| `findings` | налази и анализе | clientId, date, kind (`body` / `lab` / `fitness` / `other`), title, values[{paramId, name, unit, value, refMin, refMax}], text, note |
| `attachments` | приложене датотеке налаза | findingId, clientId, name, mime, size, data (data: URL, до 15 MB) |
| `meta`, `syncBase`, `snapshots` | локално (не извози се) | датум копије, основа за спајање, снимци прије увоза |

Сваки синхронизовани запис има `id` (UUID), `createdAt`, `updatedAt` и `deleted` (меко брисање).
Планирани тренинг је `session` са статусом `planned`. При заказивању се програм **копира** у тренинг, па измјена шаблона не мијења сачуване тренинге. План и стварни резултат су у засебним пољима сваке серије.

## Правила за надоградње

1. **Шема базе:** у `src/data/db.js` додајте `db.version(N+1).stores({...}).upgrade(tx => …)`. Постојеће верзије се никад не мијењају. Повећајте `SCHEMA_VERSION`. Додајте тест миграције по узору на „v1 → v2“ у `tests/data.test.js`.
2. **Формат извоза:** ако се структура промијени, повећајте `FORMAT_VERSION` у `src/io/backup.js` и допуните `migrateBackup()`, тако да се старије датотеке и даље увозе.
3. **Нови параметар тренинга** (нпр. пулс): поље у `sessions` или `sets` + валидација у `domain/rules.js` + поље у `ui/views/session.js` + колона у `io/csv.js` + миграција ако треба подразумијевана вриједност.
4. **Облачна синхронизација / више тренера:** интерфејс користи само `repo` (`src/data/repo.js`). Друга имплементација истог интерфејса може разговарати са API-јем. Стални UUID-ови, `updatedAt`, `deleted` и логика спајања у `io/backup.js` већ постоје као основа. За више тренера потребно је поље `trainerId` и сервер са пријавом, што захтијева надоградњу кода.
5. **Нови параметар налаза** (нпр. нови лабораторијски показатељ): ред у `PARAMS` у `src/domain/findings.js` са **новим** `id`-ом, смјером (`down`/`up`/`range`/`goal`/`none`), оријентационим опсегом, називима за препознавање текста и напоменама. Корисник иначе може унијети било који параметар као „Друго (свој назив)“.
6. **Нова вјежба у уграђеној библиотеци:** додајте ред у `exercises-seed.js` са **новим** id-ом. При покретању се додају само вјежбе које недостају, без преписивања корисничких измјена.

## Шта корисник мијења сам, без надоградње

Клијенти, вјежбе (назив, категорија, начин мјерења), програми, тренинзи, као и изборне вриједности: брзе паузе, темпо, сан, трајање, циљеви и категорије (*Подаци и копије → 7*).
Нова поља, нови графикони, синхронизација, PIN/шифровање и више корисника захтијевају **надоградњу кода**.
