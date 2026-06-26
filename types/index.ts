/**
 * 类型定义文件
 */

// ==================== 基础类型节点 ====================

/**
 * 原始类型
 */
export interface PrimitiveType {
  kind: 'primitive';
  type: 'string' | 'number' | 'boolean' | 'any' | 'unknown' | 'never' | 'function';
}

/**
 * 数组类型
 */
export interface ArrayType {
  kind: 'array';
  elementType: TSTypeNode;
}

/**
 * 对象类型（接口）
 */
export interface ObjectType {
  kind: 'object';
  properties: PropertyDef[];
  /** 是否为字典类型（索引签名） */
  isRecord?: boolean;
  /** 字典值类型 */
  valueType?: TSTypeNode;
}

/**
 * 属性定义
 */
export interface PropertyDef {
  name: string;
  type: TSTypeNode;
  /** 是否可选 */
  optional: boolean;
}

/**
 * 联合类型
 */
export interface UnionType {
  kind: 'union';
  types: TSTypeNode[];
}

/**
 * 字面量类型
 */
export interface LiteralType {
  kind: 'literal';
  value: string | number | boolean;
}

/**
 * null 类型
 */
export interface NullType {
  kind: 'null';
}

/**
 * undefined 类型
 */
export interface UndefinedType {
  kind: 'undefined';
}

/**
 * 泛型类型
 */
export interface GenericType {
  kind: 'generic';
  name: string;
  typeArgs: TSTypeNode[];
}

/**
 * TS 类型节点（联合类型，支持 discriminated union 类型收窄）
 */
export type TSTypeNode = 
  | PrimitiveType
  | ArrayType
  | ObjectType
  | UnionType
  | LiteralType
  | NullType
  | UndefinedType
  | GenericType;

// ==================== 配置选项 ====================

/**
 * 命名风格
 */
export type NamingStyle = 'PascalCase' | 'camelCase';

/**
 * 输出风格
 */
export type OutputStyle = 'interface' | 'type';

/**
 * 排序方式
 */
export type SortOrder = 'alpha' | 'definition';

/**
 * 生成配置选项
 */
export interface GenerateOptions {
  /** 根类型名称，默认 'Root' */
  rootName?: string;
  
  /** 输出风格：interface 或 type，默认 'interface' */
  outputStyle?: OutputStyle;
  
  /** 命名风格：PascalCase 或 camelCase，默认 'PascalCase' */
  namingStyle?: NamingStyle;
  
  /** 属性排序方式，默认 'alpha' */
  sortProperties?: SortOrder;
  
  /** 是否添加 export 语句，默认 true */
  addExport?: boolean;
  
  /** 是否严格空值（null 单独类型），默认 false */
  strictNullChecks?: boolean;
  
  /** 是否将可选属性标记为 ?，默认 true */
  markOptional?: boolean;
  
  /** 缩进空格数，默认 2 */
  indentSize?: number;
  
  /** 行尾换行符，默认 '\n' */
  lineEnding?: string;
  
  /** 自定义类型名映射 { 字段路径: 类型名 } */
  typeNameMap?: Record<string, string>;
  
  /** 前缀，所有生成的类型名添加此前缀 */
  typePrefix?: string;
  
  /** 后缀，所有生成的类型名添加此后缀 */
  typeSuffix?: string;
}

/**
 * 默认配置
 */
export const DEFAULT_OPTIONS: Required<GenerateOptions> = {
  rootName: 'Root',
  outputStyle: 'interface',
  namingStyle: 'PascalCase',
  sortProperties: 'alpha',
  addExport: true,
  strictNullChecks: false,
  markOptional: true,
  indentSize: 2,
  lineEnding: '\n',
  typeNameMap: {},
  typePrefix: '',
  typeSuffix: '',
};

// ==================== 内部类型 ====================

/**
 * 已命名的类型定义
 */
export interface NamedTypeDef {
  name: string;
  type: TSTypeNode;
}

/**
 * 生成结果
 */
export interface GenerateResult {
  /** 生成的 TypeScript 代码字符串 */
  code: string;
  /** 生成的类型定义列表 */
  types: NamedTypeDef[];
}