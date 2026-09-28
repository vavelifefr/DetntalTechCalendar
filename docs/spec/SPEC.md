# Functional Specification

Requirement IDs are stable. Do not renumber existing IDs after implementation begins.

This specification and `BUSINESS_RULES.md` were reconciled with the current web implementation and schema version 10 on 2026-09-26. For already implemented behavior, the app is the compatibility baseline; historical prompts are not normative. Future intentional changes must update requirements and acceptance criteria before implementation.

## Core terms

- **Order / Заказ** — the top-level record shown on the Calendar and the application's unit of accounting. It can identify one patient and at most one Doctor, has at most one common delivery deadline, and contains one or more WorkItems. Patient, Doctor, and deadline are required by default; Settings can change requiredness.
- **WorkItem / Работа в заказе** — one specific type of fabrication or service within an Order, such as repair, metal-ceramic, or zircon. An Order can contain several WorkItems; completing one does not create a Calendar entry or close/account for the whole Order.
- In the interface, creating the top-level record is **«Новый заказ»**. Adding a child item is **«Добавить работу»**. Use «заказ» for the Calendar/accounting record and «работа» only for an item inside it.

## UI — Shared presentation rules

### UI-001 — Order of action buttons in a row

Whenever action buttons share one horizontal row, arrange them from left to right by their existing visual color: red, neutral white, blue, then green. Apply this order across all screens, including status actions, debt actions, confirmation dialogs, and inline edit/delete controls. This rule changes placement only: button colors, labels, functions, and vertical ordering remain unchanged. Buttons with the same color keep their existing relative order.

---

## AND — Android platform

### AND-001 — Android uses the local database

The Android application stores and reads its data in the device's local SQLite database. Core application flows must not require Fastify, an internet connection, a cloud service, or an external database server.

### AND-002 — Shared application boundary

Screens call application operations through platform-independent application interfaces. They must not call Fastify routes or platform-specific database APIs directly. Web and Android provide separate adapters for those interfaces while preserving the accepted application behavior.

### AND-003 — Calendar startup data

On startup, the Calendar receives active Orders, Doctors, Pricing entries, and required-field settings from the active local database through the application boundary. An empty database is a valid startup state.

The web adapter may obtain this snapshot through the local Fastify API. The Android adapter must obtain equivalent data through Android-local persistence.

---

## NAV — Navigation

### NAV-001 — Calendar is the home screen

After splash/startup the application opens the Calendar.

### NAV-002 — Return to Calendar

Secondary screens return to the Calendar through the header's `Домой` action. Do not show a duplicate `Календарь` text button directly below the app header.

### NAV-003 — Main menu

The main menu contains only these sections, in this order:

- Archive
- Statistics
- Debts
- Pricing
- Settings
- О программе

Calendar is the home screen and is not listed in the main menu; the header Home action returns to it. New Order and the list of open Orders are available from the Calendar: the New Order action is below the month grid, and the interactive list of open Orders is below that action. Selecting an Order opens it for editing. New Order and Active Orders are not separate main-menu sections.

### NAV-004 — Home shortcut

Every screen other than the Calendar page, including New Order and Order editing, displays a `Домой` button beside the main-menu button. Activating it returns to the Calendar. The `Домой` button is hidden on the Calendar page.

### NAV-005 — About the application

The `О программе` main-menu section shows a brief application description, the current application version, and the author name `vave`.

---

## CAL — Calendar

### CAL-001 — Orders on Calendar

Orders are displayed on their single common deadline date/time.

### CAL-002 — Calendar actions

The Calendar does not provide a separate `Ближайший заказ` action. The Order list below the Calendar already presents open Orders. The New Order action appears below the month grid.

### CAL-003 — Due today or overdue

The date taken from the operating system is marked green on the Calendar. An open Order due today or earlier marks its deadline date red; closed/cancelled Orders never cause a red mark. Due and overdue Orders are accompanied by an in-app missed-deadline message.

### CAL-004 — Overdue

The red missed-deadline state applies only while the Order is open. If the user moves its deadline to a future date or closes/cancels it, the red marking and missed-deadline message are removed. When today's date also has an open Order due today, the date cell is red and today's date number retains its green marker.

### CAL-005 — Change deadline

An active Order may have its single deadline changed.

Changing the deadline does not create a new Order. The user may close the Order manually or move its deadline to a future date.

### CAL-006 — Calendar event type

The Calendar marks Order deadline dates only. WorkItem start/completion dates are not separate Calendar events.

### CAL-007 — Select a date and create an Order

