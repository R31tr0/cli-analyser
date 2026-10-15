# CLI Code Analyser
<p align="center">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Tree--sitter-WebAssembly-5E9CA0?style=flat" alt="web-tree-sitter">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D20-brightgreen?style=flat&logo=node.js&logoColor=white" alt="Node.js 20 or newer">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License">
  <img src="https://img.shields.io/badge/Google%20GenAI-Gemini%203.5-blue.svg" alt="Google GenAI">
</p>

[English](#english) | [Русский](#russian)

## English

CLI Code Analyser is a command-line developer assistant built with Node.js and Google Gemini. In addition to chat, architecture and log analysis, the tool locally finds structurally similar functions to help spot potential legacy code. Gemini is used to check selected pairs.

I built this CLI because of a constant pain point of mine. After not finding the solutions I needed, I started writing my own.

I hope it helps you in your everyday development and proves useful, because I tried to address a real pain point in the day-to-day development of long-running projects.

## Commands

In interactive mode, you can ask regular questions about code or use commands:

| Input | Action |
| --- | --- |
| `-scan` or `-s` | Request an analysis of the project architecture |
| `-log`, `-logs`, or `-l` | Suggest a command to run, ask for confirmation, run it, and send its output to Gemini |
| `-m` or `-model` | Show the model list; enter `-m <name or ID>` to select one |
| `-help` or `-h` | Show the available help |

### `-scan` — on-demand architecture analysis

The `-scan` or `-s` command is a request to Gemini. The CLI creates an architectural description of the project and passes it to the model to receive a description of the structure and recommendations. It runs at the user's request and is intended to analyze the project as a whole.

### `-log` — run the project and analyze its output

The `-log`, `-logs`, or `-l` command asks Gemini to suggest a command for running the project. The CLI displays it and waits for the user's confirmation; after confirmation, it runs the command, collects terminal output, and sends it to Gemini for explanation. The command is not run without confirmation.

### Local scanner — background function-table collection

The local scanner is a separate automatic mechanism, not the `-scan` command. In interactive mode, it starts when the CLI launches and watches for source-file changes. It builds a function table locally with AST features and hashes, while the comparator selects similar pairs. Only the code of pairs that pass the Jaccard threshold is sent to Gemini to check whether they have the same purpose.

In short: `-scan` is not the same as the local scanner: the regular scan sends Gemini a request for an architecture overview and does not have access to files or code; the local scanner updates the function table to find similar code; `-log` runs a command confirmed by the user and sends its output to the model.

## How local analysis works

The goal of local analysis is to help find possible duplication and legacy code that can easily be missed in a large project. The parser builds a function table, and the comparator selects structurally similar pairs for additional checking.

In interactive mode, when the CLI starts, it scans the project, parses supported source files through `web-tree-sitter`, and saves a function table to `.dev-tools-cache.json` in the project root. The scanner then watches for file changes. After a source file is saved, the table is rebuilt, and changed functions are compared with other functions in the project.

For each recognized function, the parser collects:

- the function name and file path;
- the start and end lines and the number of lines;
- `hash` — the SHA-256 hash of the function's source text, used to detect changes;
- `structuralHash` — the SHA-256 hash of the sequence of AST node types;
- `nodeVector` — the count of each node type in the function's AST;
- `dependencies` — recognized function calls;
- `codeSnippet` — the function's source code.

The table is stored locally; the lines and fields needed for comparison are written to the cache. The `.dev-tools-cache.json` file is added to `.gitignore`.

### Jaccard formula

A weighted version of the Jaccard formula is used to initially select similar functions:

Each pair of functions is compared separately using two sets of features:

1. AST node types and their frequency, for example `node:if_statement`.
2. Call names from `dependencies`, for example `dependency:Math.floor`.

For each feature, the minimum frequency is used for the intersection and the maximum for the union. The coefficient is calculated as follows:

$$
J(X, Y) = \frac{\sum \min(f_1, f_2)}{\sum \max(f_1, f_2)}
$$

The result ranges from `0` to `1`. `0` means there are no shared features, while `1` means the feature sets are identical. The `0.5` threshold is a **structural filter for selecting candidates**, not a 50-percent probability that the functions have the same purpose: the formula does not understand code meaning.

- If the cache is empty, all unique function pairs are iterated over.
- In subsequent scans, pairs are considered if at least one function is new or its `hash` has changed.
- If a pair's coefficient is equal to or greater than `0.5`, Gemini receives the function names and paths, comparison instructions, and the source code of both functions.
- Gemini's response is printed in the terminal if it begins with “Yes”. “No” responses are not displayed.

Changing one function can produce many candidates: it is compared with each other function, but the coefficient is calculated independently for each pair. A deleted function is removed from the next table, but no separate comparison is run for deleted functions.

> **Important:** On the first run in a large project, there may be many pairs and Gemini requests. A configured Google API key and access to Gemini are required for analysis. If the key or network is unavailable, the comparison request will fail; the function table will still be saved. After that, unchanged pairs will not be checked again automatically. To repeat the full analysis, delete `.dev-tools-cache.json` and restart the CLI.

### Supported extensions

The scanner searches for files with the following extensions:

| Language | Extensions |
| --- | --- |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` |
| TypeScript | `.ts`, `.tsx` |
| Python | `.py` |
| C | `.c`, `.h` |
| C++ | `.cpp`, `.cc`, `.cxx`, `.hpp` |
| C# | `.cs` |
| Go | `.go` |

Parsing uses the wasm grammars from the `tree-sitter-wasms` package. Supporting an extension means that the file is passed to the parser; the function constructs recognized for each language depend on its grammar.

## Installation and startup

Node.js 20 or newer is required.

```bash
git clone https://github.com/R31tr0/cli-analyser.git
cd cli-analyser
npm install
```

Run from the project directory:

```bash
node src/index.js
```

For global use, link the package:

```bash
npm link
cli-analyser
```

On the first launch, the CLI will prompt you to configure a Google Gemini API key. The key is required for Gemini responses and for analyzing function pairs that pass the Jaccard filter.

You can also run a command directly by passing it after `run`:

```bash
cli-analyser run npm test
```

Before running a command suggested in log mode, the CLI displays it and asks for confirmation.

## Privacy and data

The scanners do not traverse the `.git`, `.next`, `.nuxt`, `.turbo`, `coverage`, `dist`, `node_modules`, `out`, `vendor`, and `.env` directories. Files with the `.pem`, `.key`, `.p12`, and `.pfx` extensions, as well as filenames containing `secret` or `credential`, are not analyzed.

Source files are first read and analyzed locally. When comparing, only the snippets of the two candidate functions, their keys (path and name), and the comparison instructions are sent to Gemini; the entire project contents are not sent in this request. However, the `.dev-tools-cache.json` cache contains function source code — do not publish it, or use it with caution if the project contains confidential code.

I also want to draw special attention to the `.gitignore` file: it is advisable to configure it before using the project and add `.dev-tools-cache.json` to it in advance.

## Gemini models

The CLI provides:

- Gemini 3.5 Flash Lite (default model)
- Gemini 3.6 Flash
- Gemini 3.1 Flash Lite
- Gemini 3.5 Flash
- Gemini 3.7 Flash

## Request limits and accuracy

The local parser analyzes project files without sending source code to Gemini. The model is called only for function pairs that pass the structural Jaccard filter; the request includes the code of those two functions, their names and paths, and a short comparison instruction. This limits the amount of data sent and token usage, but does not eliminate them: on the first run, all function pairs are compared, and a large number of functions may produce many qualifying pairs. In subsequent scans, only pairs involving a new or changed function are checked.

The Jaccard coefficient is only a preliminary filter, not the probability that Gemini is correct. The accuracy of the model's responses has not been measured as a percentage for this project, so a reliable hit rate cannot be stated. Gemini can be wrong and say that functions perform the same task when they do not, or vice versa. You should verify the result yourself.

<a id="russian"></a>

## Русский

CLI Code Analyser — консольный помощник разработчика на Node.js и Google Gemini. Помимо чата, анализа архитектуры и логов, инструмент локально ищет структурно похожие функции, чтобы помогать замечать потенциальный легаси-код. Для проверки выбранных пар используется Gemini.

лично я строил этот cli из за моей вечной головной боли и не найдя нужных мне решений я принялся за насписание своего 

я надеюсь он поможет и вам в повседневной разработке и будет правда нужен и полезен тк как я пытался разобрать реальную боль повседневной разработки долгих проектов 





## Команды

В интерактивном режиме можно писать обычные вопросы о коде или использовать команды:

| Ввод | Действие |
| --- | --- |
| `-scan` или `-s` | Запросить анализ архитектуры проекта |
| `-log`, `-logs` или `-l` | Предложить команду запуска, запросить подтверждение, запустить её и передать вывод Gemini |
| `-m` или `-model` | Показать список моделей; для выбора ввести `-m <название или ID>` |
| `-help` или `-h` | Показать доступную справку |



### `-scan` — анализ архитектуры по запросу

Команда `-scan` или `-s` — это запрос к Gemini. CLI формирует архитектурное описание проекта и передаёт его модели, чтобы получить описание структуры и рекомендации. Она запускается по запросу пользователя и предназначена для анализа проекта в целом.

### `-log` — запуск проекта и анализ вывода

Команда `-log`, `-logs` или `-l` просит Gemini предложить команду запуска проекта. CLI показывает её и ждёт подтверждения пользователя; после подтверждения запускает команду, собирает вывод терминала и отправляет его Gemini для объяснения. Без подтверждения команда не выполняется.

### Локальный сканер — фоновый сбор таблицы функций

Локальный сканер — отдельный автоматический механизм, а не команда `-scan`. В интерактивном режиме CLI он запускается при старте и отслеживает изменения исходных файлов. Он локально строит таблицу функций с AST-признаками и хешами, а компаратор выбирает похожие пары. Только для пар, прошедших порог Жаккара, код двух функций отправляется Gemini для проверки на совпадение задач.

Итого: `-scan` не одно и то же что локальный сканер обычный скан  отправляет Gemini запрос на обзор архитектуры и не имеет доступа к файлам и коду ; а локальный сканер обновляет таблицу функций для поиска похожего кода; `-log` запускает подтверждённую пользователем команду и отправляет модели её вывод.



## Как устроен локальный анализ

Цель локального анализа — помогать находить возможное дублирование и легаси-код, которые легко пропустить в большом проекте. Парсер строит таблицу функций, а компаратор отбирает структурно похожие пары для дополнительной проверки.

В интерактивном режиме при старте CLI сканирует проект, разбирает поддерживаемые исходные файлы через `web-tree-sitter` и сохраняет таблицу функций в `.dev-tools-cache.json` в корне проекта. Затем сканер следит за изменениями файлов. После сохранения исходника таблица пересобирается, а изменившиеся функции сравниваются с другими функциями проекта.

Для распознанной функции парсер собирает:

- имя функции и путь к файлу;
- начальную и конечную строки, число строк;
- `hash` — SHA-256 исходного текста функции, чтобы находить изменения;
- `structuralHash` — SHA-256 последовательности типов узлов AST;
- `nodeVector` — количество узлов каждого типа в AST функции;
- `dependencies` — распознанные вызовы функций;
- `codeSnippet` — исходный код функции.

Таблица хранится локально; строки и поля, нужные для сравнения, записываются в кэш. Файл `.dev-tools-cache.json` добавлен в `.gitignore`.

### Формула Жаккара
Для первичного отбора похожих функций используется взвешенный вариант формулы Жаккара:

Для каждой пары функций отдельно сравниваются два набора признаков:

1. Типы узлов AST с их частотой, например `node:if_statement`.
2. Имена вызовов из `dependencies`, например `dependency:Math.floor`.

Для каждого признака берётся минимальная частота в пересечении и максимальная — в объединении. Коэффициент считается так:

$$
J(X, Y) = \frac{\sum \min(f_1, f_2)}{\sum \max(f_1, f_2)}
$$

Результат находится от `0` до `1`. `0` означает, что общих признаков нет, а `1` — что наборы признаков совпадают. Порог `0.5` означает **структурный фильтр для отбора кандидатов**, а не 50-процентную вероятность одинакового назначения: формула не понимает смысл кода.

- При пустом кэше перебираются все уникальные пары функций.
- При последующих сканированиях рассматриваются пары, в которых хотя бы одна функция новая или её `hash` изменился.
- Если коэффициент пары равен или выше `0.5`, Gemini получает имена и пути функций, инструкцию сравнения и исходный код обеих функций.
- В терминал выводится ответ Gemini, начинающийся с «Да». Ответы «Нет» не показываются.

Изменение одной функции может создать много кандидатов: она сравнивается с каждой другой функцией, но коэффициент вычисляется независимо для каждой пары. Удалённая функция убирается из следующей таблицы, но отдельное сравнение для неё не запускается.

> **Важно:** на первом запуске в большом проекте может быть много пар и запросов к Gemini. Для анализа нужен настроенный Google API key и доступ к Gemini. Если ключ или сеть недоступны, запрос сравнения завершится ошибкой; таблица функций всё равно сохраняется. После этого неизменившиеся пары не будут повторно проверены автоматически. Чтобы повторить полный анализ, удалите `.dev-tools-cache.json` и перезапустите CLI.

### Поддерживаемые расширения

Сканер ищет файлы со следующими расширениями:

| Язык | Расширения |
| --- | --- |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` |
| TypeScript | `.ts`, `.tsx` |
| Python | `.py` |
| C | `.c`, `.h` |
| C++ | `.cpp`, `.cc`, `.cxx`, `.hpp` |
| C# | `.cs` |
| Go | `.go` |

Для разбора используются wasm-грамматики пакета `tree-sitter-wasms`. Поддержка расширения означает, что файл передаётся парсеру; состав конструкций функций, распознаваемых в конкретном языке, зависит от грамматики.

## Установка и запуск

Требуется Node.js 20 или новее.

```bash
git clone https://github.com/R31tr0/cli-analyser.git
cd cli-analyser
npm install
```

Запустить из каталога проекта:

```bash
node src/index.js
```

Для глобального запуска можно связать пакет:

```bash
npm link
cli-analyser
```

При первом запуске CLI предложит настроить Google Gemini API key. Ключ нужен для ответов Gemini и анализа пар функций, прошедших фильтр Жаккара.


Также можно запустить команду напрямую, передав её после `run`:

```bash
cli-analyser run npm test
```

Перед запуском предложенной для режима логов команды CLI показывает её и запрашивает подтверждение.

## Приватность и данные

Сканеры не обходят каталоги `.git`, `.next`, `.nuxt`, `.turbo`, `coverage`, `dist`, `node_modules`, `out`, `vendor` и `.env`. Не анализируются файлы с расширениями `.pem`, `.key`, `.p12`, `.pfx`, а также имена файлов, содержащие `secret` или `credential`.

Исходники сначала читаются и анализируются локально. При сравнении Gemini отправляются только фрагменты двух функций-кандидатов, их ключи (путь и имя) и инструкция сравнения; содержимое всего проекта для этого запроса не отправляется. Тем не менее кэш `.dev-tools-cache.json` содержит исходный код функций — не публикуйте его,или используйте с осторожностью если в проекте есть конфиденциальный код.

отдельное внимание хочу уделить файлу .gitignore желательно настоить его перед использованием проекта и сли и заранее поместить туда .dev-tools-cache.json

## Модели Gemini

В CLI доступны:

- Gemini 3.5 Flash Lite (модель по умолчанию)
- Gemini 3.6 Flash
- Gemini 3.1 Flash Lite
- Gemini 3.5 Flash
- Gemini 3.7 Flash

## Лимиты запросов и точность

Локальный парсер анализирует файлы проекта без отправки исходников Gemini. Модель вызывается только для пар функций, прошедших структурный фильтр Жаккара; в запрос включаются код этих двух функций, их имена и пути, а также короткая инструкция сравнения. Это ограничивает объём передаваемых данных и расход токенов, но не исключает их полностью: на первом запуске сравниваются все пары функций, и при большом количестве функций подходящих пар может быть много. На последующих сканированиях проверяются только пары с новой или изменённой функцией.

Коэффициент Жаккара — только предварительный фильтр, а не вероятность того, что Gemini прав. Точность ответов модели в процентах для этого проекта не измерялась, поэтому достоверный процент попадания назвать нельзя. Gemini может ошибиться и сказать, что функции выполняют одну задачу, хотя это не так, или наоборот. Результат следует проверять самостоятельно.
