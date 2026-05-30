// Bob 通用 AI 处理器插件 v0.2.0
// 支持多厂商 + 内置模板 + 思考等级控制

function supportLanguages() {
  return ['auto', 'zh-Hans', 'zh-Hant', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru'];
}

// ==================== 内置模板定义 ====================
const PRESET_TEMPLATES = {
  code_explainer: {
    name: "代码深度解释",
    system: `你是一位经验丰富的软件工程师和编程导师，专注于帮助开发者深入理解代码和技术概念。

核心原则：
- 始终使用简体中文回答
- 结构化表达：先总结、再拆解、后升华
- 重点突出学习价值和实践要点
- 对代码要解释“为什么这样写”而非仅描述做了什么
- 指出潜在风险、性能问题或改进空间
- 必要时给出最小可运行示例

保持专业、耐心、易懂的语气。`,
    user: `请深入分析并解释以下内容（代码/文本/文档均可），帮助我真正理解和学习：

\`\`\`
$text
\`\`\`

请严格按照以下结构用中文输出：

## 核心目的
用一句话说明这段内容要解决什么问题。

## 关键逻辑拆解
按执行顺序或模块结构，解释最重要的部分（重点说清楚“为什么”）。

## 设计亮点与权衡
值得学习的点、作者的意图、可能的替代方案。

## 潜在问题与改进空间
bug、安全隐患、性能瓶颈、可维护性问题、优化建议。

## 学习要点与下一步
提炼 2-4 个最有价值的知识点，并建议我接下来可以深入的方向。`
  },

  code_security: {
    name: "代码安全审计",
    system: `你是一名资深应用安全工程师，精通 OWASP Top 10、CWE、各种语言的常见漏洞模式。请以严谨、安全工程师的视角进行代码审查。`,
    user: `请对以下代码进行全面安全审计，重点关注注入、权限、敏感信息、业务逻辑漏洞等问题：

\`\`\`
$text
\`\`\`

请按以下结构输出（用中文）：
## 高危漏洞
## 中危问题
## 低危/最佳实践建议
## 修复代码示例（关键部分）`
  },

  text_summary: {
    name: "技术文章提炼",
    system: `你是一位优秀的技术编辑，擅长把复杂的技术文章提炼成结构清晰、便于吸收的要点。`,
    user: `请阅读以下技术内容，提炼出核心知识点和可立即应用的实践建议：

$text

输出格式：
## 核心概念（3-6 点）
## 关键洞见
## 立即可做的行动项
## 可能踩的坑 / 注意事项`
  },

  knowledge_card: {
    name: "知识卡片生成",
    system: `你擅长把技术知识转化为适合 Anki / 笔记软件的结构化知识卡片。`,
    user: `请基于以下内容，生成 3-8 张高质量知识卡片（适合长期记忆）：

$text

每张卡片格式：
**正面（问题/概念）**：
**背面（答案/解释）**：`
  },

  add_comments: {
    name: "添加高质量注释",
    system: `你是一位代码可维护性专家，擅长为代码添加解释“为什么”的高质量中文注释。`,
    user: `请为以下代码添加高质量中文注释，重点解释设计意图、关键算法和边界情况。保持代码可直接运行，只增加注释：

\`\`\`
$text
\`\`\`

只返回带注释的完整代码，不要额外解释。`
  },

  bug_analysis: {
    name: "Bug 分析与修复",
    system: `你是一位调试高手，擅长快速定位问题根因并给出最小修复方案。`,
    user: `以下是代码及相关描述，请帮我分析可能存在的 Bug 并给出修复建议：

\`\`\`
$text
\`\`\`

请输出：
## 问题根因分析
## 复现条件（如果可推断）
## 修复方案（推荐）
## 修复后代码（关键部分）`
  }
};

// 获取当前使用的模板
function getActiveTemplate(opts) {
  const preset = opts.presetTemplate || 'code_explainer';
  
  if (preset === 'custom') {
    return {
      system: opts.systemPrompt || '',
      user: opts.userPromptTemplate || '请处理以下内容：\n\n$text'
    };
  }
  
  const template = PRESET_TEMPLATES[preset];
  if (template) {
    return {
      system: template.system,
      user: template.user
    };
  }
  
  // 兜底
  return PRESET_TEMPLATES.code_explainer;
}

// ==================== 服务商与思考参数适配 ====================

// 获取不同服务商的推荐配置
function getProviderDefaults(provider) {
  const map = {
    deepseek: {
      apiUrl: 'https://api.deepseek.com/v1',
      recommendedModels: ['deepseek-reasoner', 'deepseek-chat']
    },
    openai: {
      apiUrl: 'https://api.openai.com/v1',
      recommendedModels: ['o3-mini', 'o1', 'gpt-4o']
    },
    claude: {
      apiUrl: 'https://api.anthropic.com/v1',
      recommendedModels: ['claude-3-7-sonnet-20250219', 'claude-sonnet-4-20250514']
    },
    qwen: {
      apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      recommendedModels: ['qwen3-32b', 'qwq-32b', 'qwen2.5-coder-32b-instruct']
    },
    gemini: {
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      recommendedModels: ['gemini-2.5-pro', 'gemini-2.5-flash']
    },
    ollama: {
      apiUrl: 'http://localhost:11434/v1',
      recommendedModels: ['qwen3:32b', 'deepseek-r1:32b']
    },
    'openai-compatible': {
      apiUrl: '',
      recommendedModels: []
    }
  };
  return map[provider] || map['openai-compatible'];
}

// 根据思考等级构建不同厂商的参数
function buildThinkingParams(provider, level, budgetTokens) {
  // 关闭思考：显式发送 disable 参数，避免模型默认开启
  if (level === 'off') {
    switch (provider) {
      case 'deepseek':
        // DeepSeek 官方文档：thinking.type 默认 enabled，必须显式 disabled
        return { thinking: { type: 'disabled' } };
      case 'claude':
        return { thinking: { type: 'disabled' } };
      case 'qwen':
        return { enable_thinking: false };
      case 'gemini':
        return { thinkingConfig: { includeThoughts: false } };
      default:
        // OpenAI / openai-compatible：不发送 reasoning_effort 即关闭
        return {};
    }
  }

  if (!level || level === 'auto') {
    // auto 模式：开启思考但不指定强度，由模型决定
    switch (provider) {
      case 'deepseek':
        return { thinking: { type: 'enabled' } };
      case 'claude':
        return { thinking: { type: 'enabled' } };
      case 'qwen':
        return { enable_thinking: true };
      case 'gemini':
        return { thinkingConfig: { includeThoughts: true } };
      default:
        return {};
    }
  }

  // 明确指定思考等级
  switch (provider) {
    case 'openai':
      // OpenAI o1/o3/o4 系列：reasoning_effort = low/medium/high
      return { reasoning_effort: level };

    case 'deepseek':
      // DeepSeek 官方：low/medium → high，high → max
      if (level === 'high') {
        return { thinking: { type: 'enabled' }, reasoning_effort: 'max' };
      }
      return { thinking: { type: 'enabled' }, reasoning_effort: 'high' };

    case 'claude':
      // Claude 3.7+ Thinking：用 budget_tokens 控制深度
      const budget = budgetTokens || (level === 'high' ? 16000 : level === 'low' ? 2048 : 4096);
      return {
        thinking: {
          type: 'enabled',
          budget_tokens: Math.min(Math.max(budget, 1024), 64000)
        }
      };

    case 'qwen':
      // Qwen3 / QwQ：用 thinking_budget 控制深度
      const qwenBudget = budgetTokens || (level === 'high' ? 8192 : level === 'low' ? 2048 : 4096);
      return {
        enable_thinking: true,
        thinking_budget: qwenBudget
      };

    case 'gemini':
      // Gemini 2.5：用 thinkingBudget 控制深度
      const geminiBudget = budgetTokens || (level === 'high' ? 24576 : level === 'low' ? 1024 : 8192);
      return {
        thinkingConfig: {
          thinkingBudget: geminiBudget,
          includeThoughts: true
        }
      };

    default:
      // 其他兼容接口尝试 OpenAI 风格
      return { reasoning_effort: level };
  }
}

// 构建最终请求体
function buildRequestBody(provider, messages, opts) {
  const body = {
    model: opts.model,
    messages: messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    stream: opts.stream
  };

  // 合并思考参数
  const thinkingParams = buildThinkingParams(
    provider,
    opts.thinkingLevel,
    opts.thinkingBudget ? parseInt(opts.thinkingBudget) : null
  );

  Object.assign(body, thinkingParams);

  // 特殊处理：Claude 使用不同的字段名（messages 里不能有 system？Anthropic 官方格式不同）
  // 这里我们使用 OpenAI Compatible 格式，大部分代理都支持
  if (provider === 'claude') {
    // 部分 Claude 代理需要把 system 单独拎出来
    // 但为了简化，这里先保持 messages 格式（大多数中转都兼容）
  }

  return body;
}

// 从响应中提取思考内容（不同厂商字段不同）
function extractThinkingFromResponse(provider, data) {
  const choice = data.choices?.[0];
  if (!choice) return null;

  // 1. 标准 OpenAI / DeepSeek 格式
  if (choice.message?.reasoning_content) {
    return choice.message.reasoning_content;
  }

  // 2. 流式中的 delta
  if (choice.delta?.reasoning_content) {
    return choice.delta.reasoning_content;
  }

  // 3. Gemini 格式（通过 OpenAI 兼容层）
  if (choice.message?.thinking || data.candidates?.[0]?.content?.parts) {
    // Gemini 兼容层通常会把思考放在特定字段
    return choice.message?.thinking || null;
  }

  // 4. Qwen 部分实现会把思考放在 reasoning_content
  if (choice.message?.reasoning_content) {
    return choice.message.reasoning_content;
  }

  // 5. Claude（通过中转）
  if (choice.message?.thinking) {
    return choice.message.thinking;
  }

  return null;
}

// 变量替换工具
function replaceVariables(template, query) {
  if (!template) return '';
  
  let result = template;
  
  // 核心变量：用户选中的文本（划词或 OCR 后）
  const text = query.text || query.originalText || '';
  result = result.replace(/\$text/g, text);
  
  // 语言相关变量
  result = result.replace(/\$from/g, query.from || '');
  result = result.replace(/\$to/g, query.to || '');
  result = result.replace(/\$detectFrom/g, query.detectFrom || '');
  result = result.replace(/\$detectTo/g, query.detectTo || '');
  
  // 额外有用的变量
  result = result.replace(/\$date/g, new Date().toISOString().split('T')[0]);
  result = result.replace(/\$time/g, new Date().toLocaleTimeString('zh-CN'));
  
  return result;
}

// 获取用户配置（v0.2.0 新版）
function getOptions() {
  const provider = $option.serviceProvider || 'deepseek';
  const defaults = getProviderDefaults(provider);

  let apiUrl = ($option.apiUrl || defaults.apiUrl || 'https://api.openai.com/v1').replace(/\/$/, '');

  return {
    serviceProvider: provider,
    apiUrl: apiUrl,
    apiKey: $option.apiKey || '',
    model: $option.model || 'deepseek-reasoner',
    presetTemplate: $option.presetTemplate || 'code_explainer',
    thinkingLevel: $option.thinkingLevel || 'medium',
    thinkingBudget: $option.thinkingBudget || '',
    systemPrompt: $option.systemPrompt || '',
    userPromptTemplate: $option.userPromptTemplate || '',
    temperature: parseFloat($option.temperature || '0.3'),
    maxTokens: parseInt($option.maxTokens || '4000'),
    stream: ($option.stream || 'enable') === 'enable'
  };
}

// 默认 System Prompt（当用户未配置时使用）
const DEFAULT_SYSTEM_PROMPT = `你是一位经验丰富的软件工程师和编程导师，专注于帮助开发者深入理解代码和技术概念。

核心原则：
- 始终使用简体中文回答
- 结构化表达：先总结、再拆解、后升华
- 重点突出学习价值和实践要点
- 对代码要解释"为什么这样写"而非仅描述做了什么
- 指出潜在风险、性能问题或改进空间
- 必要时给出最小可运行示例

保持专业、耐心、易懂的语气。`;

// 构建请求 messages（使用内置模板或自定义）
function buildMessages(query, opts) {
  const template = getActiveTemplate(opts);
  
  const messages = [];
  
  const systemContent = (template.system || '').trim();
  if (systemContent) {
    messages.push({ role: 'system', content: systemContent });
  }
  
  const userContent = replaceVariables(template.user, query);
  messages.push({ role: 'user', content: userContent });
  
  return messages;
}

// 流式状态直接挂在 query 对象上（避免模块级变量在 Bob 环境下的生命周期问题）
function getStreamState(query, thinkingLevel) {
  if (!query.__streamState) {
    query.__streamState = {
      fullText: '',
      reasoningText: '',
      finished: false,
      thinkingLevel: thinkingLevel || 'medium'
    };
  }
  return query.__streamState;
}

function processSSEChunk(query, dataStr) {
  const state = getStreamState(query);
  if (state.finished) return;
  
  if (dataStr === '[DONE]') {
    state.finished = true;
    finishStream(query);
    return;
  }
  
  try {
    const chunk = JSON.parse(dataStr);
    const delta = chunk.choices?.[0]?.delta || {};
    
    let hasUpdate = false;
    
    if (delta.content) {
      state.fullText += delta.content;
      hasUpdate = true;
    }
    
    // 支持多种思考字段（关闭思考时跳过）
    if (state.thinkingLevel !== 'off') {
      const thinkingDelta = delta.reasoning_content || delta.thinking || '';
      if (thinkingDelta) {
        state.reasoningText += thinkingDelta;
        hasUpdate = true;
      }
    }
    
    if (hasUpdate) {
      query.onStream({
        toParagraphs: [state.fullText]
      });
    }
  } catch (e) {
    // 忽略无法解析的行（keep-alive、注释等）
  }
}

function finishStream(query) {
  const state = getStreamState(query);
  if (state.finished && !state.fullText && !state.reasoningText) return;
  
  const result = {
    toParagraphs: [state.fullText || '（模型未返回内容）']
  };
  
  if (state.reasoningText) {
    result.thinkInfo = { content: state.reasoningText };
  }
  
  query.onCompletion({ result });
  state.finished = true;
}

// 处理流式响应（兼容 Bob $http 的两种 chunk 下发行为）
function handleStreamResponse(query, opts, resp) {
  const data = resp.data;
  const state = getStreamState(query);
  
  if (typeof data === 'string') {
    // 行为 A：Bob 透传原始 SSE 文本（最常见）
    const lines = data.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const dataStr = trimmed.slice(6).trim();
        processSSEChunk(query, dataStr);
      }
    }
  } else if (data && typeof data === 'object') {
    // 行为 B：Bob 已解析为对象
    const delta = data.choices?.[0]?.delta || {};
    
    if (delta.content) {
      state.fullText += delta.content;
      query.onStream({ toParagraphs: [state.fullText] });
    }
    if (state.thinkingLevel !== 'off') {
      const thinkingDelta = delta.reasoning_content || delta.thinking || '';
      if (thinkingDelta) {
        state.reasoningText += thinkingDelta;
      }
    }
    
    if (data.choices?.[0]?.finish_reason) {
      state.finished = true;
      finishStream(query);
    }
  }
}