The month grid allows the user to select a date. Hide the New Order action while no date is selected. With a selected date, show the action directly below the grid as `Новый заказ к : <date>`. Activating it opens the New Order form and pre-fills the common deadline with the selected date. The deadline remains editable in the form. The main menu remains in the header; other Calendar actions appear below the month grid.

### CAL-008 — Calendar Order lists

The Order list appears below the Calendar grid and, when shown, below the New Order action.

- Clicking the selected date again clears the selection. With no selected date, show `Сводка по текущим заказам` with all open Orders. Each interactive row shows the deadline, patient label, Doctor, WorkItem list, and provisional balance (`income - expenses`).
- With a selected date that has matching Orders, show `Активные заказы (<date>)` and only open Orders whose common deadline falls on that exact date. Do not include Orders merely because the selected date lies between their start and closure dates. If no open Order is due that date, hide this entire list and totals section.
- After the selected-date Order rows, show a divider and a summary with the Order count, total income, total expenses, and net (`income - expenses`). Open Orders cannot have debt, so debt is not part of this Calendar summary.
- Selecting a row opens that Order in edit mode. This behavior applies to Order rows in every list, including Archive.

---

## ORD — Orders

### ORD-001 — Immutable internal identity

Every Order has an immutable internal ID.

Changing doctor, patient label, deadline, work composition or financial values does not change this ID.

### ORD-002 — One common deadline

An Order has at most one common deadline shared by all its WorkItems. The deadline is required by default; Settings can change requiredness.

WorkItems do not have independent deadlines.

### ORD-003 — Minimal patient data

An Order may store a patient label/identifier. The field is required by default; Settings can change requiredness.

A full patient card is not required.

### ORD-004 — Doctor relation

An Order references a Doctor from the user-managed directory where applicable.

The Doctor may be changed while the Order remains the same Order.

### ORD-005 — Multiple WorkItems

An Order contains one or more WorkItems.

### ORD-006 — Add WorkItem to active Order

A new WorkItem may be added to an already active Order, including after other WorkItems have been completed/cancelled.

Examples:
- переделка;
- подгонка;
- additional prosthetic task.

### ORD-007 — WorkItem production status

Each WorkItem has an independent production status at minimum:

- active;
- completed;
- cancelled.

Changing WorkItem status does not automatically close the Order.

### ORD-008 — Last active WorkItem

Completing all WorkItems does not close the Order. The Order is closed only after the user explicitly chooses the close action.

The application may suggest closing the Order when all WorkItems are complete, but must wait for explicit user confirmation.

### ORD-009 — New Order defaults

The Order has one editable business date: the date it was received, shown as `Старт заказа`. It defaults to the current date and may be changed freely, including to a date in the past.

The Order does not store a separate `created_at` date. The edited `Старт заказа` value is the Order's sole acceptance/start date.

If the common deadline is earlier than `Старт заказа`, the form warns that the dates are inconsistent and offers to make it a one-day Order by setting the deadline to the start date. If the user accepts, the form applies that correction. If the user declines, it returns to Order editing without saving. The invalid date pair cannot be saved unchanged. Other dates in past periods are allowed.

### ORD-010 — WorkItem production dates

Each WorkItem may preserve its production start date and its completion/cancellation date for Archive search and statistics. Multiple WorkItems may share the same start date or the same end date. These dates do not create Calendar markers; Calendar shows Order deadlines only.

### ORD-011 — Minimum editable WorkItem

An Order's first WorkItem requires a work type/name. Quantity defaults to one in the simple editor. Shade and comment are optional.

### ORD-012 — New Order form

New and existing Orders use the same Order card layout and represent the same Order entity. In new mode, `Старт заказа` defaults to today and other order fields begin empty; when opened from a selected Calendar date, the common deadline is prefilled as specified in CAL-007. In edit mode, the same card is populated from the saved Order. Creation, saving, and lifecycle actions may differ by mode.

The form displays the immutable Order ID in a read-only field. It collects Doctor, patient label, `Старт заказа`, and the common deadline. The WorkItem section starts with `Работы (0)` and no expanded work form. `Добавить работу` opens the complete WorkItem form. Saving the form adds the WorkItem to the new Order draft as a compact card showing its name and accepted cost; the WorkItem and Order are written to SQLite when `Сохранить заказ` succeeds. At least one saved WorkItem is required to create the Order.

Doctor choices come from the directory. The last choice, `Своё`, opens the same fields as Doctor creation in Settings. After confirmation, the new Doctor is added to the directory and selected for the Order.

Patient label is entered as free text and is not added to a directory.

