/**
 * type-flash - 格式化输出模块
 * 
 * 核心功能：
 * - 将类型节点格式化为 TypeScript 代码字符串
 * - 支持 interface 和 type alias 两种输出风格
 * - 自动缩进、排序
 */

import type { 
  TSTypeNode, 
  ObjectType, 
  ArrayType, 
  UnionType, 
  GenericType,
  PrimitiveType,
  PropertyDef,
  GenerateOptions, 
  NamedTypeDef 
} from '../types';
import { DEFAULT_OPTIONS } from '../types';
import { TypeNamer } from './namer';
import { isStructurallyEqual } from './type-inferrer';

/**
 * 代码格式化器
 */
export class CodeFormatter {
  private options: Required<GenerateOptions>;
  private namer: TypeNamer;
  
  /** 所有已命名的类型列表（用于查找引用） */
  private allNamedTypes: NamedTypeDef[] = [];

  constructor(options: Required<GenerateOptions>, namer: TypeNamer) {
    this.options = options;
    this.namer = namer;
  }

  /** 当前行尾换行符 */
  private get eol(): string {
    return this.options.lineEnding;
  }

  /** 将多行文本按配置的行尾符连接 */
  private joinLines(lines: string[]): string {
    return lines.join(this.eol);
  }

  /**
   * 查找类型对应的命名（用于对象类型引用）
   */
  private findTypeName(type: TSTypeNode): string | null {
    if (type.kind !== 'object') {
      return null;
    }
    for (const named of this.allNamedTypes) {
      if (named.type === type || isStructurallyEqual(named.type, type)) {
        return named.name;
      }
    }
    return null;
  }

  /**
   * 格式化单个类型定义
   */
  formatTypeDef(typeDef: NamedTypeDef): string {
    const { name, type } = typeDef;
    const exportKeyword = this.options.addExport ? 'export ' : '';
    return this.formatObjectType(name, type as ObjectType, exportKeyword);
  }

  /**
   * 格式化对象类型（interface 或 type）
   */
  private formatObjectType(
    name: string,
    type: ObjectType,
    exportKeyword: string
  ): string {
    const indent = ' '.repeat(this.options.indentSize);
    const properties = this.sortProperties(type.properties);

    const lines: string[] = [];

    // 类型声明
    if (this.options.outputStyle === 'interface') {
      lines.push(`${exportKeyword}interface ${name} {`);
    } else {
      lines.push(`${exportKeyword}type ${name} = {`);
    }

    // 属性
    for (const prop of properties) {
      const propName = this.formatPropertyName(prop.name);
      const optionalMark = prop.optional ? '?' : '';
      const propType = this.formatType(prop.type);
      lines.push(`${indent}${propName}${optionalMark}: ${propType};`);
    }

    // 结束
    if (this.options.outputStyle === 'interface') {
      lines.push('}');
    } else {
      lines.push('};');
    }

    return this.joinLines(lines);
  }

  /**
   * 格式化类型节点为字符串
   */
  private formatType(type: TSTypeNode): string {
    // 如果是对象类型，先查找是否有对应的命名
    if (type.kind === 'object') {
      const typeName = this.findTypeName(type);
      if (typeName) {
        return typeName;
      }
    }

    switch (type.kind) {
      case 'primitive':
        return type.type;
      case 'null':
        return 'null';
      case 'undefined':
        return 'undefined';
      case 'array':
        return this.formatArrayType(type);
      case 'object':
        return this.formatInlineObject(type);
      case 'union':
        return this.formatUnionType(type.types);
      case 'literal':
        return this.formatLiteral(type.value);
      case 'generic':
        return `${type.name}<${type.typeArgs.map(t => this.formatType(t)).join(', ')}>`;
      default:
        return 'unknown';
    }
  }

  /**
   * 格式化字面量
   */
  private formatLiteral(value: string | number | boolean): string {
    if (typeof value === 'string') {
      return `'${value}'`;
    }
    return String(value);
  }

  /**
   * 格式化数组类型
   */
  private formatArrayType(type: ArrayType): string {
    const elementStr = this.formatType(type.elementType);
    
    // 如果元素类型是联合类型，需要加括号
    if (type.elementType.kind === 'union') {
      return `(${elementStr})[]`;
    }
    
    return `${elementStr}[]`;
  }

  /**
   * 格式化内联对象类型
   */
  private formatInlineObject(type: ObjectType): string {
    const indent = ' '.repeat(this.options.indentSize);
    const properties = this.sortProperties(type.properties);

    if (properties.length === 0) {
      return '{}';
    }

    const lines: string[] = ['{'];

    for (const prop of properties) {
      const propName = this.formatPropertyName(prop.name);
      const optionalMark = prop.optional ? '?' : '';
      const propType = this.formatType(prop.type);
      lines.push(`${indent}${propName}${optionalMark}: ${propType};`);
    }

    lines.push('}');

    return this.joinLines(lines);
  }

  /**
   * 格式化联合类型
   */
  private formatUnionType(types: TSTypeNode[]): string {
    return types.map(t => this.formatType(t)).join(' | ');
  }

  /**
   * 格式化属性名（非法标识符用引号包裹）
   */
  private formatPropertyName(name: string): string {
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
      return name;
    }
    return `'${name}'`;
  }

  /**
   * 排序属性
   */
  private sortProperties(properties: PropertyDef[]): PropertyDef[] {
    if (this.options.sortProperties === 'definition') {
      return [...properties];
    }
    return [...properties].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 格式化所有类型定义
   */
  formatAll(typeDefs: NamedTypeDef[]): string {
    this.allNamedTypes = typeDefs;
    return typeDefs.map(def => this.formatTypeDef(def)).join(`${this.eol}${this.eol}`);
  }

  /**
   * 生成完整输出代码
   */
  generateOutput(typeDefs: NamedTypeDef[], rootTypeName: string): string {
    const header = this.joinLines([
      '/**',
      ' * Generated by type-flash',
      ` * Root type: ${rootTypeName}`,
      ' */',
    ]);

    const body = this.formatAll(typeDefs);

    return `${header}${this.eol}${this.eol}${body}${this.eol}`;
  }
}