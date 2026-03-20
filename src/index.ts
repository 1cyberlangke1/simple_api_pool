import cron from "node-cron";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";
import type { AppConfig } from "./core/types.js";
import { ConfigStore, getDefaultConfigPath } from "./core/config_store.js";
import { AppRuntime } from "./app_state.js";
import { buildApp } from "./app.js";
import { logger } from "./core/logger.js";
import { validateConfig } from "./core/config_schema.js";

// Load config from JSON file
// 使用 process.cwd() 确保编译后也能正确找到配置文件
const configPath = path.resolve(process.cwd(), "config", "setting.json");

// 检查配置文件是否存在
if (!existsSync(configPath)) {
  console.error(`[ERROR] Config file not found: ${configPath}`);
  console.error("Please copy config/setting.example.json to config/setting.json and configure it.");
  process.exit(1);
}

let config: unknown;
try {
  config = JSON.parse(readFileSync(configPath, "utf-8"));
} catch (e) {
  console.error(`[ERROR] Failed to parse config file: ${configPath}`);
  console.error(e);
  process.exit(1);
}

// 验证配置
const validationResult = validateConfig(config);
if (!validationResult.success) {
  console.error("[ERROR] Config validation failed:");
  for (const err of validationResult.errors || []) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

const validConfig = validationResult.data as AppConfig;

/**
 * 启动服务入口
 * @description 初始化配置、运行态并启动 Fastify 服务
 */
async function bootstrap() {
  // 使用 process.cwd() 作为项目根目录
  const rootDir = process.cwd();
  const configStore = new ConfigStore(validConfig, configPath);

  // 创建应用运行态
  const runtime = new AppRuntime(configStore.getConfig());

  // 构建 Fastify 应用
  const app = await buildApp(runtime, (nextConfig) => configStore.updateConfig(nextConfig));

  // 启动服务
  try {
    await app.listen({
      port: runtime.config.server.port,
      host: runtime.config.server.host,
    });
    app.log.info(`Server listening on http://${runtime.config.server.host}:${runtime.config.server.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // 每日重置 key 使用计数（按 Provider 的 resetTime 分组调度）
  const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // 收集所有唯一的 resetTime，默认为 "00:00"
  const resetTimeMap = new Map<string, string[]>();
  for (const provider of runtime.config.providers) {
    const resetTime = provider.resetTime || "00:00";
    if (!resetTimeMap.has(resetTime)) {
      resetTimeMap.set(resetTime, []);
    }
    resetTimeMap.get(resetTime)!.push(provider.name);
  }

  // 为每个 resetTime 创建独立的 cron 任务
  for (const [resetTime, providerNames] of resetTimeMap) {
    const [hour, minute] = resetTime.split(":").map(Number);
    const cronExpression = `${minute} ${hour} * * *`;
    
    cron.schedule(
      cronExpression,
      () => {
        // 重置指定提供商的 Key
        for (const providerName of providerNames) {
          runtime.keyStore.resetDailyByProvider(providerName);
        }
        app.log.info(`Daily key usage reset for providers: ${providerNames.join(", ")} at ${resetTime}`);
      },
      {
        scheduled: true,
        timezone: systemTimezone,
      }
    );
    
    app.log.info(`Scheduled daily reset at ${resetTime} for providers: ${providerNames.join(", ")}`);
  }

  // 优雅关闭
  const signals = ["SIGINT", "SIGTERM"] as const;
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, closing server...`);
      await app.close();
      process.exit(0);
    });
  }
}

bootstrap().catch((err) => {
  console.error("[ERROR] Bootstrap failed:");
  console.error(err);
  logger.error({ error: err instanceof Error ? err.message : String(err) }, "Bootstrap failed");
  process.exit(1);
});