Each standard WorkItem selects its name from Pricing. The Pricing item controls whether `Нумерация` and `Цвет` appear in the Order editor. When numbering is enabled, the selector defaults to `FDI`; `По номерам` accepts a comma-separated list of permanent FDI tooth codes. Both entry modes produce the same validated `tooth_codes` list and set units to its length. Invalid or duplicate codes block saving. When numbering is disabled for a `PER_UNIT` item, hide the numbering controls and show `Количество` instead; it defaults to 1, accepts positive whole numbers, and drives the unit-price calculation. A fixed-price item without numbering has no quantity field. `Фиксированная услуга` has no tooth selection. `Стоимость работы` starts from the live Pricing calculation and remains editable; only this accepted amount is stored and used for income/balance. The gray `Расчётная стоимость` hint exists only while the form is open and is not stored. When the accepted amount differs from the hint, the field caption reads `Стоимость работы (Изменено)`. WorkItem fields and selectors render below their captions. A WorkItem may use a directory color or manually entered color. The Order-level comment is limited to 300 words.

### ORD-013 — Deadline earlier than start

When the common deadline is earlier than `Старт заказа`, offer to make the Order last one day by setting the deadline to `Старт заказа`. Accepting applies the correction; declining returns to editing and does not save the Order.

### ORD-014 — Edit an Order at any stage

An Order opened from any Order list is shown in the same card layout as a new Order, populated with saved values. Active, closed and cancelled Orders remain editable. For a closed or cancelled Order, all Order card and WorkItem data, including the business closure date, may be edited. The Order's immutable ID and lifecycle status cannot be changed by editing. The closure date must still not precede `Старт заказа`. Saved changes appear in Archive; Statistics continues to use its last calculated snapshot until the user chooses `Обновить и пересчитать`.

In an active Order, each WorkItem can be changed to either of its two other statuses using the status buttons. Reopening a completed or cancelled WorkItem sets it to `ACTIVE`, clears its completion/cancellation date, and preserves its start date. Setting it to `COMPLETED` or `CANCELLED` records today's date for the selected terminal status and clears the other terminal date. Status changes refresh the WorkItem counts, provisional Order totals, and Calendar summary without closing the Order. Closed or cancelled Orders continue to use the editable status/date fields described below.

For a closed or cancelled Order, a WorkItem's status and production dates may also be corrected. A completed WorkItem requires a completion date; a cancelled WorkItem requires a cancellation date; an active WorkItem has neither terminal date. These edits never change the Order's lifecycle status or ID. The current Pricing calculation is a form-only hint; it is neither stored nor used to recalculate a saved accepted amount.

When editing an existing Order, `Сохранить заказ` saves the Order and keeps the user on the same card. `Сохранить и выйти` saves the Order and returns to Calendar. Both actions use the same validation and saved data.

### ORD-015 — Unique work outside Pricing

In the Order editor, `Уникальная работа` opens a compact form with only a required work name and cost. A unique WorkItem has no Pricing position and does not use tooth selection or quantity calculation. Its manually entered cost is stored as the accepted WorkItem amount and is included in work-based totals only while the WorkItem is not cancelled. Existing unique WorkItems can be renamed and repriced through the same form.

### ORD-016 — Order editor work and expense layout

The WorkItem section displays `Работы (<count>)` and status counts: active items as `Открыто`, completed items as `Закрыто`, and cancelled items separately as `Отменено`. A new Order's saved draft items are all counted as open. Existing WorkItems start collapsed into summary cards colored by status: blue for active, green for completed, and red for cancelled. Cards show only the work name and accepted cost. Selecting a card expands its complete editable form. Only one WorkItem form is open at a time. The `Добавить работу` button opens the same complete form for a new WorkItem; it appears when no WorkItem form is open. In an active Order, the expanded WorkItem shows exactly two status buttons, excluding its current status. Their left-to-right order follows UI-001: for `ACTIVE`, red `Отменено` then green `Выполнено`; for `COMPLETED`, red `Отменено` then blue `В работе`; for `CANCELLED`, blue `В работе` then green `Выполнено`. Selecting a status saves it immediately and refreshes the status counts and provisional summaries. At the bottom of every expanded WorkItem form, `Удалить` is aligned left, `Отмена` is centered, and `Сохранить` is aligned right. `Отмена` discards unsaved changes to the expanded WorkItem and collapses its editor; for a new draft WorkItem, it discards the unsaved draft without changing previously saved WorkItems. Saving validates the WorkItem, then collapses it into a summary card. In a new Order, this saves to the form draft until the entire Order is saved; in an existing Order, it immediately saves to the database. Deleting asks `Удалить текущую работу?` with red `Да` before neutral `Нет`, following UI-001; confirming removes only that WorkItem and collapses the form. Saving the Order while a WorkItem form is open is blocked until the WorkItem is saved, deleted, or canceled.

