import getUrls from "get-urls";
import simple_api_pool from "./index.js";

// 延时函数, 单位毫秒
function delay(ms = 1000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 在字符串前面加入时间戳，传入传出字符串
function add_timestamp_prefix(str = "") {
  const now_time_str = new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "long",
  });
  let res_str = "system timestamp: " + now_time_str;
  if (str != "") res_str += "\n" + str;
  return res_str;
}

// 调用jina.ai 返回一个obj
async function call_jina_ai(url = "", config = {}) {
  const default_config = {
    "x-engine": "browser",
    "x-timeout": "30", // 最长等 30 s
    "x-retain-images": "none", // 去掉图片
    "x-base": "final",
    "x-with-shadow-dom": "true",
    "x-no-cache": "true", // 不使用缓存
  };
  config = { ...default_config, ...config, Accept: "application/json" }; // 返回 JSON
  const res = await fetch(`https://r.jina.ai/${url}`, { headers: config });
  const data = await res.json();
  console.log(data);
  return {
    url: data.data.url,
    title: data.data.title,
    description: data.data.description,
    content: data.data.content,
  };
}

// 总结文本中url的信息, input_str, summary_pool, config, delay_ms
async function web_summary(
  input_str = "",
  summary_pool,
  config = {},
  delay_ms = 3000
) {
  const urls = [...getUrls(input_str)];
  if (urls.length === 0) return null;
  let res_str = "以下是来自网页的信息:\n";
  const messages = [
    {
      role: "system",
      content: `你是一个专业高效的网页内容总结助手。你的核心任务是从用户提供的网页文本中提取关键信息，生成结构清晰、客观详细的总结。\n\n#### **任务要求**\n\n1. **总结原则**：\n   - **核心优先**：聚焦主旨论点、关键数据、结论或解决方案。\n   - **客观中立**：忠实反映原文观点，不添加个人评价或推测，使用客观描述（比如：“用户在贴吧发贴”应该写成“有用户在贴吧发帖”）。\n   - **结构清晰**：按「背景→核心内容→结论」的逻辑组织（除非原文结构特殊）。\n   - **短而详细**：在保留具体信息含量越多的情况下，长度越短越好。\n\n2. **优化策略**：\n   - 识别内容类型（新闻/论文/博客/产品页），调整总结重点：\n     - **新闻/报道**：突出 5W1H（Who, What, When, Where, Why, How）。\n     - **技术文档**：强调方法、数据和创新点。\n     - **观点文章**：归纳核心论点和支撑证据。\n     - **社交媒体**：需要关注具体讨论内容。\n   - 保留关键术语和专有名词（如人名、机构、技术术语）。\n\n3. **禁止行为**：\n   - ❌ 添加原文未出现的信息。\n   - ❌ 总结广告、导航栏、重复性页脚内容。,\n   - ❌ 其他不所有必要的额外说明（已过滤xxx，保留xxx）,\n   - ❌ markdown格式，只允许纯文本`,
    },
    { role: "user", content: "" },
  ];
  for (let it of urls) {
    try {
      const web_obj = await call_jina_ai(it, config);
      messages[1].content = JSON.stringify(web_obj);
      let res = messages[1].content;
      if (summary_pool) {
        res = await summary_pool.call_openai_chat({
          messages: messages,
          temperature: 0.3,
        });
        res = res?.choices[0]?.message?.content;
      }
      res_str += `url: ${it}\ntitle: ${web_obj.title}\ncontext: ${res}\n`;
    } catch (err) {
      const err_msg = err instanceof Error ? err.message : String(err);
      res_str += `url: ${it}\nerror: ${err_msg}\n`;
    }
    await delay(delay_ms);
  }
  return res_str;
}

export default { delay, add_timestamp_prefix, call_jina_ai, web_summary };
