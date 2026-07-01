/**
 * type-flash - 命名与去重模块
 * 
 * 核心功能：
 * - 根据字段名 + 上下文自动生成有意义的类型名
 * - 结构等价性判断与类型去重
 * - 循环引用检测与处理
 * - 命名风格转换（PascalCase / camelCase）
 */

import type { TSTypeNode, ObjectType, NamingStyle, NamedTypeDef } from '../types/index';
import { isStructurallyEqual, cloneType, typeToKey } from './type-inferrer';

/**
 * 命名上下文
 */
interface NamingContext {
  /** 当前字段名 */
  fieldName?: string;
  /** 父级类型名 */
  parentName?: string;
  /** 完整字段路径（用于 typeNameMap 匹配） */
  path?: string;
  /** 深度 */
  depth: number;
}

/**
 * 类型命名器
 */
export class TypeNamer {
  /** 已命名的类型映射（结构 key -> 类型名） */
  private namedTypes = new Map<string, string>();
  
  /** 类型名计数器（用于重名时加序号） */
  private nameCounter = new Map<string, number>();
  
  /** 命名风格 */
  private namingStyle: NamingStyle;
  
  /** 类型名前缀 */
  private prefix: string;
  
  /** 类型名后缀 */
  private suffix: string;
  
  /** 自定义类型名映射 */
  private customNameMap: Record<string, string>;
  
  /** 正在处理的对象（用于循环引用检测） */
  private processing = new WeakSet<object>();
  
  /** 循环引用类型名映射 */
  private circularRefs = new Map<string, string>();

  constructor(options: {
    namingStyle?: NamingStyle;
    prefix?: string;
    suffix?: string;
    customNameMap?: Record<string, string>;
  } = {}) {
    this.namingStyle = options.namingStyle || 'PascalCase';
    this.prefix = options.prefix || '';
    this.suffix = options.suffix || '';
    this.customNameMap = options.customNameMap || {};
  }

  /**
   * 为类型生成名称
   * @param type 类型节点
   * @param context 命名上下文
   * @returns 类型名，如果是内联类型则返回 null
   */
  nameType(type: TSTypeNode, context: NamingContext = { depth: 0 }): string | null {
    // 只有对象类型需要命名
    if (type.kind !== 'object') {
      return null;
    }

    // 检查自定义名称映射
    const pathKey = this.buildPathKey(context);
    if (this.customNameMap[pathKey]) {
      return this.applyAffixes(this.customNameMap[pathKey]);
    }

    // 计算结构 key
    const structKey = this.getTypeKey(type);

    // 检查是否已命名
    if (this.namedTypes.has(structKey)) {
      return this.namedTypes.get(structKey)!;
    }

    // 生成新名称
    let name = this.generateName(type, context);
    name = this.formatName(name);       // 应用命名风格
    name = this.ensureUniqueName(name);
    name = this.applyAffixes(name);

    // 记录映射
    this.namedTypes.set(structKey, name);
    return name;
  }

  /**
   * 注册结构 key 别名（用于结构等价但 key 不同的类型复用同一名称）
   */
  registerStructKey(structKey: string, name: string): void {
    this.namedTypes.set(structKey, name);
  }

  /**
   * 生成类型名
   */
  private generateName(type: TSTypeNode, context: NamingContext): string {
    if (type.kind === 'object') {
      // 对象类型名基于字段名和父级名称
      if (context.fieldName) {
        const fieldPascal = this.toPascalCase(context.fieldName);
        if (context.parentName) {
          return `${context.parentName}${fieldPascal}`;
        }
        return fieldPascal;
      }
      
      // 没有字段名时使用默认名称
      if (context.parentName) {
        return `${context.parentName}Item`;
      }
      
      return 'AnonymousObject';
    }

    return 'UnknownType';
  }

  /**
   * 确保名称唯一
   */
  private ensureUniqueName(name: string): string {
    const count = this.nameCounter.get(name) || 0;
    if (count === 0) {
      this.nameCounter.set(name, 1);
      return name;
    }
    
    const uniqueName = `${name}${count + 1}`;
    this.nameCounter.set(name, count + 1);
    return uniqueName;
  }

  /**
   * 应用前后缀
   */
  private applyAffixes(name: string): string {
    let result = name;
    if (this.prefix) {
      result = this.toPascalCase(this.prefix) + result;
    }
    if (this.suffix) {
      result = result + this.toPascalCase(this.suffix);
    }
    return result;
  }

  /**
   * 构建路径 key（用于自定义名称映射）
   */
  private buildPathKey(context: NamingContext): string {
    return context.path || '';
  }

  /**
   * 获取类型的结构 key
   */
  private getTypeKey(type: TSTypeNode): string {
    return typeToKey(type);
  }

  /**
   * 获取简单类型 key（用于属性比较，与 typeToKey 保持一致）
   */
  private getSimpleTypeKey(type: TSTypeNode): string {
    return typeToKey(type);
  }