// 处理非流式响应
function handleNormalResponse(query, opts, resp) {
  if (resp.error) {
    query.onCompletion({
      error: {
        type: 'unknown',
        message: '网络请求失败: ' + (resp.error.message || resp.error),
        troubleshootingLink: 'https://bobtranslate.com/faq/openai-request-error'
      }
    });
    return;
  }
  
  const data = resp.data;
  
  if (data.error) {
    const errMsg = data.error.message || JSON.stringify(data.error);
    query.onCompletion({
      error: {
        type: data.error.type === 'invalid_request_error' ? 'param' : 'unknown',
        message: 'API 返回错误: ' + errMsg,
        troubleshootingLink: 'https://bobtranslate.com/faq/openai-request-error'
      }
    });
    return;
  }
  
  const choice = data.choices?.[0];
  if (!choice) {
    query.onCompletion({
      error: { type: 'unknown', message: 'API 返回格式异常，无有效 choices' }
    });
    return;
  }
  
  const content = choice.message?.content || '';
  
  const result = {
    toParagraphs: [content || '（模型未返回内容）']
  };
  
  // 关闭思考时不提取 reasoning_content
  if (opts.thinkingLevel !== 'off') {
    const reasoning = extractThinkingFromResponse(opts.serviceProvider, data) || '';
    if (reasoning) {
      result.thinkInfo = { content: reasoning };
    }
  }
  
  query.onCompletion({ result });
}

