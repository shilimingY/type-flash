/**
 * ts-flash - JSON 智能生成 TypeScript 类型定义
 * 
 * 主入口文件
 */

import type { GenerateOptions, ObjectType } from '../types';
import { DEFAULT_OPTIONS } from '../types';
import { inferType } from './type-inferrer';
import { TypeNamer, TypeCollector } from './namer';
import { CodeFormatter } from './formatter';
import { applyEnhancements } from './enhancers';

/**
 * 从 JSON 数据生成 TypeScript 类型定义
 * @param jsonData JSON 数据
 * @param options 配置选项
 * @returns 生成的 TypeScript 代码字符串
 */
export function generate(jsonData: any, options: GenerateOptions = {}): string {
  // 1. 合并默认选项
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 2. 推断基础类型
  let rootType = inferType(jsonData);

  // 3. 应用增强功能（可选属性）
  rootType = applyEnhancements(jsonData, rootType, opts);

  // 4. 创建命名器
  const namer = new TypeNamer({
    namingStyle: opts.namingStyle,
    prefix: opts.typePrefix,
    suffix: opts.typeSuffix,
    customNameMap: opts.typeNameMap,
  });

  // 5. 收集所有命名类型
  const collector = new TypeCollector(namer);
  const typeDefs = collector.collect(rootType, opts.rootName);

  // 6. 格式化输出
  const formatter = new CodeFormatter(opts, namer);
  return formatter.generateOutput(typeDefs, opts.rootName);
}

/**
 * 从 JSON 字符串生成类型定义
 * @param jsonString JSON 字符串
 * @param options 配置选项
 * @returns 生成的 TypeScript 代码字符串
 */
export function generateFromString(jsonString: string, options: GenerateOptions = {}): string {
  const jsonData = JSON.parse(jsonString);
  return generate(jsonData, options);
}

// 导出类型
export type {
  GenerateOptions,
  TSTypeNode,
  ObjectType,
  ArrayType,
  UnionType,
  PrimitiveType,
  PropertyDef,
  GenericType,
  OutputStyle,
  NamingStyle,
  SortOrder,
} from '../types';

// 导出高级 API
export { TypeNamer, TypeCollector } from './namer';
export { CodeFormatter } from './formatter';
export {
  inferType,
  inferArrayType,
  inferObjectType,
  mergeTypes,
  mergeObjects,
  createUnion,
  isStructurallyEqual,
} from './type-inferrer';
export {
  OptionalHandler,
  applyEnhancements,
} from './enhancers';

// 默认导出
export default {
  generate,
  generateFromString,
};