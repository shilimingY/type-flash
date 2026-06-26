#!/usr/bin/env node

/**
 * type-flash - CLI 命令行工具
 * 
 * 用法：
 *   type-flash -i input.json -o output.ts
 *   cat data.json | type-flash -n User
 */

const fs = require('fs');
const path = require('path');

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: null,
    output: null,
    rootName: 'Root',
    outputStyle: 'interface',
    namingStyle: 'PascalCase',
    sortProperties: 'alpha',
    addExport: true,
    strictNullChecks: false,
    markOptional: true,
    indentSize: 2,
    typePrefix: '',
    typeSuffix: '',
    typeNameMap: {},
    help: false,
    version: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '-i':
      case '--input':
        options.input = args[++i];
        break;
      case '-o':
      case '--output':
        options.output = args[++i];
        break;
      case '-n':
      case '--name':
        options.rootName = args[++i];
        break;
      case '-s':
      case '--style':
        options.outputStyle = args[++i];
        break;
      case '--naming-style':
        options.namingStyle = args[++i];
        break;
      case '--sort':
        options.sortProperties = args[++i];
        break;
      case '--no-export':
        options.addExport = false;
        break;
      case '--strict-null':
        options.strictNullChecks = true;
        break;
      case '--no-optional':
        options.markOptional = false;
        break;
      case '--indent':
        options.indentSize = parseInt(args[++i], 10);
        break;
      case '--prefix':
        options.typePrefix = args[++i];
        break;
      case '--suffix':
        options.typeSuffix = args[++i];
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-v':
      case '--version':
        options.version = true;
        break;
      default:
        // 未知参数，忽略
        break;
    }
  }

  return options;
}

// 显示帮助
function showHelp() {
  console.log(`
type-flash - JSON 智能生成 TypeScript 类型定义

用法:
  type-flash -i <file> [选项]
  cat data.json | type-flash [选项]

选项:
  -i, --input <file>       输入 JSON 文件路径
  -o, --output <file>      输出 TS 文件路径
  -n, --name <name>        根类型名称 (默认: Root)
  -s, --style <style>      输出风格: interface | type (默认: interface)
      --naming-style <s>   命名风格: PascalCase | camelCase (默认: PascalCase)
      --sort <order>       属性排序: alpha | definition (默认: alpha)
      --no-export          不添加 export 语句
      --strict-null        严格空值模式
      --no-optional        不标记可选属性
      --indent <n>         缩进空格数 (默认: 2)
      --prefix <prefix>    类型名前缀
      --suffix <suffix>    类型名后缀
  -v, --version            显示版本号
  -h, --help               显示帮助

示例:
  type-flash -i data.json -o types.ts
  type-flash -i data.json -n User
  cat data.json | type-flash -s type
`);
}

// 显示版本
function showVersion() {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    console.log(pkg.version);
  } catch (e) {
    console.log('unknown');
  }
}

// 读取标准输入
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    
    process.stdin.on('end', () => {
      resolve(data);
    });
    
    process.stdin.on('error', reject);
    
    // 如果没有输入，超时返回空
    setTimeout(() => {
      if (!data) {
        resolve('');
      }
    }, 100);
  });
}

// 主函数
async function main() {
  const options = parseArgs();

  // 显示帮助
  if (options.help) {
    showHelp();
    return;
  }

  // 显示版本
  if (options.version) {
    showVersion();
    return;
  }

  try {
    // 1. 获取 JSON 数据
    let jsonString;
    
    if (options.input) {
      // 从文件读取
      const inputPath = path.resolve(options.input);
      if (!fs.existsSync(inputPath)) {
        console.error(`错误: 文件不存在 - ${options.input}`);
        process.exit(1);
      }
      jsonString = fs.readFileSync(inputPath, 'utf-8');
    } else {
      // 从标准输入读取
      jsonString = await readStdin();
      if (!jsonString.trim()) {
        console.error('错误: 未提供输入数据。使用 -i 指定文件或通过管道输入');
        console.error('使用 type-flash --help 查看帮助');
        process.exit(1);
      }
    }

    // 2. 解析 JSON
    let jsonData;
    try {
      jsonData = JSON.parse(jsonString);
    } catch (e) {
      console.error(`错误: JSON 解析失败 - ${e.message}`);
      process.exit(1);
    }

    // 3. 生成类型
    // 动态导入生成的模块
    const distPath = path.join(__dirname, '..', 'dist', 'index.js');
    let generate;
    
    try {
      const mod = require(distPath);
      generate = mod.generate || mod.default?.generate;
    } catch (e) {
      console.error(`错误: 加载模块失败 - ${e.message}`);
      console.error('请先运行 npm run build 构建项目');
      process.exit(1);
    }

    if (!generate) {
      console.error('错误: 未找到 generate 函数');
      process.exit(1);
    }

    // 生成类型（generate 直接返回字符串）
    const result = generate(jsonData, {
      rootName: options.rootName,
      outputStyle: options.outputStyle,
      namingStyle: options.namingStyle,
      sortProperties: options.sortProperties,
      addExport: options.addExport,
      strictNullChecks: options.strictNullChecks,
      markOptional: options.markOptional,
      indentSize: options.indentSize,
      typePrefix: options.typePrefix,
      typeSuffix: options.typeSuffix,
    });

    // 4. 输出结果
    if (options.output) {
      const outputPath = path.resolve(options.output);
      fs.writeFileSync(outputPath, result, 'utf-8');
      console.log(`✅ 已生成: ${options.output}`);
    } else {
      console.log(result);
    }

  } catch (e) {
    console.error(`错误: ${e.message}`);
    process.exit(1);
  }
}

main();