Cancelled WorkItems remain visible for information and are included in the `Отменено` count, but their accepted amounts are excluded from the Order's work-income subtotal and provisional balance. Only completed WorkItems contribute to the closure expected amount. A closed Order's actual income remains the amount received at closure plus debt repayments; editing WorkItem data does not rewrite that receipt.

The expense section follows the WorkItem section and displays `Расходы (<count>)`, counting saved expense entries. Expense entries start collapsed as red cards showing only the expense name and total amount. Selecting a card opens its editable form, with delete and save actions. Only one expense form is open at a time. `Добавить к расходам` opens a form for a new entry. The user selects an active expense item from the `Расходы` section of Pricing. `Издержки` is prefilled from that Pricing item's current unit price but remains editable; when the Pricing price is unset, this required field starts blank. `Количество` defaults to 1, and `Комментарий` is optional. A red read-only total is recalculated as unit cost multiplied by quantity. Saving preserves the unit cost, quantity, expense name, and total as values from the time of the expense; later Pricing changes do not alter saved Orders. The total is the amount included in the Order's expenses and balance. Saving the Order while an expense form is open is blocked until it is saved or cancelled.

### ORD-017 — Permanently delete an Order

The Order editor and expanded Archive card provide `Удалить заказ` for active, closed, and cancelled Orders. It opens an in-app confirmation with the text `Вы уверены, что хотите удалить заказ?` and `Все данные заказа будут удалены.` and the buttons red `Да` followed by neutral `Нет`, following UI-001. `Нет` or Escape closes the confirmation without changes. `Да` permanently removes the Order and all linked WorkItems, tooth selections, expenses, debt, debt-payment entries, and financial snapshot from the local database. The web interface does not offer an action to cancel an Order; existing Orders with the legacy `CANCELLED` status remain readable and editable.

---

## ODO — Odontogram

### ODO-001 — Interactive tooth map

For tooth-based work, the New/Edit Order flow provides an interactive upper/lower jaw map. In the first release, the map follows the supplied FDI illustration: each numbered circle is a separate control, and selecting it visually highlights the corresponding tooth. The artwork and its layout can be replaced without changing the FDI tooth codes stored with a WorkItem.

### ODO-002 — Tooth selection

The user selects one or more teeth by tapping/clicking the odontogram.

### ODO-003 — Group assignment

Selected teeth are assigned to a WorkItem/category.

Different groups of teeth inside the same Order may have different work types.

### ODO-004 — Automatic units

For a work type configured as tooth-count based:

`units = count(selected teeth)`

The user does not manually type the unit count in the normal tooth-selection flow.

### ODO-005 — WorkItem fields

A WorkItem may contain at least:

- work type;
- selected teeth;
- calculated units;
- shade/color;
- optional comment;
- extensible additional fields.

### ODO-006 — Non-tooth services

Some work types may be fixed services and do not require tooth-based unit counting.

Examples:
- repair;
- adjustment;
- other fixed service.

### ODO-007 — Tooth numbering and coverage

The odontogram uses the FDI two-digit numbering system for permanent teeth. The first release includes the 32 permanent teeth. Milk teeth are outside the first-release scope and may be added as an optional feature after release.

### ODO-008 — WorkItem quantity mode

When creating or editing an active WorkItem, the user chooses FDI or manual quantity entry. FDI mode opens the map and derives `units` from the selected teeth. Manual mode accepts a user-entered quantity. The selected tooth codes are stored on the WorkItem as comma-separated FDI text, such as `11,13,28`, and read back into the map.

---

## DIR — Directories and autofill

### DIR-001 — Doctor directory

Settings provides management of Doctors.

Minimum fields:
- first name;
- last name;
- phone;
- comments.

### DIR-002 — Doctor autofill

Doctors created in Settings are available for selection when creating or editing an Order. The `Своё` choice in the Order form opens the same Doctor fields and adds the confirmed Doctor to the directory.

### DIR-003 — Extensible lookup fields

The same directory/autofill pattern may be used for other repetitive fields such as:
- work types;
- materials;
- colors/shades;
- clinics/laboratories;
- reusable comments.

### DIR-004 — Shared reference file

Settings contains `Справочник врачей` and `Справочник Цветов`. Colors are suggested from the color directory while still allowing a manually entered color on a WorkItem. Expense items are maintained in the `Расходы` category of Pricing, not in Settings. The `directory` JSON file contains Doctors and Colors; the Pricing JSON contains both work and expense items. Importing either file replaces only its corresponding dataset. Saved WorkItem colors and expense names remain as historical text. The older `doctor-directory` JSON format remains importable for compatibility.

Selecting `Изм.` for a Doctor or Color smoothly scrolls the page to the beginning of that directory frame so its edit form is immediately visible.

