/**
 * type-flash - 增强功能模块
 *
 * 核心功能：
 * - 可选属性处理
 */

import type {
  TSTypeNode,
  ObjectType,
  GenerateOptions,
} from '../types';

/**
 * 可选属性处理器
 */
export class OptionalHandler {
  private markOptional: boolean;
  private seen = new WeakSet<ObjectType>();

  constructor(markOptional: boolean = true) {
    this.markOptional = markOptional;
  }

  process(jsonData: any, type: TSTypeNode): TSTypeNode {
    if (!this.markOptional) {
      return type;
    }
    return this.processRecursive(jsonData, type);
  }

  private processRecursive(data: any, type: TSTypeNode): TSTypeNode {
    if (type.kind === 'array' && Array.isArray(data)) {
      const { elementType } = type;
      if (elementType.kind === 'object') {
        let newElementType = data.length > 1
          ? this.processArrayObjects(data, elementType)
          : elementType;
        for (const item of data) {
          if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
            newElementType = this.processRecursive(item, newElementType) as ObjectType;
          }
        }
        return { ...type, elementType: newElementType };
      }
      return {
        ...type,
        elementType: this.processRecursive(data[0], elementType),
      };
    }

    if (type.kind === 'object' && data && typeof data === 'object' && !Array.isArray(data)) {
      if (this.seen.has(type)) return type;
      this.seen.add(type);

      const resultObj: ObjectType = {
        ...type,
        properties: type.properties.map(prop => {
          if (prop.type === type) {
            return { ...prop };
          }
          return {
            ...prop,
            type: this.processRecursive((data as Record<string, any>)[prop.name], prop.type),
          };
        }),
      };

      for (const prop of resultObj.properties) {
        prop.type = this.relinkReferences(prop.type, type, resultObj);
      }

      this.seen.delete(type);
      return resultObj;
    }

    if (type.kind === 'union' && Array.isArray(data)) {
      return {
        ...type,
        types: type.types.map(subType => this.processRecursive(data, subType)),
      };
    }

    return type;
  }

  /** 将子树中对 oldRef 的引用替换为 newRef，保持循环引用一致 */
  private relinkReferences(node: TSTypeNode, oldRef: TSTypeNode, newRef: TSTypeNode): TSTypeNode {
    if (node === oldRef) {
      return newRef;
    }

    switch (node.kind) {
      case 'array':
        return { ...node, elementType: this.relinkReferences(node.elementType, oldRef, newRef) };
      case 'object':
        return {
          ...node,
          properties: node.properties.map(prop => ({
            ...prop,
            type: this.relinkReferences(prop.type, oldRef, newRef),
          })),
        };
      case 'union':
        return { ...node, types: node.types.map(t => this.relinkReferences(t, oldRef, newRef)) };
      default:
        return node;
    }
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
  if (!options.markOptional) {
    return type;
  }

  const optionalHandler = new OptionalHandler(options.markOptional);
  return optionalHandler.process(jsonData, type);
}
