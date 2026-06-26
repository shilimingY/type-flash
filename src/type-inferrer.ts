/**
 * type-flash - 类型推断引擎
 * 
 * 核心功能：
 * - 基础类型识别（string、number、boolean、null、undefined）
 * - 数组类型识别与元素类型统一
 * - 对象类型递归遍历
 * - 联合类型推断与合并
 * - 可选属性识别
 * - 空值处理
 * - 循环引用检测
 * - 结构等价性判断
 */

import type {
  TSTypeNode,
  PrimitiveType,
  ArrayType,
  ObjectType,
  UnionType,
  NullType,
  UndefinedType,
  LiteralType,
  PropertyDef,
} from '../types';

/**
 * 创建原始类型节点
 */
export function createPrimitive(type: PrimitiveType['type']): PrimitiveType {
  return { kind: 'primitive', type };
}

/**
 * 创建 null 类型节点
 */
export function createNull(): NullType {
  return { kind: 'null' };
}

/**
 * 创建 undefined 类型节点
 */
export function createUndefined(): UndefinedType {
  return { kind: 'undefined' };
}

/**
 * 创建字面量类型节点
 */
export function createLiteral(value: string | number | boolean): LiteralType {
  return { kind: 'literal', value };
}

/**
 * 创建数组类型节点
 */
export function createArray(elementType: TSTypeNode): ArrayType {
  return { kind: 'array', elementType };
}

/**
 * 创建对象类型节点
 */
export function createObject(properties: PropertyDef[] = []): ObjectType {
  return { kind: 'object', properties };
}

/**
 * 创建联合类型节点
 */
export function createUnion(types: TSTypeNode[]): UnionType {
  // 去重与扁平化
  const flattened: TSTypeNode[] = [];
  const seen = new Set<string>();

  for (const t of types) {
    if (t.kind === 'union') {
      // 扁平化嵌套联合类型
      for (const inner of t.types) {
        const key = typeToKey(inner);
        if (!seen.has(key)) {
          seen.add(key);
          flattened.push(inner);
        }
      }
    } else {
      const key = typeToKey(t);
      if (!seen.has(key)) {
        seen.add(key);
        flattened.push(t);
      }
    }
  }

  // 只有一个类型时直接返回
  if (flattened.length === 1) {
    return flattened[0] as UnionType;
  }

  return { kind: 'union', types: flattened };
}

/**
 * 类型节点转字符串 key（用于去重比较）
 */
function typeToKey(type: TSTypeNode): string {
  switch (type.kind) {
    case 'primitive':
      return `primitive:${type.type}`;
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
    case 'literal':
      return `literal:${typeof type.value}:${String(type.value)}`;
    case 'array':
      return `array:${typeToKey(type.elementType)}`;
    case 'object':
      return `object:${type.properties.map(p => `${p.name}:${typeToKey(p.type)}:${p.optional}`).join(',')}`;
    case 'union':
      return `union:${type.types.map(typeToKey).sort().join('|')}`;
    case 'generic':
      return `generic:${type.name}:${type.typeArgs.map(typeToKey).join(',')}`;
    default:
      return 'unknown';
  }
}

/**
 * 合并两个类型为联合类型
 */
export function mergeTypes(a: TSTypeNode, b: TSTypeNode): TSTypeNode {
  // 相同类型直接返回
  if (typeToKey(a) === typeToKey(b)) {
    return a;
  }

  // 对象类型特殊合并
  if (a.kind === 'object' && b.kind === 'object') {
    return mergeObjects(a, b);
  }

  // 数组类型特殊合并
  if (a.kind === 'array' && b.kind === 'array') {
    return createArray(mergeTypes(a.elementType, b.elementType));
  }

  // 其他情况合并为联合类型
  return createUnion([a, b]);
}

/**
 * 合并两个对象类型
 * - 相同字段合并类型
 * - 仅在一个对象中存在的字段标记为可选
 */
export function mergeObjects(a: ObjectType, b: ObjectType): ObjectType {
  const propsMap = new Map<string, PropertyDef>();

  // 先加入 a 的所有属性
  for (const prop of a.properties) {
    propsMap.set(prop.name, { ...prop });
  }

  // 合并 b 的属性
  for (const prop of b.properties) {
    const existing = propsMap.get(prop.name);
    if (existing) {
      // 字段都存在，合并类型
      existing.type = mergeTypes(existing.type, prop.type);
      // 只要有一个是可选，结果就是可选
      existing.optional = existing.optional || prop.optional;
    } else {
      // 新字段，标记为可选（因为不是所有对象都有）
      propsMap.set(prop.name, {
        ...prop,
        optional: true,
      });
    }
  }

  // 检查 a 中有但 b 中没有的字段，标记为可选
  for (const [name, prop] of propsMap) {
    const inB = b.properties.some(p => p.name === name);
    if (!inB) {
      prop.optional = true;
    }
  }

  return createObject(Array.from(propsMap.values()));
}

/**
 * 推断单个值的类型
 * seen 循环缓存参数，默认新建 WeakSet
 */
export function inferType(value: unknown, seen = new WeakSet<object>()): TSTypeNode {
  if (value === null) {
    return createNull();
  }

  if (value === undefined) {
    return createUndefined();
  }

  if (typeof value === 'function') {
    return createPrimitive('function');
  }

  if (typeof value === 'string') {
    return createPrimitive('string');
  }

  if (typeof value === 'number') {
    return createPrimitive('number');
  }

  if (typeof value === 'boolean') {
    return createPrimitive('boolean');
  }

  if (Array.isArray(value)) {
    // 传入 seen 缓存
    return inferArrayType(value, seen);
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    // 检测循环引用：已遍历过直接返回空对象类型，阻断无限递归
    if (seen.has(obj)) {
      return { kind: 'object', properties: [] };
    }
    seen.add(obj);
    const result = inferObjectType(obj, seen);
    seen.delete(obj);
    return result;
  }

  return createPrimitive('unknown');
}