---

## CFG — Configurable fields

### CFG-001 — Required fields

Settings provides a list of supported Order fields and lets the user mark configurable fields as required or optional. `Старт заказа` is always required. On a new database, patient label, Doctor, and common deadline are required by default. An Order must always contain at least one WorkItem, and each WorkItem must have a work type/name.

### CFG-002 — Validation

An Order cannot be created/saved when `Старт заказа` or any currently required field is missing.

The UI must clearly identify the missing required fields.

### CFG-003 — Runtime configuration

Changing required-field configuration must not require code changes or app rebuild.

---

## PRI — Pricing

### PRI-001 — User-managed Pricing

The main menu provides a Pricing section.

The user creates and edits their own price list.

### PRI-002 — Pricing calculation modes

Pricing must support at least:

- price per unit;
- fixed price for a service;
- fixed/configured price for a composite work type.

Additional calculation modes may be added later.

### PRI-003 — Order autofill

For each standard WorkItem, Pricing and quantity provide a temporary calculated amount for the open form. The editable accepted amount is initially filled from this calculation. The Order displays the expected amount as the sum of accepted amounts for completed WorkItems.

### PRI-004 — Manual override

Each WorkItem has a temporary calculated amount from Pricing and a saved accepted amount. The accepted amount may be edited while creating or viewing/editing the Order, including after closure. The calculated amount remains visible as a read-only reference only while the form is open and is not stored. If the accepted amount differs from the current calculated hint, the caption reads `Стоимость работы (Изменено)`.

### PRI-005 — Pricing is not archival truth

Pricing is only an input/autofill source.

Changing Pricing must never recalculate closed/archived Orders.

### PRI-006 — Currency-free amounts

Pricing amounts and financial totals are plain numbers. The UI does not ask for or display a currency. Legacy currency metadata does not affect calculations. `Использовать в новых заказах` remains an independent control for whether a Pricing item is available when adding a WorkItem.

### PRI-007 — WorkItem editor fields

Each Pricing item has independent checkboxes for `Нумерация` and `Цвет`. Only checked fields appear in the standard WorkItem editor in both new and existing Orders. New Pricing items start with both checkboxes off. The field keys are stored in the existing Pricing `metadata` JSON under `orderEditorFields`; this setting affects form presentation and does not recalculate or replace accepted WorkItem amounts. Legacy Pricing items without this setting keep the previous behavior and show both fields. For a `PER_UNIT` item without numbering, show an editable positive whole-number `Количество` field, defaulting to 1. New optional editor fields can be added as further keys in the same metadata list and field registry.

### PRI-008 — Work and expense categories

Pricing has separate `Работы` and `Расходы` categories. Work items are selectable only when adding WorkItems; expense items are selectable only when adding Order expenses. Expense items have an optional unit price; if unset in Pricing, the Order editor requires a manual unit amount. The Settings expense directory is removed; expense item management and Pricing import/export live in Pricing. Older expense categories migrate with no price assigned.

### PRI-009 — Scroll to the selected Pricing editor

Selecting `Изм.` for an existing Pricing item smoothly scrolls the page to the beginning of the edit form, which identifies whether the selected entry is a work or an expense.

---

## CLS — Order closure

### CLS-001 — Closure screen

The user closes the whole Order explicitly through one `Закрыть заказ` action. Before closure, each WorkItem must be completed or deleted; cancelled WorkItems are allowed and do not contribute to the expected amount. The closure form shows expected amount, received amount, expenses, and balance, and asks for the business closure date. It contains an `Оформить как заказ с долгом` checkbox. The checkbox is disabled while the received amount is equal to or greater than expected, and becomes available when the received amount is lower. If the user accepts the suggestion to close after completing the last active WorkItem, open this same closure form.

### CLS-002 — Editable final snapshot

Before closure, the user may continue editing WorkItem costs and individual expenses. Expected amount is the sum of accepted amounts for WorkItems with status `COMPLETED`. The user enters the amount received; the summary shows:

- expected amount: sum of completed WorkItem costs;
- received: editable actual receipt, initially equal to expected amount;
- debt: for debt closure, initially expected amount minus received, and editable;
- expenses: sum of the Order's expense entries;
- balance: received amount minus expenses, without subtracting outstanding debt.

On explicit closure, the expected amount, received amount, debt, expenses, and resulting balance are stored for Archive and Statistics. Debt is zero unless the user checks `Оформить как заказ с долгом`.

If the received amount is below expected and the debt checkbox remains unchecked, allow normal closure with the entered receipt and no debt; the difference is not recorded as a debt. This supports discounts or other personal agreements. If the user checks the debt checkbox, reveal an editable debt field, initially expected amount minus received, and an optional debt comment. The user may change the debt amount before confirming. If the received amount is raised to expected or above while debt is selected, clear the selection and hide the debt fields.

