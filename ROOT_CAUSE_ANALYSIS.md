# 根因分析：处理完成后仍显示"暂无分段数据"

## 问题现象

上传新书处理完成后，页面显示"暂无分段数据，请先完成 PDF 解析"，但刷新后能看到正确的 segments。

## 代码分析

### 1. 后端代码（正常）

`server-lite/routes/pdf.ts:263-268`
```typescript
store.update(bookId, {
  title: result.title,
  status: "parsed",
  segments: result.segments,  // ✅ 正确更新了 segments
  coverPath,
});
```

后端正确更新了 segments 数据。

### 2. 前端轮询（正常）

`app/src/pages/BookDetailPage.tsx:37-48`
```typescript
const interval = setInterval(async () => {
  try {
    const updated = await api.getBook(book.id);
    setBook(updated);  // ✅ 正确获取并更新 book
    if (updated.status === "parsed" || updated.status === "ready") {
      clearInterval(interval);
    }
  } catch (e) {
    console.error('Polling error:', e);
  }
});
```

轮询逻辑正确获取并更新了 book 数据。

### 3. 状态转换（正常）

`app/src/pages/BookDetailPage.tsx:53-58`
```typescript
useEffect(() => {
  if (book && (book.status === "parsed" || book.status === "ready")) {
    setStep(1);  // ✅ 正确切换到编辑步骤
  }
}, [book?.status]);
```

状态转换逻辑正确。

### 4. Step2Edit 组件（❌ 问题所在）

`app/src/pages/steps/Step2Edit/Step2Edit.tsx:19-27`
```typescript
export function Step2Edit({ book, onBookUpdate, onContinue }: Props) {
  const [localTitle, setLocalTitle] = useState(book.title);
  const [localSegments, setLocalSegments] = useState<SegmentData[]>(book.segments);
  //                                                              ^^^^^^^^^^^^
  //                                                              问题在这里！
  const [isDirty, setIsDirty] = useState(false);
  const [selectedSegIdx, setSelectedSegIdx] = useState(0);
  
  const selectedSeg = localSegments[selectedSegIdx];
```

## 根因

**Step2Edit 使用 `useState(book.segments)` 初始化本地状态**

这导致：
1. 组件第一次渲染时，`book.segments = []`（空数组）
2. `localSegments` 被初始化为 `[]`
3. 即使父组件传入新的 `book`（包含 segments），`localSegments` **不会自动更新**
4. 第 55 行检查 `!localSegments.length` 仍然为 true
5. 显示"暂无分段数据"

## React useState 行为

```typescript
// 这个模式是错误的：
const [state, setState] = useState(props.value);
//                    ^^^^^^^^^^^^^^^^^^^^^^^^
// 只在第一次渲染时使用 props.value，后续 props.value 变化不会影响 state

// 正确的模式：
// 1. 直接使用 props（推荐）
const segments = book.segments;

// 2. 使用 useEffect 同步（如果需要本地状态）
const [localSegments, setLocalSegments] = useState([]);
useEffect(() => {
  setLocalSegments(book.segments);
}, [book.segments]);

// 3. 使用 key 强制重新挂载（简单粗暴）
<Step2Edit key={book.id} book={book} />
```

## 执行流程

```
时间线：
T0: 用户上传 PDF
    ↓
    book.status = "parsing"
    book.segments = []
    ↓
    Step2Edit 首次渲染
    localSegments = useState([]) → []
    ↓
T1: 轮询检测到 status = "parsed"
    ↓
    setBook({ status: "parsed", segments: [...] })
    ↓
    setStep(1)
    ↓
    Step2Edit 再次渲染
    book.segments = [...] (有数据！)
    BUT: localSegments = [] (还是初始值！)
    ↓
    检查 !localSegments.length → true
    ↓
    显示"暂无分段数据" ❌
```

## 为什么刷新后能看到？

刷新后：
1. 重新调用 `api.getBook(bookId)`
2. 获取到完整的 book（包含 segments）
3. Step2Edit **首次渲染**就拿到有 segments 的 book
4. `localSegments = useState(segments)` → segments（有数据）
5. 正常显示编辑界面 ✅

## 解决方案

### 方案 1：直接使用 book.segments（推荐）

**修改：** `app/src/pages/steps/Step2Edit/Step2Edit.tsx`

```typescript
export function Step2Edit({ book, onBookUpdate, onContinue }: Props) {
  // ❌ 删除本地状态
  // const [localSegments, setLocalSegments] = useState<SegmentData[]>(book.segments);
  
  // ✅ 直接使用 props
  const localSegments = book.segments;
  
  // 其他代码保持不变
}
```

**优点：**
- 简单直接
- 保证与父组件数据同步
- 减少状态管理复杂度

**缺点：**
- 如果需要本地编辑，需要额外的状态管理

### 方案 2：使用 useEffect 同步

```typescript
export function Step2Edit({ book, onBookUpdate, onContinue }: Props) {
  const [localSegments, setLocalSegments] = useState<SegmentData[]>([]);
  
  // ✅ 监听 book.segments 变化并同步
  useEffect(() => {
    setLocalSegments(book.segments);
  }, [book.segments]);
  
  // 其他代码保持不变
}
```

**优点：**
- 保持本地状态的可编辑性
- 自动同步父组件数据

**缺点：**
- 多一次渲染
- 代码复杂度略高

### 方案 3：使用 key 强制重新挂载

**修改：** `app/src/pages/BookDetailPage.tsx`

```typescript
{step === 1 && (
  <Step2Edit
    key={book.id}  // ✅ book.id 变化时强制重新挂载
    book={book}
    onBookUpdate={setBook}
    onContinue={() => goToStep(2)}
  />
)}
```

**优点：**
- 简单，不需要修改 Step2Edit
- 保证组件拿到最新数据

**缺点：**
- 会丢失组件内部状态（如选中的 segment）
- 可能不是最优解

### 方案 4：混合方案（最佳实践）

如果需要本地编辑能力，同时保持同步：

```typescript
export function Step2Edit({ book, onBookUpdate, onContinue }: Props) {
  const [localSegments, setLocalSegments] = useState<SegmentData[]>(book.segments);
  
  // 只在 segments 从空变为非空时更新（初始化）
  useEffect(() => {
    if (book.segments.length > 0 && localSegments.length === 0) {
      setLocalSegments(book.segments);
    }
  }, [book.segments]);
  
  // 其他编辑逻辑保持不变
}
```

**优点：**
- 只在必要时同步
- 保持本地编辑能力
- 避免不必要的状态覆盖

**缺点：**
- 逻辑稍复杂

## 推荐方案

**使用方案 1：直接使用 book.segments**

理由：
1. Step2Edit 的编辑功能是通过 `updateSegment` 修改，然后调用 `onBookUpdate` 通知父组件
2. 不需要维护独立的本地 segments 状态
3. 代码最简单，最不容易出错

**需要修改的地方：**
- `Step2Edit.tsx:21` - 删除 useState
- `Step2Edit.tsx:34-38` - updateSegment 函数需要调整
- `Step2Edit.tsx:19-27` - 可能需要调整 localTitle 的同步逻辑

## 额外发现

**localTitle 也有同样的问题！**

```typescript
const [localTitle, setLocalTitle] = useState(book.title);
```

如果 book.title 在组件挂载后变化，localTitle 也不会同步。

**完整的修复应该同时处理 title 和 segments。**
