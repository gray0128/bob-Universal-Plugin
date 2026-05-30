// Bob 通用 AI 处理器插件
// 支持自定义 System Prompt + User Prompt 模板，对选中文本或 OCR 结果进行任意处理

function supportLanguages() {
  // 返回支持的语言，这里返回常见语言即可，实际不强制限制
  return ['auto', 'zh-Hans', 'zh-Hant', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru'];
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

// 获取用户配置
function getOptions() {
  return {
    apiUrl: ($option.apiUrl || 'https://api.openai.com/v1').replace(/\/$/, ''),
    apiKey: $option.apiKey || '',
    model: $option.model || 'gpt-4o-mini',
    systemPrompt: $option.systemPrompt || '',
    userPromptTemplate: $option.userPromptTemplate || '请处理以下内容：\n\n$text',
    temperature: parseFloat($option.temperature || '0.3'),
    maxTokens: parseInt($option.maxTokens || '2000'),
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

// 构建请求 messages
function buildMessages(query, opts) {
  const messages = [];
  
  // System 消息
  const systemContent = opts.systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT;
  messages.push({
    role: 'system',
    content: systemContent
  });
  
  // User 消息（使用模板 + 变量替换）
  const userContent = replaceVariables(opts.userPromptTemplate, query);
  messages.push({
    role: 'user',
    content: userContent
  });
  
  return messages;
}

// 流式状态管理（支持 handler 多次调用的增量模式）
let streamState = null;

function initStreamState(query) {
  streamState = {
    query: query,
    fullText: '',
    reasoningText: '',
    finished: false
  };
}

function processSSEChunk(query, dataStr) {
  if (!streamState || streamState.finished) return;
  
  if (dataStr === '[DONE]') {
    streamState.finished = true;
    finishStream();
    return;
  }
  
  try {
    const chunk = JSON.parse(dataStr);
    const delta = chunk.choices?.[0]?.delta || {};
    
    let hasUpdate = false;
    
    if (delta.content) {
      streamState.fullText += delta.content;
      hasUpdate = true;
    }
    
    if (delta.reasoning_content) {
      streamState.reasoningText += delta.reasoning_content;
      hasUpdate = true;
    }
    
    if (hasUpdate) {
      // 实时流式推送
      const streamResult = {
        toParagraphs: [streamState.fullText]
      };
      // 注意：thinkInfo 只在最终完成时附加更稳定
      query.onStream(streamResult);
    }
  } catch (e) {
    // 忽略无法解析的行（可能是 keep-alive 或注释行）
  }
}

function finishStream() {
  if (!streamState) return;
  
  const result = {
    toParagraphs: [streamState.fullText || '（模型未返回内容）']
  };
  
  if (streamState.reasoningText) {
    result.thinkInfo = {
      content: streamState.reasoningText
    };
  }
  
  streamState.query.onCompletion({ result });
  streamState.finished = true;
}

// 处理流式响应（支持 Bob $http 两种行为：单次完整 / 多次增量）
function handleStreamResponse(query, opts, resp) {
  const data = resp.data;
  
  // 如果是第一次调用，初始化状态
  if (!streamState) {
    initStreamState(query);
  }
  
  // data 可能是字符串（SSE 文本）或对象
  if (typeof data === 'string') {
    // 情况 A：Bob 把 chunk 直接透传（最常见）
    const lines = data.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const dataStr = trimmed.slice(6).trim();
        processSSEChunk(query, dataStr);
      }
    }
  } else if (data && typeof data === 'object') {
    // 情况 B：Bob 已经解析成对象（较少见）
    const delta = data.choices?.[0]?.delta || {};
    
    if (delta.content) {
      streamState.fullText += delta.content;
      query.onStream({ toParagraphs: [streamState.fullText] });
    }
    if (delta.reasoning_content) {
      streamState.reasoningText += delta.reasoning_content;
    }
    
    // 尝试判断是否结束
    if (data.choices?.[0]?.finish_reason) {
      finishStream();
    }
  }
  
  // 注意：最终的 onCompletion 由 [DONE] 或外部 finish 触发
  // 如果 Bob 只调用一次 handler（把全部 SSE 拼好），上面的逻辑也能正确处理
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
  const reasoning = choice.message?.reasoning_content || '';
  
  const result = {
    toParagraphs: [content || '（模型未返回内容）']
  };
  
  if (reasoning) {
    result.thinkInfo = {
      content: reasoning
    };
  }
  
  query.onCompletion({ result });
}

// 核心翻译/处理函数
function translate(query, completion) {
  // 每次新请求重置流式状态
  streamState = null;
  
  const opts = getOptions();
  
  // 基础校验
  if (!opts.model) {
    query.onCompletion({
      error: {
        type: 'param',
        message: '请在插件配置中填写模型名称',
        addition: '例如：gpt-4o-mini、deepseek-chat、qwen2.5-coder:7b'
      }
    });
    return;
  }
  
  // 构建请求体
  const messages = buildMessages(query, opts);
  const body = {
    model: opts.model,
    messages: messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    stream: opts.stream
  };
  
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
        // 流式：resp.data 是拼接好的完整 SSE 文本
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
  
  $http.request({
    method: 'POST',
    url: opts.apiUrl + '/chat/completions',
    header: {
      'Content-Type': 'application/json',
      ...(opts.apiKey ? { 'Authorization': 'Bearer ' + opts.apiKey } : {})
    },
    body: {
      model: opts.model,
      messages: testMessages,
      max_tokens: 10,
      temperature: 0,
      stream: false
    },
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