### CLS-003 — Normal closure

A completed Order may be closed as normal with any non-negative received amount, including an amount below expected, when the debt checkbox is left unchecked.

### CLS-004 — Closure with changes

A completed Order may be closed with changed final values.

The final archived snapshot is authoritative.

### CLS-005 — Closure with debt

A completed and delivered Order may be closed with a debt when the user selects `Оформить как заказ с долгом` in the closure form.

The closure form defaults `Получено` to the expected amount. The debt checkbox is available only when received is less than expected. Selecting it reveals `Задолженность`, initially expected amount minus received; this field remains editable, as does the debt comment. The Order is archived with received income and a separate debt record. Debt does not reduce balance. Leaving the checkbox unchecked closes the Order without debt even when received is below expected.

For a closed Order with debt, `Погашен` records a payment equal to the remaining debt by default; `Частями` lets the user enter a smaller amount. The buttons stay red `Простить`, blue `Частями`, green `Погашен` from left to right, following UI-001. Each payment is stored as an independent record linked to the debt. Payments increase Order income and balance; outstanding debt is the recorded debt amount minus payments and cannot fall below zero.

The debt frame also provides a red `Простить` action. Before proceeding, show a warning that the unpaid remainder will be removed from debt history, saved partial payments will remain as income, and the change can affect Statistics. The confirmation buttons are red `Удалить` followed by neutral `Отмена`, following UI-001. Confirming forgiveness sets the recorded debt amount to the sum of existing payments, or zero if there are none; update the financial snapshot's debt to the same amount. Keep every payment record, do not add income or change balance, and keep the Order closed with closure type `WITH_DEBT`. The debt is then fully settled and no longer appears as outstanding.

Before closing an Order, forgiving its debt, or recording a full or partial debt payment, save valid pending Order-card edits first. If a work/expense editor is still open, validation fails, or saving fails, do not perform the financial action. Saving for these actions keeps the user on the current Order card and does not invoke the return-to-Calendar behavior used by `Сохранить и выйти`.

### CLS-006 — Legacy cancelled Orders

The web interface does not provide an Order cancellation action. Orders with status `CANCELLED`, including legacy or imported records, remain readable in Archive and participate in Archive searches. Their income is treated as zero; saved expenses remain included and can produce a negative financial result. Statistics includes a `CANCELLED` Order when it has a business `closure_date`. To remove an Order and its linked data, use `Удалить заказ`.

### CLS-007 — Historical expenses on cancelled Orders

An existing or imported cancelled Order may have:

- received amount = 0;
- debt = 0;
- expenses > 0.

Its saved expenses therefore produce a negative financial result. The Order remains in Archive and is included in Statistics when it has a business `closure_date`.

### CLS-008 — Archive transition

A manually closed Order moves to Archive. Orders with status `CANCELLED` also appear in Archive. Open Orders remain outside Archive and the main Statistics, regardless of their deadline or WorkItem completion state. Statistics includes a `CANCELLED` Order only when its business `closure_date` is present.

### CLS-009 — Closure date

When manually closing an Order, the user enters its business `дата закрытия`. A past date is allowed, but it cannot be earlier than `Старт заказа`. Statistics period filters use this closure date. The technical timestamp of the archive transition is stored separately and does not define the Statistics period.

---

## FIN — Financial model

### FIN-001 — Accounting at Order level

Financial accounting is performed at the whole Order level, not per WorkItem.

### FIN-002 — WorkItem completion is non-financial

Marking a WorkItem completed/cancelled does not by itself post final income, debt or final accounting.

### FIN-003 — Final financial values

WorkItem accepted amounts and individual expenses can be edited while creating or viewing/editing an Order, including after closure. On explicit closure, the Order enters Archive and main Statistics. After a permitted post-closure edit, the user can select `Обновить и пересчитать` in Statistics to recalculate the selected aggregates from the stored Order values.

### FIN-004 — Cancelled WorkItems are informational

Cancelled WorkItems remain visible in the Order for history and are included in the cancelled-item count. Their accepted amounts are excluded from work-income subtotals and provisional Order balances; only completed WorkItems contribute to the closure expected amount. A closed Order's realized income remains the saved receipt plus debt repayments and is not recalculated from WorkItem status changes.

### FIN-015 — Core financial fields

The closure model must support at least:

- final Order total;
- received amount;
- operating expenses;
- debt as a separate linked record;
- resulting financial outcome.

### FIN-005 — Closed Order may have debt

Order completion and debt settlement are independent states.

A closed Order may remain referenced by the Debts view.