// 核心翻译/处理函数（v0.2.0 重构）
function translate(query, completion) {
  const opts = getOptions();
  
  // 基础校验
  if (!opts.model) {
    query.onCompletion({
      error: {
        type: 'param',
        message: '请在插件配置中填写模型名称'
      }
    });
    return;
  }
  
  const messages = buildMessages(query, opts);
  const body = buildRequestBody(opts.serviceProvider, messages, opts);

  // 初始化流式状态（传递思考等级，供下游响应处理判断）
  getStreamState(query, opts.thinkingLevel);
  
  // 发起请求
  $http.request({
    method: 'POST',
    url: opts.apiUrl + '/chat/completions',
    header: {
      'Content-Type': 'application/json',
      ...(opts.apiKey ? { 'Authorization': 'Bearer ' + opts.apiKey } : {})
    },
    body: body,
    cancelSignal: query.cancelSignal,
    handler: function(resp) {
      if (opts.stream) {
        handleStreamResponse(query, opts, resp);
      } else {
        handleNormalResponse(query, opts, resp);
      }
    }
  });
}

// 可选：插件配置验证（用户点击"验证"按钮时调用）
function pluginValidate(completion) {
  const opts = getOptions();
  
  if (!opts.model) {
    completion({
      error: {
        type: 'param',
        message: '模型名称不能为空',
        addition: '请填写有效的模型 ID'
      }
    });
    return;
  }
  
  // 尝试发起一个极简请求验证连通性
  const testMessages = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Reply with exactly the word: OK' }
  ];
  
  const testBody = buildRequestBody(opts.serviceProvider, testMessages, {
    model: opts.model,
    temperature: 0,
    maxTokens: 20,
    stream: false,
    thinkingLevel: 'off'
  });
  
  $http.request({
    method: 'POST',
    url: opts.apiUrl + '/chat/completions',
    header: {
      'Content-Type': 'application/json',
      ...(opts.apiKey ? { 'Authorization': 'Bearer ' + opts.apiKey } : {})
    },
    body: testBody,
    handler: function(resp) {
      if (resp.error) {
        completion({
          error: {
            type: 'unknown',
            message: '无法连接到 API: ' + (resp.error.message || resp.error),
            addition: '请检查 API Base URL 和网络连接'
          }
        });
        return;
      }
      
      if (resp.data?.error) {
        completion({
          error: {
            type: 'secretKey',
            message: 'API 返回错误: ' + (resp.data.error.message || ''),
            addition: '请检查 API Key 是否正确，或模型名称是否有效'
          }
        });
        return;
      }
      
      // 验证成功
      completion({ result: true });
    }
  });
}

// 插件超时时间（秒）
function pluginTimeoutInterval() {
  return 180; // 3 分钟，复杂分析任务可能较慢
}

// 导出（Bob 加载插件时会自动识别这些函数）
exports.supportLanguages = supportLanguages;
exports.translate = translate;
exports.pluginValidate = pluginValidate;
exports.pluginTimeoutInterval = pluginTimeoutInterval;
