/**
 * type-flash - 增强功能模块
 * 
 * 核心功能：
 * - 泛型提取（如 PageResult<T>）
 * - 空值处理
 * - 可选属性处理
 */

import type { 
  TSTypeNode, 
  ObjectType, 
  ArrayType, 
  GenericType,
  PrimitiveType,
  GenerateOptions 
} from '../types';

/**
 * 空值处理器
 */
export class NullHandler {
  private strict: boolean;
  // 循环对象缓存，防止循环引用无限递归爆栈
  private seen = new WeakSet<ObjectType>();

  constructor(strict: boolean = false) {
    this.strict = strict;
  }

  process(type: TSTypeNode): TSTypeNode {
    // 调用内部递归方法，传入空缓存
    return this.processRecursive(type);
  }

  // 内部递归函数，增加循环检测逻辑
  private processRecursive(type: TSTypeNode): TSTypeNode {
    if (this.strict) {
      return type;
    }

    // 联合类型中移除 null
    if (type.kind === 'union') {
      const nonNullTypes = type.types.filter(t => t.kind !== 'null');
      if (nonNullTypes.length === 0) {
        return { kind: 'null' };
      }
      if (nonNullTypes.length === 1) {
        return nonNullTypes[0];
      }
      return { ...type, types: nonNullTypes.map(t => this.processRecursive(t)) };
    }

    // 递归处理
    if (type.kind === 'array') {
      return {
        ...type,
        elementType: this.processRecursive(type.elementType),
      };
    }

    if (type.kind === 'object') {
      // 循环引用拦截
      if (this.seen.has(type)) return type;
      this.seen.add(type);

      const resultObj = {
        ...type,
        properties: type.properties.map(prop => ({
          ...prop,
          type: this.processRecursive(prop.type),
        })),
      };

      this.seen.delete(type);
      return resultObj;
    }

    return type;
  }
}

/**
 * 可选属性处理器
 */
export class OptionalHandler {
  private markOptional: boolean;
  // 循环对象缓存，防止循环引用无限递归爆栈
  private seen = new WeakSet<ObjectType>();

  constructor(markOptional: boolean = true) {
    this.markOptional = markOptional;
  }

  process(jsonData: any, type: TSTypeNode): TSTypeNode {
    if (!this.markOptional) {
      return type;
    }
    // 调用带缓存的递归处理
    return this.processRecursive(jsonData, type);
  }

  // 递归处理方法，增加循环检测
  private processRecursive(data: any, type: TSTypeNode): TSTypeNode {
    // 数组中的对象，根据字段出现频率判断是否可选
    if (type.kind === 'array' && Array.isArray(data)) {
      const elementType = type.elementType;
      if (elementType.kind === 'object') {
        const newElementType = this.processArrayObjects(data, elementType);
        return { ...type, elementType: newElementType };
      }
      // 递归处理数组子类型
      return {
        ...type,
        elementType: this.processRecursive(data, elementType)
      };
    }

    // 递归处理对象属性，拦截循环引用
    if (type.kind === 'object' && data && typeof data === 'object') {
      if (this.seen.has(type)) return type;
      this.seen.add(type);

      const newProps = type.properties.map(prop => ({
        ...prop,
        type: this.processRecursive((data as Record<string, any>)[prop.name], prop.type)
      }));

      this.seen.delete(type);
      return { ...type, properties: newProps };
    }

    // 联合类型递归子节点
    if (type.kind === 'union' && Array.isArray(data)) {
      return {
        ...type,
        types: type.types.map(subType => this.processRecursive(data, subType))
      };
    }

    return type;
  }

  private processArrayObjects(items: any[], objType: ObjectType): ObjectType {
    if (items.length <= 1) {
      return objType;
    }

    const fieldCounts: Record<string, number> = {};
    const total = items.length;

    for (const item of items) {
      if (item && typeof item === 'object') {
        for (const key of Object.keys(item)) {
          fieldCounts[key] = (fieldCounts[key] || 0) + 1;
        }
      }
    }

    return {
      ...objType,
      properties: objType.properties.map(prop => {
        const count = fieldCounts[prop.name] || 0;
        const optional = count < total;
        return { ...prop, optional };
      }),
    };
  }
}

/**
 * 应用所有增强功能
 */
export function applyEnhancements(jsonData: any, type: TSTypeNode, options: GenerateOptions): TSTypeNode {
  let result = type;

  // 1. 可选属性处理
  if (options.markOptional) {
    const optionalHandler = new OptionalHandler(options.markOptional);
    result = optionalHandler.process(jsonData, result);
  }

  // 3. 空值处理
  const nullHandler = new NullHandler(options.strictNullChecks);
  result = nullHandler.process(result);

  return result;
}