  /**
   * 转换为 PascalCase
   */
  toPascalCase(str: string): string {
    if (!str) return '';
    
    // 处理各种分隔符
    const words = str
      .replace(/[-_\s]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim()
      .split(' ')
      .filter(Boolean);
    
    return words
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * 转换为 camelCase
   */
  toCamelCase(str: string): string {
    const pascal = this.toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }

  /**
   * 根据命名风格转换
   */
  formatName(name: string): string {
    if (this.namingStyle === 'camelCase') {
      return this.toCamelCase(name);
    }
    return this.toPascalCase(name);
  }

  /**
   * 检查是否为循环引用
   */
  isCircular(obj: object): boolean {
    return this.processing.has(obj);
  }

  /**
   * 标记对象为正在处理
   */
  markProcessing(obj: object): void {
    this.processing.add(obj);
  }

  /**
   * 取消标记
   */
  unmarkProcessing(obj: object): void {
    this.processing.delete(obj);
  }

  /**
   * 获取所有已命名的类型
   */
  getAllNamedTypes(): Map<string, string> {
    return new Map(this.namedTypes);
  }

  /**
   * 重置命名器
   */
  reset(): void {
    this.namedTypes.clear();
    this.nameCounter.clear();
    this.processing = new WeakSet();
    this.circularRefs.clear();
  }
}

/**
 * 类型去重与收集器
 * 遍历类型树，收集所有需要单独定义的命名类型
 */
export class TypeCollector {
  private namer: TypeNamer;
  private collected: NamedTypeDef[] = [];
  private seenStructs = new Set<string>();

  constructor(namer: TypeNamer) {
    this.namer = namer;
  }

  /**
   * 收集类型树中的所有命名类型
   * @param rootType 根类型
   * @param rootName 根类型名
   * @returns 类型定义列表（根类型在最前）
   */
  collect(rootType: TSTypeNode, rootName: string): NamedTypeDef[] {
    this.collected = [];
    this.seenStructs.clear();
    this.namer.reset();

    // 先命名根类型
    // const rootStructKey = this.getStructKey(rootType);
    // this.namer.nameType(rootType, { fieldName: rootName, path: rootName, depth: 0 });
    
    // 递归收集
    this.collectRecursive(rootType, {
      fieldName: rootName,
      parentName: undefined,
      path: rootName,
      depth: 0,
    });

    // 确保根类型在最前面
    const rootDef = this.collected.find(t => t.name === rootName);
    const others = this.collected.filter(t => t.name !== rootName);
    
    return rootDef ? [rootDef, ...others] : this.collected;
  }

  /**
   * 递归收集
   */
  private collectRecursive(type: TSTypeNode, context: {
    fieldName?: string;
    parentName?: string;
    path?: string;
    depth: number;
  }): void {
    const structKey = this.getStructKey(type);

    // 对象类型
    if (type.kind === 'object') {
      const existing = this.collected.find(d => isStructurallyEqual(d.type, type));
      if (existing) {
        this.namer.registerStructKey(structKey, existing.name);
        return;
      }

      const name = this.namer.nameType(type, context);
      
      if (name && !this.seenStructs.has(structKey)) {
        this.seenStructs.add(structKey);
        this.collected.push({
          name,
          type: cloneType(type),
        });

        // 递归处理属性
        for (const prop of type.properties) {
          this.collectRecursive(prop.type, {
            fieldName: prop.name,
            parentName: name,
            path: context.path ? `${context.path}.${prop.name}` : prop.name,
            depth: context.depth + 1,
          });
        }
      }
      return;
    }

    // 数组类型
    if (type.kind === 'array') {
      this.collectRecursive(type.elementType, {
        fieldName: context.fieldName ? context.fieldName + 'Item' : undefined,
        parentName: context.parentName,
        path: context.path,
        depth: context.depth + 1,
      });
      return;
    }

    // 联合类型
    if (type.kind === 'union') {
      for (const t of type.types) {
        this.collectRecursive(t, context);
      }
      return;
    }

    // 泛型类型
    if (type.kind === 'generic') {
      for (const arg of type.typeArgs) {
        this.collectRecursive(arg, {
          ...context,
          depth: context.depth + 1,
        });
      }
      return;
    }

    // 原始类型、null、undefined、字面量等不需要单独定义
  }

  /**
   * 获取结构 key（用于去重）
   */
  private getStructKey(type: TSTypeNode): string {
    return typeToKey(type);
  }
}

/**
 * 工具函数：将字符串转换为合法的标识符
 */
export function toValidIdentifier(name: string): string {
  // 移除非法字符，保留字母、数字、下划线、$
  let result = name.replace(/[^a-zA-Z0-9_$]/g, '_');
  
  // 如果以数字开头，添加下划线前缀
  if (/^\d/.test(result)) {
    result = '_' + result;
  }
  
  return result;
}

/**
 * 工具函数：判断是否为有效的 TypeScript 标识符
 */
export function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}