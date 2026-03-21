/**
 * 文件记忆工具
 * @description 简单的基于文件的记忆工具，以日期为文件名存储和读取记忆内容
 * @module tools/js_tools/memory
 */

import type { JSONSchema7 } from "json-schema";

/**
 * 工具定义接口
 */
export interface JsToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema7;
  code: string;
  category: string;
  tags: string[];
}

/**
 * 文件记忆工具定义
 */
export const MEMORY_TOOL: JsToolDefinition = {
  name: "memory",
  description: "简单的基于文件的记忆工具，以日期为文件名存储和读取记忆内容",
  category: "记忆",
  tags: ["文件", "记忆", "持久化"],

  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["save", "load", "list"],
        description: "操作类型: save (保存), load (读取), list (列出所有记忆文件)",
      },
      content: {
        type: "string",
        description: "要保存的记忆内容 (仅 save 操作需要)",
      },
      date: {
        type: "string",
        description: "日期 (格式: YYYY-MM-DD)，不指定则使用今天",
      },
    },
    required: ["action"],
  },

  code: `// 文件记忆工具
// 输入: action (操作类型), content (内容), date (日期)
// 输出: 操作结果

const { action, content, date } = args;

// 格式化日期为文件名
function formatDate(d) {
  var year = d.getFullYear();
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

// 获取目标日期
var targetDate = date || formatDate(new Date());
var filename = 'memory_' + targetDate + '.txt';

switch (action) {
  case 'save': {
    if (!content) {
      throw new Error('保存操作需要提供 content 参数');
    }
    
    // 如果文件已存在，追加内容
    var existingContent = '';
    if (fs.exists(filename)) {
      existingContent = fs.readFile(filename) + '\n';
    }
    
    // 添加时间戳
    var timestamp = new Date().toISOString();
    var newContent = existingContent + '[' + timestamp + ']\n' + content + '\n';
    
    fs.writeFile(filename, newContent);
    
    return {
      success: true,
      message: '记忆已保存到 ' + filename,
      filename: filename,
      timestamp: timestamp
    };
  }
  
  case 'load': {
    if (!fs.exists(filename)) {
      return {
        success: false,
        message: '没有找到 ' + targetDate + ' 的记忆',
        content: null
      };
    }
    
    var loadedContent = fs.readFile(filename);
    return {
      success: true,
      filename: filename,
      date: targetDate,
      content: loadedContent
    };
  }
  
  case 'list': {
    // 列出所有记忆文件
    var files = fs.listDir('.');
    var memoryFiles = files
      .filter(function(f) { return f.startsWith('memory_') && f.endsWith('.txt'); })
      .sort()
      .reverse();
    
    return {
      success: true,
      files: memoryFiles,
      count: memoryFiles.length
    };
  }
  
  default:
    throw new Error('不支持的操作: ' + action);
}`,
};

export default MEMORY_TOOL;
