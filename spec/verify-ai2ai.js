/**
 * AI2AI 文档校验脚本
 * 
 * 用途：检测 AI2AI 文档与实际代码之间的结构性不一致
 * 运行：node spec/verify-ai2ai.js
 * 
 * 校验内容：
 * 1. 前端架构信息.md 中的目录结构 vs 实际文件
 * 2. 后端架构信息.md 中的目录结构 vs 实际文件
 * 3. 协议和数据.md 中的表定义 vs init.js 中的表定义
 * 4. 协议和数据.md 中的API端点 vs 路由文件中的端点
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SPEC_DIR = path.join(ROOT, 'spec', 'AI2AI');

let totalIssues = 0;

function printHeader(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

function printIssue(type, msg) {
  totalIssues++;
  const prefix = type === 'missing' ? '[文档有/实际无]' :
                 type === 'undoc'   ? '[实际有/文档无]' :
                 type === 'mismatch' ? '[不一致]' : '[信息]';
  console.log(`  ${prefix} ${msg}`);
}

function printOk(msg) {
  console.log(`  [OK] ${msg}`);
}

// ============================================================
// 1. 从 markdown 的目录结构代码块中提取文件路径
// ============================================================
function extractPathsFromTree(markdown, rootPrefix) {
  const treeBlockMatch = markdown.match(/```[\s\S]*?```/);
  if (!treeBlockMatch) return [];

  const treeBlock = treeBlockMatch[0];
  const lines = treeBlock.split('\n');
  const paths = [];

  for (const line of lines) {
    // 匹配类似 "│   ├── somefile.js" 或 "├── dir/" 的行
    const match = line.match(/[├└│─\s]*\s*([^\s#]+)/);
    if (!match) continue;
    
    let name = match[1].trim();
    if (name === '```' || name === rootPrefix + '/') continue;
    
    // 跳过目录行（以 / 结尾）
    if (name.endsWith('/')) continue;
    
    // 只处理有扩展名的文件
    if (!name.includes('.')) continue;
    
    // 从缩进推断路径层级
    const indent = line.replace(/[^\s│]/g, '').length;
    paths.push({ name, indent, line: line.trim() });
  }

  return paths;
}

// 不需要在文档中记录的自动生成文件
const IGNORE_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.DS_Store',
  'thumbs.db'
]);

// 递归扫描目录获取实际文件
function scanDir(dir, baseDir, extensions) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    if (IGNORE_FILES.has(entry.name)) continue;
    
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
    
    if (entry.isDirectory()) {
      results.push(...scanDir(fullPath, baseDir, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(relPath);
    }
  }
  return results;
}

// ============================================================
// 2. 从 markdown 提取文件名集合
// ============================================================
function extractFileNames(markdown) {
  const files = new Set();
  // 匹配 "├── filename" 或 "└── filename" 格式（支持 .env 等无扩展名文件）
  const regex = /[├└]\s*──\s*(\.?[A-Za-z0-9_\-]+(?:\.[A-Za-z0-9]+)*)/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const name = match[1];
    // 跳过纯目录名（无点号且不以.开头的）
    if (!name.includes('.')) continue;
    files.add(name);
  }
  return files;
}

// ============================================================
// 3. 从 init.js 提取表名
// ============================================================
function extractTablesFromInitJs(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  const content = fs.readFileSync(filePath, 'utf-8');
  const tables = new Set();
  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    tables.add(match[1]);
  }
  return tables;
}

// 从协议文档提取表名
function extractTablesFromProtocol(markdown) {
  const tables = new Set();
  // 匹配 "#### tablename" 或 "### tablename" 在数据库设计章节下的表名
  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    tables.add(match[1]);
  }
  return tables;
}

// ============================================================
// 4. 从路由文件提取API端点
// ============================================================
function extractRoutesFromCode(routesDir) {
  const endpoints = [];
  if (!fs.existsSync(routesDir)) return endpoints;
  
  const prefixMap = {
    'health.js': '/api/health',
    'auth.js': '/api/auth',
    'user.js': '/api/user',
    'admin.js': '/api/admin',
    'product.js': '/api/products',
    'cart.js': '/api/cart'
  };

  const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
  
  for (const file of files) {
    const prefix = prefixMap[file] || `/api/${file.replace('.js', '')}`;
    const content = fs.readFileSync(path.join(routesDir, file), 'utf-8');
    
    // 匹配 router.get('/path', ...) 等
    const regex = /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const routePath = match[2];
      const fullPath = routePath === '/' ? prefix : prefix + routePath;
      endpoints.push({ method, path: fullPath });
    }
  }
  return endpoints;
}

// 从协议文档提取API端点
function extractRoutesFromProtocol(markdown) {
  const endpoints = [];
  // 匹配表格中的 "| GET | `/api/xxx` |" 格式
  const regex = /\|\s*(GET|POST|PUT|DELETE|PATCH)\s*\|\s*`([^`]+)`/gi;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    endpoints.push({ method: match[1].toUpperCase(), path: match[2] });
  }
  return endpoints;
}

// ============================================================
// 主校验流程
// ============================================================
function verify() {
  console.log('AI2AI 文档校验报告');
  console.log(`生成时间: ${new Date().toISOString()}`);

  // 读取文档
  const frontendDoc = fs.readFileSync(path.join(SPEC_DIR, '前端架构信息.md'), 'utf-8');
  const backendDoc = fs.readFileSync(path.join(SPEC_DIR, '后端架构信息.md'), 'utf-8');
  const protocolDoc = fs.readFileSync(path.join(SPEC_DIR, '协议和数据.md'), 'utf-8');

  // --- 前端文件校验 ---
  printHeader('前端目录结构校验');
  const frontendDocFiles = extractFileNames(frontendDoc);
  const frontendSrcFiles = scanDir(
    path.join(ROOT, 'frontend', 'src'),
    path.join(ROOT, 'frontend'),
    ['.vue', '.js']
  ).map(f => path.basename(f));
  // 也扫描frontend根目录下的文件（非递归）
  const frontendRootFiles = fs.readdirSync(path.join(ROOT, 'frontend'))
    .filter(f => !fs.statSync(path.join(ROOT, 'frontend', f)).isDirectory())
    .filter(f => ['.js', '.html', '.json'].some(ext => f.endsWith(ext)))
    .filter(f => !IGNORE_FILES.has(f));
  const frontendActualSet = new Set([...frontendSrcFiles, ...frontendRootFiles]);

  let feOk = true;
  for (const f of frontendDocFiles) {
    if (!frontendActualSet.has(f)) {
      printIssue('missing', `${f}`);
      feOk = false;
    }
  }
  for (const f of frontendActualSet) {
    if (!frontendDocFiles.has(f)) {
      printIssue('undoc', `${f}`);
      feOk = false;
    }
  }
  if (feOk) printOk('前端目录结构与文档一致');

  // --- 后端文件校验 ---
  printHeader('后端目录结构校验');
  const backendDocFiles = extractFileNames(backendDoc);
  const backendSrcFiles = scanDir(
    path.join(ROOT, 'backend', 'src'),
    path.join(ROOT, 'backend'),
    ['.js']
  ).map(f => path.basename(f));
  // 扫描backend根目录文件、test/目录、database/目录
  const backendExtraDirs = ['test', 'database'];
  const backendExtraFiles = [];
  for (const dir of backendExtraDirs) {
    const dirPath = path.join(ROOT, 'backend', dir);
    if (fs.existsSync(dirPath)) {
      backendExtraFiles.push(...scanDir(dirPath, path.join(ROOT, 'backend'), ['.js', '.db']).map(f => path.basename(f)));
    }
  }
  const backendRootFiles = fs.readdirSync(path.join(ROOT, 'backend'))
    .filter(f => {
      const full = path.join(ROOT, 'backend', f);
      return !fs.statSync(full).isDirectory();
    })
    .filter(f => ['.js', '.json', '.env', '.db'].some(ext => f.endsWith(ext)) || f === '.env')
    .filter(f => !IGNORE_FILES.has(f));
  const backendActualSet = new Set([...backendSrcFiles, ...backendExtraFiles, ...backendRootFiles]);

  let beOk = true;
  for (const f of backendDocFiles) {
    if (!backendActualSet.has(f)) {
      printIssue('missing', `${f}`);
      beOk = false;
    }
  }
  for (const f of backendActualSet) {
    if (!backendDocFiles.has(f)) {
      printIssue('undoc', `${f}`);
      beOk = false;
    }
  }
  if (beOk) printOk('后端目录结构与文档一致');

  // --- 数据库表校验 ---
  printHeader('数据库表定义校验');
  const initJsTables = extractTablesFromInitJs(path.join(ROOT, 'backend', 'src', 'database', 'init.js'));
  const protocolTables = extractTablesFromProtocol(protocolDoc);

  let dbOk = true;
  for (const t of initJsTables) {
    if (!protocolTables.has(t)) {
      printIssue('undoc', `表 ${t} 在 init.js 中存在但协议文档无DDL`);
      dbOk = false;
    }
  }
  for (const t of protocolTables) {
    if (!initJsTables.has(t)) {
      printIssue('missing', `表 ${t} 在协议文档中有DDL但 init.js 中不存在`);
      dbOk = false;
    }
  }
  if (dbOk) printOk('数据库表定义与文档一致');

  // --- API端点校验 ---
  printHeader('API端点校验');
  const codeRoutes = extractRoutesFromCode(path.join(ROOT, 'backend', 'src', 'routes'));
  const docRoutes = extractRoutesFromProtocol(protocolDoc);

  // 标准化路径用于比较 (将 :param 统一)
  const normalize = (p) => p.replace(/:\w+/g, ':param');
  
  const codeSet = new Set(codeRoutes.map(r => `${r.method} ${normalize(r.path)}`));
  const docSet = new Set(docRoutes.map(r => `${r.method} ${normalize(r.path)}`));
  // 文档中标记为未实现的不算差异，只检查已实现标记的
  const docImplemented = new Set();
  const implRegex = /\|\s*(GET|POST|PUT|DELETE|PATCH)\s*\|\s*`([^`]+)`\s*\|[^|]*\|\s*✅/gi;
  let implMatch;
  while ((implMatch = implRegex.exec(protocolDoc)) !== null) {
    docImplemented.add(`${implMatch[1].toUpperCase()} ${normalize(implMatch[2])}`);
  }

  let apiOk = true;
  // 文档标记✅但代码中没有
  for (const r of docImplemented) {
    if (!codeSet.has(r)) {
      printIssue('missing', `${r} 文档标记已实现但代码中未找到`);
      apiOk = false;
    }
  }
  // 代码中有但文档完全没提到
  for (const r of codeSet) {
    if (!docSet.has(r)) {
      printIssue('undoc', `${r} 代码中存在但文档未记录`);
      apiOk = false;
    }
  }
  if (apiOk) printOk('API端点与文档一致');

  // --- 总结 ---
  printHeader('校验总结');
  if (totalIssues === 0) {
    console.log('  ✅ 全部通过，AI2AI文档与代码一致');
  } else {
    console.log(`  ⚠️  发现 ${totalIssues} 个不一致项，请更新AI2AI文档`);
  }
  console.log('');
}

verify();
