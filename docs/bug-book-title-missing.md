# BUG 排查报告：书名显示为空

- **日期**：2026-03-21
- **环境**：Node.js · Express · React · TypeScript
- **文件**：`app/src/pages/steps/Step2Edit/EditableSegmentPreview.tsx`（封面卡片）· `server-lite/routes/pdf.ts` · `server-lite/store.ts` · `data/books.json`

---

## 一、现象

Step2Edit 预览面板的封面卡片中，书名位置显示为空（无内容），或显示错误的硬编码书名 `《小而美》`。

---

## 二、根本原因（共三处）

### 原因 1：书名硬编码

`EditableSegmentPreview`（当时为内联的 `SegmentPreview`）封面卡片中书名被写死：

```tsx
// EditableSegmentPreview.tsx 内封面卡片（修复前）
<p className="text-gold text-sm font-serif tracking-widest mb-3 opacity-80">《小而美》</p>
```

该组件没有接收书名 prop，无法动态显示。

---

### 原因 2：历史数据缺少 `title` 字段

`data/books.json` 中已存在的两本书在写入时没有保存 `title` 字段：

```json
// 修复前（缺少 title）
{ "id": "chapter5", "pdfPath": "...", "status": "parsed", ... }
{ "id": "3029bfb8", "pdfPath": "...", "status": "parsed", ... }
```

这是因为这些书是在 `title` 字段被加入 `BookData` 类型之前导入的（通过 `import-existing` 接口写入，但当时 store 已存储完整对象，后来加字段没有回填）。

运行时 `book.title` 为 `undefined`，TypeScript 类型声明为 `string` 但实际是 `undefined`，前端显示为空。

---

### 原因 3：PUT 接口更新时覆盖 `title` 为 `undefined`

`PUT /api/books/:bookId` 接口存在隐患：

```ts
// 修复前
const { title, segments } = req.body as Partial<BookData>;
const updated = store.update(req.params.bookId, { title, segments });
```

当请求 body 中没有 `title` 字段时，`title` 为 `undefined`，`store.update` 的 spread 操作会把 `undefined` 覆盖到 book 对象，导致已有的 title 被抹掉：

```ts
// store.update 内部
const updated = { ...book, ...patch };  // title: undefined 会覆盖原来的值
```

---

## 三、修复方案

### 修复 1：`EditableSegmentPreview` 接收并使用 `bookTitle` prop

```tsx
// EditableSegmentPreview.tsx
export function EditableSegmentPreview({ seg, bookTitle, onChange }: Props) {
  ...
  <p className="text-gold text-sm font-serif tracking-widest mb-3 opacity-80">
    《{bookTitle}》
  </p>
```

调用处（`Step2Edit/Step2Edit.tsx`）传入动态值：

```tsx
<EditableSegmentPreview
  seg={selectedSeg}
  bookTitle={localTitle}
  onChange={(updated) => updateSegment(selectedSegIdx, updated)}
/>
```

---

### 修复 2：回填历史数据中缺失的 `title` 字段

直接修改 `data/books.json`，补上两本已存在书的 title：

```json
{ "id": "chapter5", "title": "小而美 · 第五章", ... }
{ "id": "3029bfb8", "title": "精益创业", ... }
```

---

### 修复 3：PUT 接口只更新已提供的字段

```ts
// server-lite/routes/pdf.ts
const { title, segments } = req.body as Partial<BookData>;
const patch: Partial<BookData> = {};
if (title !== undefined) patch.title = title;
if (segments !== undefined) patch.segments = segments;
const updated = store.update(req.params.bookId, patch);
```

---

### 修复 4：`initStore` 加载时为缺失 title 提供兜底默认值

```ts
// server-lite/store.ts
books = new Map(raw.map((b) => [b.id, { title: "未命名", ...b }]));
```

通过在 spread 前放置默认值，确保历史数据即使缺少 `title` 也能正常渲染，不会导致运行时 `undefined`。

---

## 四、经验教训

1. **类型声明 ≠ 运行时保证**：TypeScript 的 `title: string` 无法防止 JSON 文件中缺少该字段，持久化数据变更时需做迁移或加兜底默认值。
2. **更新接口要过滤 undefined**：`store.update(id, { title, segments })` 这种写法在字段可选时很危险，应只将明确提供的字段放入 patch。
3. **展示层不应硬编码内容数据**：书名、作者等来自数据的内容应始终通过 prop 传入，而不是写死在组件里。
