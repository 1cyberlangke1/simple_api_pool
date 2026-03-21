import axios from "axios";
import { ElMessage } from "element-plus";

const api = axios.create({
  baseURL: "/admin/api",
  timeout: 30000,
});

/** 401 错误处理标志，防止重复显示错误消息 */
let isHandling401 = false;

/** Token 存储键名 */
const TOKEN_KEY = "admin_token";

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    // 直接从 localStorage 读取 token，避免 Pinia store 初始化顺序问题
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // 重置 401 处理标志
    isHandling401 = false;
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 防止多个并发请求同时触发重复的错误消息
      if (!isHandling401) {
        isHandling401 = true;
        // 直接清除 localStorage，避免依赖 Pinia store
        localStorage.removeItem(TOKEN_KEY);
        ElMessage.error("认证失败，请重新登录");
        // 延迟跳转，让用户看到错误消息
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
      }
    } else {
      ElMessage.error(error.response?.data?.error || error.message || "请求失败");
    }
    return Promise.reject(error);
  }
);

// ============================================================
// Chat API（不需要认证，OpenAI 兼容接口）
// ============================================================

/** 聊天请求体 */
export interface ChatRequestBody {
  model: string;
  messages: Array<{ role: string; content: string; name?: string; tool_call_id?: string }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: Array<{ type: string; function: { name: string } }>;
  [key: string]: unknown;
}

/** 聊天响应 */
export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const CHAT_API_URL = "/v1/chat/completions";

// ============================================================
// Models API（OpenAI 兼容接口，无需认证）
// ============================================================

/**
 * 模型信息
 */
export interface ModelInfo {
  id: string;
  object: "model";
}

/**
 * 模型列表响应
 */
export interface ModelsResponse {
  object: "list";
  data: ModelInfo[];
}

/**
 * 获取可用模型列表
 * @returns 模型列表
 */
export async function getModels(): Promise<ModelsResponse> {
  const response = await fetch("/v1/models");

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch models");
  }

  return response.json();
}

/**
 * 发送非流式聊天请求
 * @param body 请求体
 * @returns 聊天响应
 */
export async function sendChatRequest(body: ChatRequestBody): Promise<ChatResponse> {
  const response = await fetch(CHAT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorData: Record<string, unknown>;
    try {
      errorData = JSON.parse(errorBody);
    } catch {
      errorData = { raw: errorBody };
    }
    // 安全提取错误信息，处理对象类型的 error 字段
    const errorInfo = errorData.error;
    let errorMessage = "Request failed";
    if (typeof errorInfo === "object" && errorInfo !== null && "message" in errorInfo) {
      errorMessage = String((errorInfo as { message: string }).message);
    } else if (typeof errorInfo === "string") {
      errorMessage = errorInfo;
    } else if (errorInfo !== undefined) {
      errorMessage = JSON.stringify(errorInfo);
    }
    const err = new Error(errorMessage) as Error & { response: unknown };
    err.response = errorData;
    throw err;
  }

  return response.json();
}

/**
 * 发送流式聊天请求
 * @param body 请求体
 * @returns ReadableStream reader
 */
export async function sendChatStreamRequest(
  body: ChatRequestBody
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const response = await fetch(CHAT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorData: Record<string, unknown>;
    try {
      errorData = JSON.parse(errorBody);
    } catch {
      errorData = { raw: errorBody };
    }
    // 安全提取错误信息，处理对象类型的 error 字段
    const errorInfo = errorData.error;
    let errorMessage = "Request failed";
    if (typeof errorInfo === "object" && errorInfo !== null && "message" in errorInfo) {
      errorMessage = String((errorInfo as { message: string }).message);
    } else if (typeof errorInfo === "string") {
      errorMessage = errorInfo;
    } else if (errorInfo !== undefined) {
      errorMessage = JSON.stringify(errorInfo);
    }
    const err = new Error(errorMessage) as Error & { response: unknown };
    err.response = errorData;
    throw err;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No reader available");
  }

  return reader;
}

/** 聊天 API URL（用于测试验证） */
export const CHAT_API_ENDPOINT = CHAT_API_URL;

export default api;
