#!/usr/bin/env node
/**
 * 测试 preprocess-pdf.py 集成
 * 
 * 用法:
 *   node test-integration.js
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();

console.log('🧪 测试 preprocess-pdf.py 集成\n');

// 测试 1: 检查脚本是否存在
console.log('✅ 测试 1: 检查 Python 脚本是否存在');
const scripts = [
  'scripts/preprocess-pdf.py',
  'scripts/process-chapters.py',
  'scripts/extract-pdf.py',
];

let allExist = true;
for (const script of scripts) {
  const scriptPath = path.join(root, script);
  const exists = fs.existsSync(scriptPath);
  console.log(`  ${exists ? '✓' : '✗'} ${script}`);
  if (!exists) allExist = false;
}

if (!allExist) {
  console.error('\n❌ 错误：某些脚本不存在\n');
  process.exit(1);
}

console.log('\n✅ 测试 1 通过：所有脚本文件存在\n');

// 测试 2: 检查 TypeScript 类型定义
console.log('✅ 测试 2: 检查 TypeScript 类型定义');
const typesPath = path.join(root, 'server-lite/types.ts');
const typesContent = fs.readFileSync(typesPath, 'utf-8');

const requiredStatuses = ['preprocessing', 'processing_chapters'];
let allStatusesDefined = true;

for (const status of requiredStatuses) {
  const defined = typesContent.includes(status);
  console.log(`  ${defined ? '✓' : '✗'} BookStatus includes "${status}"`);
  if (!defined) allStatusesDefined = false;
}

if (!allStatusesDefined) {
  console.error('\n❌ 错误：某些状态未在 types.ts 中定义\n');
  process.exit(1);
}

console.log('\n✅ 测试 2 通过：所有状态类型已定义\n');

// 测试 3: 检查 routes/pdf.ts 中的实现
console.log('✅ 测试 3: 检查 routes/pdf.ts 实现');
const routesPath = path.join(root, 'server-lite/routes/pdf.ts');
const routesContent = fs.readFileSync(routesPath, 'utf-8');

const checks = [
  { pattern: 'parseBookWithPreprocess', desc: 'parseBookWithPreprocess 函数' },
  { pattern: 'parseBookDirect', desc: 'parseBookDirect 函数' },
  { pattern: 'USE_PREPROCESS', desc: 'USE_PREPROCESS 环境变量支持' },
  { pattern: 'SKIP_CHAPTERS', desc: 'SKIP_CHAPTERS 环境变量支持' },
  { pattern: 'preprocess-pdf.py', desc: '调用 preprocess-pdf.py' },
  { pattern: 'process-chapters.py', desc: '调用 process-chapters.py' },
  { pattern: 'falling back to direct extraction', desc: '降级策略' },
];

let allChecksPass = true;
for (const check of checks) {
  const found = routesContent.includes(check.pattern);
  console.log(`  ${found ? '✓' : '✗'} ${check.desc}`);
  if (!found) allChecksPass = false;
}

if (!allChecksPass) {
  console.error('\n❌ 错误：routes/pdf.ts 中缺少某些实现\n');
  process.exit(1);
}

console.log('\n✅ 测试 3 通过：routes/pdf.ts 实现完整\n');

// 测试 4: Python 依赖检查
console.log('✅ 测试 4: 检查 Python 依赖');
const checkPythonDeps = () => {
  return new Promise((resolve) => {
    const python = spawn('python3.11', ['-c', 'import pypdf, pdfplumber, pymupdf']);
    
    let error = '';
    python.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    python.on('close', (code) => {
      if (code === 0) {
        console.log('  ✓ Python 依赖已安装 (pypdf, pdfplumber, pymupdf)');
        resolve(true);
      } else {
        console.log('  ✗ Python 依赖未安装');
        console.log(`    错误：${error.trim()}`);
        console.log('    运行：pip install pypdf pdfplumber pymupdf');
        resolve(false);
      }
    });
  });
};

const depsOk = await checkPythonDeps();
if (!depsOk) {
  console.error('\n⚠️  警告：Python 依赖可能未安装\n');
} else {
  console.log('\n✅ 测试 4 通过：Python 依赖可用\n');
}

// 总结
console.log('═══════════════════════════════════════════════════');
console.log('✅ 所有静态检查通过！');
console.log('═══════════════════════════════════════════════════\n');

console.log('📋 下一步：');
console.log('1. 启动服务器：npm start');
console.log('2. 上传一个 PDF 文件进行测试');
console.log('3. 观察日志输出，应该看到：');
console.log('   [preprocess] Starting pipeline for book: ...');
console.log('   [preprocess] PDF split complete, processing chapters...');
console.log('   [process-chapters] Book "..." parsed: N segments\n');

console.log('📖 详细测试指南请查看：test-preprocess-integration.md\n');