/**
 * 推断数组类型
 * - 统一提取元素类型
 * - 元素类型不一致时生成联合类型
 */
export function inferArrayType(arr: unknown[], seen: WeakSet<object>): ArrayType {
  if (arr.length === 0) {
    return {
      kind: 'array',
      elementType: { kind: 'primitive', type: 'any' }
    };
  }

  // 推断每个元素的类型，传入共享seen缓存
  const elementTypes = arr.map(item => inferType(item, seen));

  // 合并所有元素类型
  let unifiedType = elementTypes[0];
  for (let i = 1; i < elementTypes.length; i++) {
    unifiedType = mergeTypes(unifiedType, elementTypes[i]);
  }

  return {
    kind: 'array',
    elementType: unifiedType
  };
}

/**
 * 推断对象类型
 */
export function inferObjectType(obj: Record<string, unknown>, seen: WeakSet<object>): ObjectType {
  const properties: PropertyDef[] = [];

  for (const [key, value] of Object.entries(obj)) {
    // 递归推断子类型，传递循环引用缓存seen
    const type = inferType(value, seen);
    properties.push({
      name: key,
      type,
      optional: false,
    });
  }

  return createObject(properties);
}

/**
 * 从多个值推断统一类型
 * 用于数组元素类型合并、同名字段类型合并等场景
 */
export function inferUnionType(values: unknown[]): TSTypeNode {
  if (values.length === 0) {
    return createPrimitive('never');
  }

  let result = inferType(values[0]);
  for (let i = 1; i < values.length; i++) {
    result = mergeTypes(result, inferType(values[i]));
  }

  return result;
}

/**
 * 判断两个类型是否结构等价
 * 用于类型去重与复用
 */
export function isStructurallyEqual(a: TSTypeNode, b: TSTypeNode): boolean {
  return typeToKey(a) === typeToKey(b);
}

/**
 * 检查类型是否包含 null
 */
export function containsNull(type: TSTypeNode): boolean {
  if (type.kind === 'null') return true;
  if (type.kind === 'union') {
    return type.types.some(t => t.kind === 'null');
  }
  return false;
}

/**
 * 从类型中移除 null（非严格空值模式）
 */
export function removeNull(type: TSTypeNode): TSTypeNode {
  if (type.kind === 'null') {
    // 只有 null 时返回 any？或者保留 null
    return type;
  }
  if (type.kind === 'union') {
    const filtered = type.types.filter(t => t.kind !== 'null');
    if (filtered.length === 0) return createPrimitive('unknown');
    if (filtered.length === 1) return filtered[0];
    return createUnion(filtered);
  }
  return type;
}

/**
 * 收集对象中所有字符串字段的取值
 * 用于枚举提取
 */
export function collectStringValues(
  values: unknown[],
  fieldPath: string
): string[] {
  const result = new Set<string>();

  for (const val of values) {
    const fieldValue = getNestedValue(val, fieldPath);
    if (typeof fieldValue === 'string') {
      result.add(fieldValue);
    }
  }

  return Array.from(result);
}

/**
 * 获取嵌套字段值
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;

  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * 深度克隆类型节点
 */
export function cloneType<T extends TSTypeNode>(type: T, cache = new WeakMap<TSTypeNode, TSTypeNode>()): T {
  // 已克隆过该类型，直接返回缓存结果，阻断循环递归
  if (cache.has(type)) {
    return cache.get(type) as T;
  }

  // 先创建空占位存入缓存，防止子节点递归时重复克隆
  let copy: TSTypeNode;
  switch (type.kind) {
    case 'primitive':
      copy = { kind: 'primitive', type: type.type };
      cache.set(type, copy);
      return copy as T;
    case 'null':
      copy = { kind: 'null' };
      cache.set(type, copy);
      return copy as T;
    case 'undefined':
      copy = { kind: 'undefined' };
      cache.set(type, copy);
      return copy as T;
    case 'literal':
      copy = { kind: 'literal', value: type.value };
      cache.set(type, copy);
      return copy as T;
    case 'array': {
      copy = { kind: 'array', elementType: {} as TSTypeNode };
      cache.set(type, copy);
      copy.elementType = cloneType(type.elementType, cache);
      return copy as T;
    }
    case 'object': {
      copy = {
        kind: 'object',
        properties: [],
        isRecord: type.isRecord,
        valueType: type.valueType
      };
      cache.set(type, copy);
      copy.properties = type.properties.map(p => ({
        name: p.name,
        optional: p.optional,
        type: cloneType(p.type, cache),
      }));
      // 同步复制可选字段 valueType
      if (type.valueType) {
        copy.valueType = cloneType(type.valueType, cache);
      }
      return copy as T;
    }
    case 'union': {
      copy = { kind: 'union', types: [] };
      cache.set(type, copy);
      copy.types = type.types.map(t => cloneType(t, cache));
      return copy as T;
    }
    case 'generic': {
      copy = { kind: 'generic', name: type.name, typeArgs: [] };
      cache.set(type, copy);
      copy.typeArgs = type.typeArgs.map(t => cloneType(t, cache));
      return copy as T;
    }
    default:
      copy = { kind: 'primitive', type: 'unknown' };
      cache.set(type, copy);
      return copy as T;
  }
}