### FIN-006 — Cancelled loss

A cancelled Order with expenses and no income must reduce the relevant financial result/statistics.

### FIN-007 — Historical independence

Archived financial values are independent of current Pricing and current directory values.

### FIN-008 — Order expenses

An Order may have multiple expense entries. The user may add, edit, and delete each entry. Each entry stores the selected expense name, the unit cost used, quantity, calculated total, and an optional comment as a snapshot from the time of the expense. Later changes to Pricing do not change saved expense entries. The calculated total (unit cost multiplied by quantity) is the amount used in Order expenses, balance, Archive, and Statistics; the name and comment do not affect calculations.

The Order's read-only expense total is the sum of the saved expense totals.

### FIN-009 — Separate debt record

Debt is stored as a separate record linked to its Order, with an amount and comment. Each repayment is stored as a separate entry with an amount and receipt timestamp. Outstanding debt is the recorded amount minus repayments. The closure receipt plus debt repayments form income; expenses are subtracted from income to calculate balance. Outstanding debt is a separate Statistics metric and is not subtracted from balance. When the user forgives the remainder, the debt amount is reduced to the sum of the saved repayments (or zero if none); repayment entries remain unchanged, so income and balance do not change, while outstanding debt becomes zero.

### FIN-010 — Recalculate Statistics after edits

After an edit to a closed Order's card or WorkItems, the Statistics screen provides `Обновить и пересчитать`. Recalculation uses the stored historical amounts and does not read current Pricing.

---

## DEBT — Debts

### DEBT-001 — Dedicated Debts view

The application provides a dedicated Debts section over the same local database.

### DEBT-002 — Debt context

Debt records/results must be traceable to at least:

- Order;
- doctor;
- patient label;
- amount.

The debt record also stores its comment. Debt is entered by selecting `Оформить как заказ с долгом` in the closure form; repayments are saved individually and contribute to income. The Debts view lists only the outstanding amount; a fully repaid debt no longer appears as outstanding.

### DEBT-003 — Flexible filtering

Debts must support filtering/search by relevant fields including:
- doctor;
- patient label;
- date/range;
- amount/range;
- Order and WorkItem characteristics where available.

---

## ARC — Archive and search

### ARC-001 — Closed and cancelled Orders

Archive contains Orders explicitly closed by the user and Orders with status `CANCELLED`. The web interface does not provide an action to cancel an Order.

### ARC-002 — Local database search

Archive search operates over the local database.

### ARC-003 — Combined filters

Search must support combining multiple filters, including where applicable:

- doctor;
- patient label;
- date/range;
- amount/range;
- work type;
- Order status;
- debt state;
- other indexed Order/WorkItem fields.

Keep the Archive search field as-is. Present the closure-date range as two date fields on one line separated by `по`, without visible labels above the fields. Present the income range under the single heading `Фильтровать по доходу (от - до)`, with both inputs on one line.

### ARC-004 — Exact historical values

Archive displays stored historical values, not values recalculated from current settings or Pricing. A user may edit a closed Order's card and WorkItems, including its business closure date and WorkItem production status/dates; the Order ID and lifecycle status remain unchanged. The accepted WorkItem amount remains authoritative; calculated Pricing hints are temporary form information and do not change Archive or Statistics values. Saved edits become the values used by a later Statistics recalculation.

### ARC-005 — WorkItem date history

Archive preserves WorkItem start and completion/cancellation dates so they can be filtered and used in statistics. Multiple WorkItems may have the same start or end date. Timestamp values are displayed using the operating system's local calendar day, matching the Order editor; date-only values remain on their stored calendar day.

### ARC-006 — Explicit Archive search and compact results

Opening Archive does not load or display the Order list. The user presses `Поиск` to load and search using the current filter settings. Until a search is submitted, no Order cards or bottom summary are shown.

After a search, show matching Orders as compact cards containing only patient name, Doctor, and closure date formatted as `дд.мм.гггг`; do not show the Order ID on the compact card. Selecting a card expands its full saved details and provides an action to open that Order in the editing screen. Do not show an aggregate summary at the bottom of Archive.

### ARC-007 — Highlight outstanding debt in Archive results

After an Archive search, outline each Order result card in red when its outstanding debt is greater than zero. Apply the outline to both collapsed and expanded cards. Fully repaid Orders do not receive the red outline.

### ARC-008 — Delete all Orders from Archive

