# OneDrive: автоматический импорт данных преподавателя

Преподаватель входит своим аккаунтом Microsoft и выбирает одну папку в OneDrive.
UniBridgeAI раз в 15 минут (и по кнопке «Sync now») проверяет эту папку через
Microsoft Graph. Новые и изменённые файлы попадают в список «на проверку» на
странице **University accounts**. Дальше работает уже существующая цепочка:
Accept → Extract (AI предлагает черновики записей) → Confirm. Ни одна запись не
появляется в профиле без подтверждения преподавателя.

```
OneDrive (папка преподавателя)
   │  Microsoft Graph, права только на чтение (Files.Read)
   ▼
onedrive.js: файл → текст (.xlsx .csv .docx .txt .md, до 5 МБ)
   ▼
browser_imports (origin = 'onedrive', status = 'pending')  ← повторно только если файл изменился (eTag)
   ▼
Accept → Extract → extraction_drafts → Confirm → publications / профиль
```

## Что нужно один раз: регистрация приложения в Microsoft Entra

Это делает владелец Microsoft-аккаунта или IT-отдел университета (для
университетских аккаунтов @astanait.edu.kz почти наверняка нужен администратор).

1. https://entra.microsoft.com → **App registrations** → **New registration**.
2. Name: `UniBridgeAI`. Supported account types:
   - только университет: *Accounts in this organizational directory only*;
   - любые рабочие/учебные аккаунты: *Accounts in any organizational directory*.
3. Redirect URI → платформа **Mobile and desktop applications** → добавить:
   - `http://localhost:5173/api/onedrive-callback` — разработка (`npm run dev:local`);
   - `http://localhost:3417/api/onedrive-callback` — десктоп-приложение.
4. После создания скопировать **Application (client) ID** и **Directory (tenant) ID**.
5. **API permissions** → Microsoft Graph → Delegated: `User.Read`, `Files.Read`,
   `offline_access`. Если пользователям нельзя давать согласие самим — администратор
   нажимает **Grant admin consent**.
6. **Authentication** → *Allow public client flows* = Yes (вход с PKCE без секрета).

Клиентский секрет не нужен. Он нужен только если выбрать платформу **Web** — тогда
секрет кладётся в `MS_CLIENT_SECRET`.

## Настройка UniBridgeAI

В файл `.env` в корне проекта (он не попадает в Git):

```
MS_CLIENT_ID=<Application (client) ID>
MS_TENANT=<Directory (tenant) ID или organizations>
```

Перезапустить `npm run dev:local`. Ключ шифрования `data/secret.key` создаётся сам.
На сервере (`npm run dev` / production) нужно также задать `UB_SECRET_KEY` — длинную
случайную строку — и `MS_REDIRECT_URI`, если адрес сайта не совпадает с `APP_ORIGIN`.

`UB_ONEDRIVE_SYNC_MINUTES` меняет интервал автосинхронизации (0 — только вручную).

## Безопасность и данные

- Права только на чтение собственных файлов пользователя (`Files.Read`), запись в
  OneDrive невозможна.
- Refresh-токен хранится в базе зашифрованным (AES-256-GCM); без ключа его не прочитать.
- Вход защищён PKCE и одноразовым `state` (10 минут).
- Синхронизируется только выбранная папка и её подпапки первого уровня, до 100 файлов
  за раз, каждый не больше 5 МБ.
- Отключение OneDrive удаляет токен и историю файлов; уже импортированные элементы
  на проверку остаются, их можно удалить вручную.
- Файлы с личными данными сотрудников и студентов можно обрабатывать только с
  разрешения университета. Облачную модель для извлечения выбирать только с согласия
  (интерфейс спрашивает об этом отдельно).

## Проверка без Microsoft

`apps/api/test/onedrive.test.js` подменяет серверы Microsoft и проверяет вход, выбор
папки, импорт, пропуск неподдерживаемых и больших файлов, повторную синхронизацию,
обновление изменённого файла и отключение.