Show a red `Удалить все заказы` button at the bottom of Archive, independent of the current search and filters. The first warning explains that all Orders and their dependent records will be removed while Pricing and directories remain, and requires the user to enter the exact text `Удалить`. After a correct entry and `Продолжить`, show a second warning reading `Все заказы будут удалены!` with red `Удалить` followed by neutral `Отмена`, following UI-001. Canceling either warning closes the confirmation flow without changing data. Confirming permanently deletes every Order regardless of status or current filters, including its WorkItems, expenses, debt repayments, debt, and financial snapshot; Pricing and all directories remain.

### ARC-009 — Delete one Order from Archive

The expanded details of an Archive result provide a red `Удалить заказ` action. It uses the same confirmation text and `Да`/`Нет` behavior as ORD-017. On confirmation, remove the selected Order and every linked record from the local database, immediately remove its card from the current search results, and keep the user in Archive. A deleted Order contributes nothing to later Statistics recalculations.

---

## STA — Statistics

### STA-001 — Statistics section

The UI provides a Statistics action/section. Main Statistics include Orders explicitly closed by the user and Orders with status `CANCELLED` that have a business `closure_date`. Open Orders are excluded.

### STA-002 — Period selection

Statistics supports at least:
- week;
- month;
- quarter;
- year;
- custom date range.

### STA-003 — Required metrics

Statistics must eventually show:
- общий доход;
- долг отдельной графой;
- чистый доход;
- сальдо по врачам.

Statistics periods include closed and eligible `CANCELLED` Orders by their business closure date. A `CANCELLED` Order contributes zero income while its saved expenses remain included. For other Orders, income is the amount received at closure plus recorded debt repayments. Order balance is income minus expenses; outstanding debt is shown separately and is not subtracted. The Statistics screen provides `Обновить и пересчитать` to refresh period aggregates from saved values without reading current Pricing.

### STA-004 — Highlight Doctors with outstanding debt

In `Сальдо по врачам`, outline a Doctor's summary frame in red when that Doctor's outstanding debt is greater than zero. Do not apply the red outline when the debt is zero.

### STA-005 — Open Archive filtered by Doctor

Selecting a Doctor's name in `Сальдо по врачам` opens Archive with that Doctor selected in the Doctor filter. The user still presses `Поиск` to load results, consistent with Archive search behavior. A summary row without a Doctor ID is not a link.

---

## CUR — Current Orders Summary

### CUR-001 — Informational summary

The application provides a section named `Сводка по текущим заказам`. It summarizes open Orders only and is informational. Its provisional income, expense, and balance amounts do not enter Archive or main Statistics until the user closes the Order.

---

## DBM — Database management

### DBM-001 — Settings section

Settings provides `Управление базой данных`.

### DBM-002 — Full backup/export

The user can export the full local database as a versioned JSON backup.

### DBM-003 — Full import/restore

The user can import/restore a compatible full-database JSON backup into the single active local database.

Importing a full-database backup replaces the active database contents after validation.

### DBM-004 — Validation before import

Before replacement/connection, the app validates at least:
- file type;
- schema version;
- integrity;
- migration compatibility.

### DBM-005 — Active database

The app uses one active local SQLite database. Imported JSON files are applied to that database; Settings does not keep separate live-connected directory or Pricing files.

### DBM-006 — Selective exchange

Pricing and selected lookup/directories can be exported/imported as separate versioned JSON files, independently from the full Order history. Import replaces all records in the selected dataset while preserving Orders and unrelated datasets in the active database.

### DBM-007 — External sharing

Exported files must be suitable for transfer through external apps such as file managers or messaging applications.

The application itself does not require a built-in cloud service.

---

## NOT — Notifications

### NOT-001 — In-app due indication

Due and overdue Orders must be surfaced when the application is opened.

### NOT-002 — Android reminders for active Orders

Android Settings can enable local system reminders for active Orders with a delivery deadline. A reminder contains the patient name, Doctor name, and full deadline date. The notification is configured to show those details on the lock screen.

### NOT-003 — Reminder schedule

The user can choose 0, 1, 2, or 3 days before the deadline and a local device time. Reminders repeat once per day from the selected lead day through the deadline day, inclusive. `0` means the deadline day only. The default lead is `0`, the default time is `11:00`, and reminders are disabled by default.

Closed or cancelled Orders and Orders without a deadline do not receive reminders. Changing an Order's deadline, patient, or Doctor refreshes its scheduled reminder; closing or deleting an Order cancels it. Turning reminders off cancels all pending reminders.

### NOT-004 — Android permissions and recovery

When the user enables reminders, Android requests notification permission and access to exact alarms so reminders can fire at the chosen time. No permission is requested while reminders are disabled. The feature uses on-device scheduling and requires no cloud service or additional runtime package.

Scheduled reminders are synchronized when the app starts and after relevant Order or reminder-setting changes. The app does not request boot-completion permission; after a device restart, reminders are scheduled again the next time the app is opened.
